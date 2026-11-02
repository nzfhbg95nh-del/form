// Déplacer la bibliothèque vers un nouvel emplacement (un autre disque, par exemple).
//
// On COPIE, on ne supprime JAMAIS : l'ancien dossier reste intact (Victor l'efface lui-même quand il est sûr). Chaque fichier est copié
// sous un nom provisoire puis vérifié (même taille) avant de prendre sa place. Un déplacement interrompu reprend où il s'était arrêté
// (les fichiers déjà copiés, de même taille, sont sautés). Une fois fini, l'appli n'a plus qu'à pointer vers le nouveau dossier.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::layout;

static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

/// On laisse toujours au moins 512 Mo libres sur le disque de destination.
const MARGIN: u64 = 512 * 1024 * 1024;

/// Fichier posé dans le dossier de destination pendant le déplacement : il autorise à reprendre dans un dossier déjà rempli à moitié.
const MARKER: &str = ".deplacement-en-cours";

/// Suffixe des copies en cours.
const TMP_SUFFIX: &str = ".form-tmp";

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub src: PathBuf,
    pub dst: PathBuf,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Progress {
    pub done_files: u64,
    pub total_files: u64,
    pub done_bytes: u64,
    pub total_bytes: u64,
    pub current: String,
}

#[derive(Serialize, Debug, Default)]
pub struct MoveResult {
    /// Fichiers copiés.
    pub copied: u64,
    /// Fichiers déjà présents (même taille), sautés.
    pub skipped: u64,
    pub failed: u64,
    pub bytes: u64,
    /// Les premières erreurs (20 au plus), en français.
    pub errors: Vec<String>,
    pub cancelled: bool,
}

#[derive(Serialize, Debug)]
pub struct MovePreview {
    pub files: u64,
    pub bytes: u64,
    /// Place libre sur le disque de destination.
    pub free: Option<u64>,
    pub ok: bool,
    pub error: Option<String>,
}

// ───────────────────────── Chemins ─────────────────────────

/// Les morceaux d'un chemin, en minuscules (Windows ne distingue pas les majuscules) ; « / » final et « . » ignorés.
fn parts(p: &Path) -> Vec<String> {
    p.components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().to_lowercase()),
            Component::Prefix(s) => Some(s.as_os_str().to_string_lossy().to_lowercase()),
            _ => None,
        })
        .collect()
}

/// `inner` est le même dossier que `outer`, ou se trouve dedans.
pub fn is_same_or_inside(inner: &Path, outer: &Path) -> bool {
    let (a, b) = (parts(inner), parts(outer));
    !b.is_empty() && a.len() >= b.len() && a[..b.len()] == b[..]
}

fn gb(bytes: u64) -> String {
    format!("{:.1}", bytes as f64 / 1_073_741_824.0).replace('.', ",")
}

/// Le nouvel emplacement est-il acceptable ? Il doit être un chemin complet, hors de l'ancien dossier (et ne pas le contenir), et
/// vide ou inexistant, sauf s'il porte la marque d'un déplacement interrompu (on peut alors reprendre).
pub fn check_target(from: &Path, to: &Path) -> Result<(), String> {
    if to.as_os_str().is_empty() || !to.is_absolute() {
        return Err("Choisis un dossier complet (par exemple D:\\Bibliotheque).".into());
    }
    if !from.is_dir() {
        return Err("L'ancien dossier de la bibliothèque est introuvable.".into());
    }
    if is_same_or_inside(to, from) {
        return Err("Le nouvel emplacement ne peut pas être l'ancien dossier ni se trouver dedans.".into());
    }
    if is_same_or_inside(from, to) {
        return Err("Le nouvel emplacement ne peut pas contenir l'ancien dossier.".into());
    }
    if to.exists() {
        if !to.is_dir() {
            return Err("Le nouvel emplacement existe et n'est pas un dossier.".into());
        }
        let empty = std::fs::read_dir(to).map(|mut r| r.next().is_none()).unwrap_or(false);
        if !empty && !to.join(MARKER).exists() {
            return Err("Ce dossier n'est pas vide. Choisis un dossier vide ou qui n'existe pas encore.".into());
        }
    }
    Ok(())
}

/// Les couples (dossier source, dossier de destination) à copier : tout l'ancien dossier, plus les anciens emplacements des images
/// ajoutées, des miniatures et du modèle d'IA (sur le disque C:) quand ils ne sont pas déjà dans l'ancien dossier.
pub fn sources(from: &Path, to: &Path, legacy_added: Option<PathBuf>, legacy_thumbs: Option<PathBuf>, legacy_models: Option<PathBuf>) -> Vec<(PathBuf, PathBuf)> {
    let mut pairs = vec![(from.to_path_buf(), to.to_path_buf())];
    let outside = |p: &PathBuf| !is_same_or_inside(p, from);
    if let Some(a) = legacy_added.filter(outside) {
        pairs.push((a, to.join(layout::ADDED)));
    }
    if let Some(t) = legacy_thumbs.filter(outside) {
        pairs.push((t, to.join(layout::CACHE).join("thumbs")));
    }
    if let Some(m) = legacy_models.filter(outside) {
        pairs.push((m, to.join(layout::CACHE).join("models")));
    }
    pairs
}

/// Tous les fichiers à copier (les dossiers sont parcourus en entier ; les copies provisoires d'un déplacement précédent sont ignorées).
pub fn plan(pairs: &[(PathBuf, PathBuf)]) -> Vec<Item> {
    let mut items = Vec::new();
    for (src_dir, dst_dir) in pairs {
        if !src_dir.is_dir() {
            continue;
        }
        let mut stack = vec![src_dir.clone()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            let mut list: Vec<_> = entries.flatten().collect();
            list.sort_by_key(|e| e.file_name());
            for entry in list {
                let path = entry.path();
                let Ok(kind) = entry.file_type() else { continue };
                if kind.is_dir() {
                    stack.push(path);
                } else if kind.is_file() {
                    if path.to_string_lossy().ends_with(TMP_SUFFIX) {
                        continue;
                    }
                    let Ok(rel) = path.strip_prefix(src_dir) else { continue };
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    items.push(Item { dst: dst_dir.join(rel), src: path, size });
                }
            }
        }
    }
    items
}

/// Place libre sur le disque qui contient `path` (ou son plus proche dossier existant). Windows seulement.
#[cfg(windows)]
pub fn free_space(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(dir: *const u16, available: *mut u64, total: *mut u64, free: *mut u64) -> i32;
    }
    let mut existing = path.to_path_buf();
    while !existing.exists() {
        existing = existing.parent()?.to_path_buf();
    }
    let wide: Vec<u16> = existing.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let (mut available, mut total, mut free) = (0u64, 0u64, 0u64);
    // SAFETY : `wide` se termine par 0 et les trois pointeurs désignent des entiers valides pendant l'appel.
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut free) };
    (ok != 0).then_some(available)
}

#[cfg(not(windows))]
pub fn free_space(_path: &Path) -> Option<u64> {
    None
}

// ───────────────────────── Copie ─────────────────────────

fn tmp_of(dst: &Path) -> PathBuf {
    let mut name = dst.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(TMP_SUFFIX);
    dst.with_file_name(name)
}

/// Copie un fichier et vérifie sa taille. `Ok(true)` : copié ; `Ok(false)` : déjà là, même taille.
fn copy_one(it: &Item) -> Result<bool, String> {
    let want = std::fs::metadata(&it.src).map_err(|e| format!("{} : {e}", it.src.display()))?.len();
    if std::fs::metadata(&it.dst).is_ok_and(|m| m.is_file() && m.len() == want) {
        return Ok(false);
    }
    if let Some(parent) = it.dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{} : {e}", parent.display()))?;
    }
    let tmp = tmp_of(&it.dst);
    if let Err(e) = std::fs::copy(&it.src, &tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("copie de {} : {e}", it.src.display()));
    }
    let got = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
    if got != want {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("taille différente après la copie : {}", it.src.display()));
    }
    std::fs::rename(&tmp, &it.dst).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("{} : {e}", it.dst.display())
    })?;
    // La copie garde la date de l'original (le filtre « Date » de la bibliothèque en dépend).
    if let Ok(modified) = std::fs::metadata(&it.src).and_then(|m| m.modified()) {
        if let Ok(f) = std::fs::OpenOptions::new().write(true).open(&it.dst) {
            let _ = f.set_modified(modified);
        }
    }
    Ok(true)
}

/// Copie tous les fichiers, un par un. `on_progress` est appelé environ tous les 150 ms.
pub fn copy_all(items: &[Item], cancel: &AtomicBool, on_progress: &mut dyn FnMut(&Progress)) -> MoveResult {
    let mut result = MoveResult::default();
    let mut progress = Progress { total_files: items.len() as u64, total_bytes: items.iter().map(|i| i.size).sum(), ..Progress::default() };
    let mut last: Option<Instant> = None;
    for it in items {
        if cancel.load(Ordering::SeqCst) {
            result.cancelled = true;
            break;
        }
        progress.current = it.src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        match copy_one(it) {
            Ok(true) => {
                result.copied += 1;
                result.bytes += it.size;
            }
            Ok(false) => result.skipped += 1,
            Err(e) => {
                result.failed += 1;
                if result.errors.len() < 20 {
                    result.errors.push(e);
                }
            }
        }
        progress.done_files += 1;
        progress.done_bytes += it.size;
        if last.is_none_or(|t| t.elapsed() >= Duration::from_millis(150)) {
            on_progress(&progress);
            last = Some(Instant::now());
        }
    }
    on_progress(&progress);
    result
}

// ───────────────────────── Commandes ─────────────────────────

/// Les anciens emplacements à reprendre : images ajoutées, miniatures et modèle d'IA (sauf si le cache est déjà dans l'ancien dossier).
fn legacy(app: &AppHandle) -> (Option<PathBuf>, Option<PathBuf>, Option<PathBuf>) {
    let added = super::ajouts::dir().filter(|d| d.is_dir());
    if layout::cache_dir().is_some() {
        return (added, None, None);
    }
    (added, layout::default_thumbs_dir(app).ok().filter(|d| d.is_dir()), layout::default_models_dir(app).ok().filter(|d| d.is_dir()))
}

fn preview_of(app: &AppHandle, from: &Path, to: &Path) -> (MovePreview, Vec<Item>) {
    let bad = |error: String| MovePreview { files: 0, bytes: 0, free: None, ok: false, error: Some(error) };
    if let Err(e) = check_target(from, to) {
        return (bad(e), Vec::new());
    }
    let (added, thumbs, models) = legacy(app);
    let items = plan(&sources(from, to, added, thumbs, models));
    let bytes: u64 = items.iter().map(|i| i.size).sum();
    let free = free_space(to);
    // Les fichiers déjà copiés par un déplacement interrompu ne comptent pas de nouveau.
    let still: u64 = items.iter().filter(|i| !std::fs::metadata(&i.dst).is_ok_and(|m| m.len() == i.size)).map(|i| i.size).sum();
    let error = match free {
        Some(f) if f < still + MARGIN => Some(format!("Pas assez de place sur le disque de destination : il faut {} Go (plus une marge de 0,5 Go) et il y en a {}.", gb(still), gb(f))),
        _ => None,
    };
    (MovePreview { files: items.len() as u64, bytes, free, ok: error.is_none(), error }, items)
}

/// Ce que contient la bibliothèque actuelle et la place libre à destination, sans rien copier.
#[tauri::command]
pub async fn library_move_preview(app: AppHandle, from: String, to: String) -> Result<MovePreview, String> {
    tauri::async_runtime::spawn_blocking(move || preview_of(&app, Path::new(&from), Path::new(&to)).0)
        .await
        .map_err(|e| e.to_string())
}

/// Copie la bibliothèque vers `to`. Progression par l'événement « library-move-progress ».
#[tauri::command]
pub async fn library_move(app: AppHandle, from: String, to: String) -> Result<MoveResult, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("Un déplacement est déjà en cours.".into());
    }
    CANCEL.store(false, Ordering::SeqCst);
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let (from, to) = (PathBuf::from(&from), PathBuf::from(&to));
        let (preview, items) = preview_of(&app, &from, &to);
        if !preview.ok {
            return Err(preview.error.unwrap_or_else(|| "Déplacement impossible.".into()));
        }
        std::fs::create_dir_all(&to).map_err(|e| format!("Dossier impossible à créer : {e}"))?;
        std::fs::write(to.join(MARKER), b"Deplacement de la bibliotheque Form en cours : ne pas toucher a ce fichier.").map_err(|e| format!("Écriture impossible dans ce dossier : {e}"))?;
        let result = copy_all(&items, &CANCEL, &mut |p| {
            let _ = app.emit("library-move-progress", p.clone());
        });
        if result.failed == 0 && !result.cancelled {
            layout::ensure_folders(&to).map_err(|e| format!("Dossiers de la bibliothèque impossibles à créer : {e}"))?;
            let _ = std::fs::remove_file(to.join(MARKER));
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string());
    RUNNING.store(false, Ordering::SeqCst);
    outcome?
}

#[tauri::command]
pub fn library_move_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("form-relocate-test-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn write(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    fn silent() -> impl FnMut(&Progress) {
        |_| {}
    }

    #[test]
    fn inside_is_detected_whatever_the_case_or_trailing_slash() {
        assert!(is_same_or_inside(Path::new("C:/A/b"), Path::new("c:/a")));
        assert!(is_same_or_inside(Path::new("C:/A/b/"), Path::new("C:/a/B")));
        assert!(is_same_or_inside(Path::new("C:/a"), Path::new("C:/a")));
        assert!(!is_same_or_inside(Path::new("C:/ab"), Path::new("C:/a")));
        assert!(!is_same_or_inside(Path::new("D:/a"), Path::new("C:/a")));
        assert!(!is_same_or_inside(Path::new("C:/a"), Path::new("C:/a/b")));
    }

    #[test]
    fn target_must_be_outside_and_empty() {
        let from = temp("check-from");
        let base = temp("check-base");
        // Dedans : refusé. Contenant l'ancien : refusé. Le même : refusé.
        assert!(check_target(&from, &from.join("neuf")).is_err());
        assert!(check_target(&from, from.parent().unwrap()).is_err());
        assert!(check_target(&from, &from).is_err());
        // Chemin relatif ou vide : refusé.
        assert!(check_target(&from, Path::new("")).is_err());
        assert!(check_target(&from, Path::new("neuf")).is_err());
        // Dossier qui n'existe pas encore, ou vide : accepté.
        assert!(check_target(&from, &base.join("pas-encore")).is_ok());
        assert!(check_target(&from, &base).is_ok());
        // Non vide : refusé, sauf marque d'un déplacement interrompu.
        write(&base.join("x.txt"), b"x");
        assert!(check_target(&from, &base).is_err());
        write(&base.join(MARKER), b"1");
        assert!(check_target(&from, &base).is_ok());
        // Un fichier à la place d'un dossier : refusé.
        assert!(check_target(&from, &base.join("x.txt")).is_err());
        let _ = std::fs::remove_dir_all(&from);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn old_places_are_added_only_when_outside_the_old_folder() {
        let from = Path::new("C:/Social Saver/Save images");
        let to = Path::new("D:/Bibliotheque");
        let outside = sources(from, to, Some("C:/Docs/Mes ajouts".into()), Some("C:/Local/thumbs".into()), Some("C:/Local/models".into()));
        assert_eq!(outside.len(), 4);
        assert_eq!(outside[1].1, to.join(layout::ADDED));
        assert_eq!(outside[2].1, to.join("cache").join("thumbs"));
        assert_eq!(outside[3].1, to.join("cache").join("models"));
        let inside = sources(from, to, Some("C:/Social Saver/Save images/images ajoutées".into()), None, None);
        assert_eq!(inside.len(), 1, "un dossier déjà dans l'ancien est copié avec lui");
    }

    #[test]
    fn copies_everything_checks_it_and_leaves_the_source_alone() {
        let from = temp("copy-from");
        let to = temp("copy-to").join("Bibliotheque");
        write(&from.join("instagram/auteur/a.jpg"), b"12345");
        write(&from.join("pinterest/tableau/b.mp4"), b"1234567890");
        write(&from.join("_archive.sqlite3"), b"abc");
        let legacy = temp("copy-legacy");
        write(&legacy.join("h.jpg"), b"zz");
        let pairs = sources(&from, &to, Some(legacy.clone()), None, None);
        let items = plan(&pairs);
        assert_eq!(items.len(), 4);
        assert_eq!(items.iter().map(|i| i.size).sum::<u64>(), 5 + 10 + 3 + 2);

        let cancel = AtomicBool::new(false);
        let mut seen = Vec::new();
        let r = copy_all(&items, &cancel, &mut |p| seen.push(p.done_files));
        assert_eq!((r.copied, r.skipped, r.failed, r.cancelled), (4, 0, 0, false));
        assert_eq!(std::fs::read(to.join("instagram/auteur/a.jpg")).unwrap(), b"12345");
        assert_eq!(std::fs::read(to.join("pinterest/tableau/b.mp4")).unwrap(), b"1234567890");
        assert_eq!(std::fs::read(to.join("_archive.sqlite3")).unwrap(), b"abc");
        assert_eq!(std::fs::read(to.join(layout::ADDED).join("h.jpg")).unwrap(), b"zz");
        assert_eq!(*seen.last().unwrap(), 4, "la dernière progression est complète");
        // La source n'a pas bougé, aucun fichier provisoire ne traîne.
        assert!(from.join("instagram/auteur/a.jpg").is_file());
        assert!(plan(&[(to.clone(), PathBuf::from("X:/ignore"))]).iter().all(|i| !i.src.to_string_lossy().ends_with(TMP_SUFFIX)));
        let _ = std::fs::remove_dir_all(&from);
        let _ = std::fs::remove_dir_all(to.parent().unwrap());
        let _ = std::fs::remove_dir_all(&legacy);
    }

    #[test]
    fn a_second_run_skips_what_is_already_there_and_repairs_what_is_not() {
        let from = temp("resume-from");
        let to = temp("resume-to");
        write(&from.join("a.jpg"), b"12345");
        write(&from.join("b.jpg"), b"123");
        let items = plan(&[(from.clone(), to.clone())]);
        let cancel = AtomicBool::new(false);
        let first = copy_all(&items, &cancel, &mut silent());
        assert_eq!(first.copied, 2);
        // Un fichier tronqué par une interruption est refait ; l'autre est sauté.
        write(&to.join("a.jpg"), b"12");
        let second = copy_all(&items, &cancel, &mut silent());
        assert_eq!((second.copied, second.skipped), (1, 1));
        assert_eq!(std::fs::read(to.join("a.jpg")).unwrap(), b"12345");
        let _ = std::fs::remove_dir_all(&from);
        let _ = std::fs::remove_dir_all(&to);
    }

    #[test]
    fn cancelling_stops_before_the_next_file() {
        let from = temp("cancel-from");
        let to = temp("cancel-to");
        write(&from.join("a.jpg"), b"1");
        write(&from.join("b.jpg"), b"2");
        let items = plan(&[(from.clone(), to.clone())]);
        let cancel = AtomicBool::new(true);
        let r = copy_all(&items, &cancel, &mut silent());
        assert!(r.cancelled);
        assert_eq!(r.copied, 0);
        assert!(!to.join("a.jpg").exists());
        let _ = std::fs::remove_dir_all(&from);
        let _ = std::fs::remove_dir_all(&to);
    }

    #[test]
    fn a_missing_source_file_is_reported_without_stopping() {
        let to = temp("missing-to");
        let items = vec![Item { src: PathBuf::from("Z:/n-existe-pas/x.jpg"), dst: to.join("x.jpg"), size: 5 }];
        let cancel = AtomicBool::new(false);
        let r = copy_all(&items, &cancel, &mut silent());
        assert_eq!((r.copied, r.failed), (0, 1));
        assert_eq!(r.errors.len(), 1);
        let _ = std::fs::remove_dir_all(&to);
    }

    #[cfg(windows)]
    #[test]
    fn free_space_is_known_for_an_existing_and_for_a_future_folder() {
        let base = temp("free");
        assert!(free_space(&base).unwrap() > 0);
        assert!(free_space(&base.join("pas/encore/la")).unwrap() > 0);
        let _ = std::fs::remove_dir_all(&base);
    }
}

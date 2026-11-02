// Le dossier « Bibliotheque » : un seul dossier, déplaçable où l'on veut, dont l'appli ne retient que le chemin.
//
//   Bibliotheque\
//     instagram\            enregistrements Instagram (Form / gallery-dl)
//     pinterest\            enregistrements Pinterest
//     images ajoutées\      images ajoutées à la main (anciennement « images ajoutées »)
//     recette\             photos des recettes
//     cache\                miniatures et modèle d'IA (se refont tout seuls si on les perd)
//     _archive.sqlite3      la mémoire de gallery-dl (ne rien retélécharger)
//
// Dans la base, les fichiers ne sont retenus que par leur chemin À L'INTÉRIEUR de ce dossier : on peut donc le déplacer
// puis redonner son nouveau chemin à l'appli, sans rien casser.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tauri::{AppHandle, Manager};

pub const INSTAGRAM: &str = "instagram";
pub const PINTEREST: &str = "pinterest";
pub const ADDED: &str = "images ajoutées";
pub const RECIPES: &str = "recette";
pub const CACHE: &str = "cache";
/// Les copies de sauvegarde de la base de données (une par jour) : elles voyagent avec la bibliothèque.
pub const BACKUPS: &str = "sauvegardes";

/// Les sous-dossiers de la bibliothèque qui ne contiennent PAS d'enregistrements à lire (le scan les saute à la racine).
pub const RESERVED: [&str; 4] = [ADDED, RECIPES, CACHE, BACKUPS];

/// Les dossiers créés dans une bibliothèque (au déplacement). Le cache en fait partie : sa présence suffit à y ranger miniatures et modèle d'IA.
const FOLDERS: [&str; 6] = [INSTAGRAM, PINTEREST, ADDED, RECIPES, CACHE, BACKUPS];

static CACHE_DIR: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Vrai pour un nom de dossier réservé (sans tenir compte des majuscules).
pub fn is_reserved(name: &str) -> bool {
    let lower = name.to_lowercase();
    RESERVED.iter().any(|r| r.to_lowercase() == lower)
}

/// Le dossier de cache choisi (celui de la bibliothèque), s'il y en a un.
pub fn cache_dir() -> Option<PathBuf> {
    CACHE_DIR.read().ok().and_then(|c| c.clone())
}

fn set_cache_dir(p: Option<PathBuf>) {
    if let Ok(mut c) = CACHE_DIR.write() {
        *c = p;
    }
}

fn local_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}

/// Les miniatures : dans le cache de la bibliothèque s'il existe, sinon (comme avant) dans le dossier de données de l'appli.
pub fn thumbs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match cache_dir() {
        Some(c) => Ok(c.join("thumbs")),
        None => default_thumbs_dir(app),
    }
}

/// Le dossier du modèle d'IA (CLIP) : même règle.
pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match cache_dir() {
        Some(c) => Ok(c.join("models")),
        None => default_models_dir(app),
    }
}

/// Anciens emplacements, dans le dossier de données de l'appli (sur le disque C:).
pub fn default_thumbs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(local_data(app)?.join("thumbs"))
}

pub fn default_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(local_data(app)?.join("models"))
}

/// Crée les sous-dossiers d'une bibliothèque (ceux qui existent déjà ne sont pas touchés).
pub fn ensure_folders(root: &Path) -> std::io::Result<()> {
    for f in FOLDERS {
        std::fs::create_dir_all(root.join(f))?;
    }
    Ok(())
}

#[derive(Serialize, Debug, PartialEq)]
pub struct LayoutInfo {
    /// Le dossier existe (un disque débranché ou un dossier déplacé : non).
    pub exists: bool,
    /// Les images ajoutées à la main sont rangées dans « images ajoutées » de la bibliothèque.
    pub added_dir: String,
    /// Le cache (miniatures, modèle d'IA) est dans la bibliothèque ; sinon il reste sur le disque C:.
    pub cache_in_library: bool,
    pub cache_dir: Option<String>,
    /// Le dossier des recettes.
    pub recipes_dir: String,
}

/// Branche l'appli sur une bibliothèque : « images ajoutées » et le cache suivent ce dossier. Un dossier vide ou introuvable
/// laisse les anciens emplacements (Documents\Form\images ajoutées et dossier de données de l'appli).
pub fn apply_root(root: &str) -> LayoutInfo {
    let path = PathBuf::from(root);
    let usable = !root.trim().is_empty() && path.is_dir();
    if usable {
        // Rien n'est créé ici : choisir un dossier ne le modifie pas. Les sous-dossiers naissent au premier usage ou au déplacement.
        // Des images ajoutées dans l'ancien dossier « images ajoutées » restent visibles tant qu'elles n'ont pas été copiées dans « images ajoutées ».
        let added = path.join(ADDED);
        let legacy_has_files = super::ajouts::legacy_dir().is_some_and(|l| std::fs::read_dir(l).is_ok_and(|mut r| r.next().is_some()));
        if added.is_dir() || !legacy_has_files {
            super::ajouts::set_dir(added);
        }
        let cache = path.join(CACHE);
        set_cache_dir(cache.is_dir().then_some(cache));
    } else {
        set_cache_dir(None);
    }
    let cache = cache_dir();
    LayoutInfo {
        exists: usable,
        added_dir: super::ajouts::dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default(),
        cache_in_library: cache.is_some(),
        cache_dir: cache.map(|c| c.to_string_lossy().into_owned()),
        recipes_dir: path.join(RECIPES).to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub fn library_set_root(root: String) -> LayoutInfo {
    apply_root(&root)
}

// ───────────────────────── Dossier « recette » ─────────────────────────
// Chaque recette a son dossier dans « recette » (recette.json, recette.md, photos). Seul ce dossier est accessible par ces commandes.

/// Le chemin complet d'un fichier (ou dossier) de « recette ». Refuse tout ce qui sortirait de « recette » ou viserait un autre dossier.
fn recipe_path(root: &str, rel: &str, allow_folder_itself: bool) -> Result<PathBuf, String> {
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err("Le dossier de la bibliothèque est introuvable.".into());
    }
    let inside = rel.strip_prefix(RECIPES).map(|r| r.strip_prefix('/'));
    let allowed = match inside {
        Some(Some(rest)) => !rest.is_empty(),
        Some(None) => allow_folder_itself && rel == RECIPES,
        None => false,
    };
    if !allowed {
        return Err("Chemin refusé : seul le dossier « recette » est accessible.".into());
    }
    super::trash::safe_path(&root, rel).ok_or_else(|| "Chemin refusé.".to_string())
}

/// Écrit un fichier seulement s'il est différent de l'existant. Passe par un fichier provisoire vérifié (même taille) avant de
/// prendre sa place. `true` : écrit ; `false` : déjà identique.
pub fn write_if_changed(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    if std::fs::read(path).is_ok_and(|existing| existing == bytes) {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Dossier impossible à créer : {e}"))?;
    }
    let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".form-tmp");
    let tmp = path.with_file_name(name);
    std::fs::write(&tmp, bytes).map_err(|e| format!("Écriture impossible : {e}"))?;
    if std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0) != bytes.len() as u64 {
        let _ = std::fs::remove_file(&tmp);
        return Err("Le fichier écrit n'a pas la bonne taille.".into());
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Écriture impossible : {e}")
    })?;
    Ok(true)
}

/// Écrit un fichier (reçu en base64) dans « recette », par exemple `recette/Acuka-1a2b3c4d/photo-1.jpg`. Renvoie `true` s'il a été écrit.
#[tauri::command]
pub fn library_write_file(root: String, rel: String, data: String) -> Result<bool, String> {
    use base64::Engine;
    let path = recipe_path(&root, &rel, false)?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|e| format!("Contenu illisible : {e}"))?;
    write_if_changed(&path, &bytes)
}

/// Lit un fichier texte de « recette ».
#[tauri::command]
pub fn library_read_text(root: String, rel: String) -> Result<String, String> {
    let path = recipe_path(&root, &rel, false)?;
    std::fs::read_to_string(&path).map_err(|e| format!("Lecture impossible : {e}"))
}

/// Ce dossier existe-t-il sur cet ordinateur ? Sert à repérer un chemin retenu sur un autre profil Windows ou un disque débranché.
#[tauri::command]
pub fn library_dir_exists(path: String) -> bool {
    !path.trim().is_empty() && Path::new(&path).is_dir()
}

/// Place libre (en octets) sur le disque qui contient ce chemin.
#[tauri::command]
pub fn library_disk_free(path: String) -> Option<u64> {
    super::relocate::free_space(Path::new(&path))
}

/// `ffmpeg` est-il installé ? C'est facultatif : Form s'en passe pour les miniatures ; seule la lecture du texte écrit dans les vidéos en a besoin.
#[tauri::command]
pub fn system_ffmpeg() -> bool {
    let mut cmd = std::process::Command::new("ffmpeg");
    cmd.arg("-version").stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // pas de fenêtre noire
    }
    cmd.status().is_ok_and(|s| s.success())
}

/// Vrai pour un nom de miniature fait par Form : « 3f/3fa9…c2.jpg » (2 caractères, puis 16 chiffres hexadécimaux qui commencent par les mêmes 2, puis .jpg).
pub fn is_thumb_name(rel: &str) -> bool {
    let b = rel.as_bytes();
    let hex = |s: &[u8]| s.iter().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c));
    b.len() == 23 && rel.ends_with(".jpg") && b[2] == b'/' && hex(&b[..2]) && hex(&b[3..19]) && b[..2] == b[3..5]
}

/// Range une miniature (reçue en base64) dans le dossier des miniatures. Sert aux vidéos : la fenêtre de l'appli lit leur première image
/// (sans ffmpeg) et l'envoie ici. Seul un nom de miniature de Form est accepté.
#[tauri::command]
pub fn library_write_thumb(app: AppHandle, rel: String, data: String) -> Result<bool, String> {
    use base64::Engine;
    if !is_thumb_name(&rel) {
        return Err("Nom de miniature refusé.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|e| format!("Miniature illisible : {e}"))?;
    write_if_changed(&thumbs_dir(&app)?.join(&rel), &bytes)
}

/// Les sous-dossiers d'un dossier de « recette » (rel = « recette » pour la liste des recettes), triés par nom. Vide si le dossier n'existe pas encore.
#[tauri::command]
pub fn library_list_dir(root: String, rel: String) -> Result<Vec<String>, String> {
    let path = recipe_path(&root, &rel, true)?;
    let Ok(entries) = std::fs::read_dir(&path) else { return Ok(Vec::new()) };
    let mut names: Vec<String> = entries.flatten().filter(|e| e.file_type().is_ok_and(|t| t.is_dir())).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    Ok(names)
}
#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("form-layout-test-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn reserved_names_are_recognised_whatever_the_case() {
        assert!(is_reserved("cache"));
        assert!(is_reserved("Recette"));
        assert!(is_reserved("Sauvegardes"));
        assert!(is_reserved("Images Ajoutées"));
        assert!(!is_reserved("instagram"));
        assert!(!is_reserved("pinterest"));
    }

    #[test]
    fn a_file_is_written_only_when_it_changes() {
        let dir = temp("write").join("recette").join("Acuka-1a2b3c4d");
        let file = dir.join("recette.json");
        assert!(write_if_changed(&file, b"{\"a\":1}").unwrap(), "nouveau fichier");
        assert!(!write_if_changed(&file, b"{\"a\":1}").unwrap(), "identique : rien d'écrit");
        assert!(write_if_changed(&file, b"{\"a\":2}").unwrap(), "différent : réécrit");
        assert_eq!(std::fs::read(&file).unwrap(), b"{\"a\":2}");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1, "aucun fichier provisoire ne reste");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap().parent().unwrap());
    }

    #[test]
    fn a_folder_that_does_not_exist_here_is_reported() {
        let dir = temp("exists");
        assert!(library_dir_exists(dir.to_string_lossy().into_owned()));
        assert!(!library_dir_exists(dir.join("pas-la").to_string_lossy().into_owned()));
        assert!(!library_dir_exists("C:\\Users\\ancien-profil\\Documents".into()));
        assert!(!library_dir_exists("".into()));
        assert!(!library_dir_exists("   ".into()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn free_disk_space_is_known_for_an_existing_folder_and_unknown_for_nothing() {
        let dir = temp("free-space");
        assert!(library_disk_free(dir.to_string_lossy().into_owned()).is_some_and(|n| n > 0));
        assert_eq!(library_disk_free("".into()), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_form_thumbnail_names_are_accepted() {
        assert!(is_thumb_name("af/af63dc4c8601ec8c.jpg"));
        assert!(is_thumb_name("cb/cbf29ce484222325.jpg"));
        for bad in ["", "../af63dc4c8601ec8c.jpg", "af/ag63dc4c8601ec8c.jpg", "af/bf63dc4c8601ec8c.jpg", "AF/AF63DC4C8601EC8C.jpg", "af/af63dc4c8601ec8c.png", "af/af63dc4c8601ec8.jpg", "af\\af63dc4c8601ec8c.jpg", "af/af63dc4c8601ec8c.jpg/x", "é/éf63dc4c8601ec8c.jpg", "af/../../x.jpg"] {
            assert!(!is_thumb_name(bad), "{bad} devrait être refusé");
        }
    }

    #[test]
    fn only_the_recipe_folder_is_reachable() {
        let root = temp("reach");
        let r = root.to_string_lossy().into_owned();
        assert!(recipe_path(&r, "recette/Acuka/recette.json", false).is_ok());
        assert!(recipe_path(&r, "recette", true).is_ok());
        for bad in ["recette", "recette/", "instagram/x.jpg", "cache/thumbs/a.jpg", "ajouts/a.jpg", "recette/../instagram/x.jpg", "recette/../../x", "recettes/x", "C:/Windows/x.dll", "/recette/x", ""] {
            assert!(recipe_path(&r, bad, false).is_err(), "{bad} devrait être refusé");
        }
        assert!(recipe_path("Z:/n-existe-pas", "recette/x", false).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn recipe_files_are_written_read_and_listed() {
        let root = temp("roundtrip");
        let r = root.to_string_lossy().into_owned();
        let b64 = |s: &[u8]| {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(s)
        };
        assert_eq!(library_list_dir(r.clone(), "recette".into()).unwrap(), Vec::<String>::new(), "pas encore de dossier : liste vide");
        assert!(library_write_file(r.clone(), "recette/B-recette/recette.json".into(), b64("{\"titre\":\"Crêpes\"}".as_bytes())).unwrap());
        assert!(library_write_file(r.clone(), "recette/A-recette/photo-1.jpg".into(), b64(b"\xff\xd8\xff")).unwrap());
        assert!(!library_write_file(r.clone(), "recette/A-recette/photo-1.jpg".into(), b64(b"\xff\xd8\xff")).unwrap());
        assert_eq!(library_list_dir(r.clone(), "recette".into()).unwrap(), vec!["A-recette".to_string(), "B-recette".to_string()]);
        assert_eq!(library_read_text(r.clone(), "recette/B-recette/recette.json".into()).unwrap(), "{\"titre\":\"Crêpes\"}");
        assert!(library_read_text(r.clone(), "instagram/x.txt".into()).is_err());
        assert!(library_write_file(r.clone(), "recette/x/y.bin".into(), "***pas du base64***".into()).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }
    #[test]
    fn ensure_folders_creates_the_six_folders_and_keeps_existing_files() {
        let root = temp("ensure");
        std::fs::create_dir_all(root.join(INSTAGRAM)).unwrap();
        std::fs::write(root.join(INSTAGRAM).join("a.jpg"), b"x").unwrap();
        ensure_folders(&root).unwrap();
        for f in FOLDERS {
            assert!(root.join(f).is_dir(), "{f} manque");
        }
        assert!(root.join(INSTAGRAM).join("a.jpg").is_file());
        let _ = std::fs::remove_dir_all(&root);
    }
}

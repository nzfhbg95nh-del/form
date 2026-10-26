// « Mes ajouts » : les images que Victor ajoute à la main dans la bibliothèque. Elles sont COPIÉES dans un dossier à elles
// (Documents\Form\Mes ajouts) : le dossier de Social Saver n'est jamais touché. Le nom d'un fichier copié est l'empreinte de son contenu,
// donc la même image ajoutée deux fois ne crée jamais de doublon.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Début du chemin « relatif » d'un fichier de Mes ajouts dans la base (ex. « ajouts/3fa9…c2.jpg »).
pub const PREFIX: &str = "ajouts/";

static DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_dir(p: PathBuf) {
    let _ = DIR.set(p);
}

pub fn dir() -> Option<&'static PathBuf> {
    DIR.get()
}

/// Le chemin complet d'un fichier de la bibliothèque : dans Mes ajouts s'il commence par « ajouts/ », sinon dans le dossier de Social Saver.
pub fn resolve(root: &Path, rel: &str) -> PathBuf {
    if let (Some(rest), Some(d)) = (rel.strip_prefix(PREFIX), DIR.get()) {
        return d.join(rest);
    }
    root.join(rel)
}

#[derive(Serialize, Debug, PartialEq)]
pub struct AddOutcome {
    /// Nom du fichier d'origine.
    pub name: String,
    /// « added » (copié), « duplicate » (déjà là) ou « error ».
    pub status: String,
    pub rel: Option<String>,
    pub error: Option<String>,
}

const MEDIA_EXT: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp", "mp4", "m4v", "mov", "webm"];

fn ext_of(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default()
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn outcome(name: &str, status: &str, rel: Option<String>, error: Option<String>) -> AddOutcome {
    AddOutcome { name: name.to_string(), status: status.to_string(), rel, error }
}

/// Les fichiers images / vidéos d'une liste de chemins ; un dossier est parcouru en entier.
fn expand(paths: &[String]) -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        let mut list: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        list.sort();
        for p in list {
            if p.is_dir() {
                walk(&p, out);
            } else if MEDIA_EXT.contains(&ext_of(&p).as_str()) {
                out.push(p);
            }
        }
    }
    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        if path.is_dir() {
            walk(&path, &mut out);
        } else {
            out.push(path);
        }
    }
    out
}

/// Copie une liste de fichiers (ou de dossiers) dans `dest`, sans doublon.
pub fn add_into(dest: &Path, paths: &[String]) -> Vec<AddOutcome> {
    if let Err(e) = std::fs::create_dir_all(dest) {
        return vec![outcome("", "error", None, Some(format!("Dossier Mes ajouts impossible à créer : {e}")))];
    }
    let mut seen = std::collections::HashSet::new();
    expand(paths)
        .into_iter()
        .map(|src| {
            let name = file_name(&src);
            let ext = ext_of(&src);
            if !MEDIA_EXT.contains(&ext.as_str()) {
                return outcome(&name, "error", None, Some("Format non pris en charge.".into()));
            }
            let sum = match std::fs::File::open(&src).and_then(|mut f| {
                let mut h = Sha256::new();
                std::io::copy(&mut f, &mut h)?;
                Ok(h.finalize())
            }) {
                Ok(s) => hex(&s[..12]),
                Err(e) => return outcome(&name, "error", None, Some(format!("Lecture impossible : {e}"))),
            };
            let stored = format!("{sum}.{ext}");
            let target = dest.join(&stored);
            let rel = format!("{PREFIX}{stored}");
            // La même image deux fois dans le même lot, ou déjà ajoutée avant : un seul exemplaire.
            if !seen.insert(sum) || target.exists() {
                return outcome(&name, "duplicate", Some(rel), None);
            }
            match std::fs::copy(&src, &target) {
                Ok(_) => outcome(&name, "added", Some(rel), None),
                Err(e) => outcome(&name, "error", None, Some(format!("Copie impossible : {e}"))),
            }
        })
        .collect()
}

/// Enregistre une image reçue sous forme d'octets (image collée).
pub fn add_bytes_into(dest: &Path, bytes: &[u8], ext: &str) -> AddOutcome {
    let ext = ext.to_lowercase();
    let name = format!("image collée.{ext}");
    if !MEDIA_EXT.contains(&ext.as_str()) {
        return outcome(&name, "error", None, Some("Format non pris en charge.".into()));
    }
    if let Err(e) = std::fs::create_dir_all(dest) {
        return outcome(&name, "error", None, Some(format!("Dossier Mes ajouts impossible à créer : {e}")));
    }
    let sum = hex(&Sha256::digest(bytes)[..12]);
    let stored = format!("{sum}.{ext}");
    let target = dest.join(&stored);
    let rel = format!("{PREFIX}{stored}");
    if target.exists() {
        return outcome(&name, "duplicate", Some(rel), None);
    }
    match std::fs::write(&target, bytes) {
        Ok(()) => outcome(&name, "added", Some(rel), None),
        Err(e) => outcome(&name, "error", None, Some(format!("Écriture impossible : {e}"))),
    }
}

/// Le dossier Mes ajouts (créé s'il n'existe pas encore).
#[tauri::command]
pub fn ajouts_dir() -> Result<String, String> {
    let d = dir().ok_or("Le dossier Mes ajouts n'est pas encore connu.")?;
    std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn add_images(paths: Vec<String>) -> Result<Vec<AddOutcome>, String> {
    let d = dir().ok_or("Le dossier Mes ajouts n'est pas encore connu.")?.clone();
    tauri::async_runtime::spawn_blocking(move || add_into(&d, &paths)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_image_bytes(data: String, ext: String) -> Result<AddOutcome, String> {
    use base64::Engine;
    let d = dir().ok_or("Le dossier Mes ajouts n'est pas encore connu.")?.clone();
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|e| format!("Image illisible : {e}"))?;
    tauri::async_runtime::spawn_blocking(move || add_bytes_into(&d, &bytes, &ext)).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("form-ajouts-test-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn une_image_est_copiee_une_seule_fois() {
        let src = temp("src");
        let dest = temp("dest");
        std::fs::write(src.join("a.jpg"), b"contenu-image").unwrap();
        std::fs::write(src.join("copie.JPG"), b"contenu-image").unwrap();
        std::fs::write(src.join("b.png"), b"autre").unwrap();
        std::fs::write(src.join("notes.txt"), b"pas une image").unwrap();
        let out = add_into(&dest, &[src.to_string_lossy().into_owned()]);
        let status: Vec<_> = out.iter().map(|o| (o.name.as_str(), o.status.as_str())).collect();
        assert_eq!(status, vec![("a.jpg", "added"), ("b.png", "added"), ("copie.JPG", "duplicate")]);
        assert_eq!(std::fs::read_dir(&dest).unwrap().count(), 2);
        // Un deuxième ajout du même fichier, plus tard : toujours un doublon.
        let again = add_into(&dest, &[src.join("a.jpg").to_string_lossy().into_owned()]);
        assert_eq!(again[0].status, "duplicate");
        let rel = again[0].rel.as_deref().unwrap();
        assert!(rel.starts_with("ajouts/") && rel.ends_with(".jpg"));
    }

    #[test]
    fn une_image_collee_est_enregistree_sans_doublon() {
        let dest = temp("bytes");
        assert_eq!(add_bytes_into(&dest, b"octets", "png").status, "added");
        assert_eq!(add_bytes_into(&dest, b"octets", "png").status, "duplicate");
        assert_eq!(add_bytes_into(&dest, b"octets", "exe").status, "error");
    }

    #[test]
    fn un_fichier_illisible_donne_une_erreur() {
        let dest = temp("err");
        let out = add_into(&dest, &["C:/introuvable/x.jpg".to_string()]);
        assert_eq!(out[0].status, "error");
    }
}

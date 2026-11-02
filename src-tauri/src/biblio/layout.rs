// Le dossier « Bibliothèque Form » : un seul dossier, déplaçable où l'on veut, dont l'appli ne retient que le chemin.
//
//   Bibliothèque Form\
//     instagram\            enregistrements Instagram (Social Saver / gallery-dl)
//     pinterest\            enregistrements Pinterest
//     images ajoutées\      images ajoutées à la main (anciennement « Mes ajouts »)
//     recettes\             photos des recettes
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
pub const RECIPES: &str = "recettes";
pub const CACHE: &str = "cache";

/// Les sous-dossiers de la bibliothèque qui ne contiennent PAS d'enregistrements à lire (le scan les saute à la racine).
pub const RESERVED: [&str; 3] = [ADDED, RECIPES, CACHE];

/// Les dossiers créés dans une bibliothèque (au déplacement). Le cache en fait partie : sa présence suffit à y ranger miniatures et modèle d'IA.
const FOLDERS: [&str; 5] = [INSTAGRAM, PINTEREST, ADDED, RECIPES, CACHE];

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
/// laisse les anciens emplacements (Documents\Form\Mes ajouts et dossier de données de l'appli).
pub fn apply_root(root: &str) -> LayoutInfo {
    let path = PathBuf::from(root);
    let usable = !root.trim().is_empty() && path.is_dir();
    if usable {
        // Rien n'est créé ici : choisir un dossier ne le modifie pas. Les sous-dossiers naissent au premier usage ou au déplacement.
        // Des images ajoutées dans l'ancien dossier « Mes ajouts » restent visibles tant qu'elles n'ont pas été copiées dans « images ajoutées ».
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

const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"];

/// Range une image dans `dir` sous le nom de son empreinte (la même image deux fois ne fait qu'un fichier) et renvoie ce nom.
/// L'écriture passe par un fichier provisoire, vérifié (même taille) avant de prendre sa place.
pub fn store_image_into(dir: &Path, bytes: &[u8], ext: &str) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let sum: String = Sha256::digest(bytes)[..12].iter().map(|b| format!("{b:02x}")).collect();
    let name = format!("{sum}.{ext}");
    std::fs::create_dir_all(dir).map_err(|e| format!("Dossier impossible à créer : {e}"))?;
    let target = dir.join(&name);
    if std::fs::metadata(&target).is_ok_and(|m| m.len() == bytes.len() as u64) {
        return Ok(name);
    }
    let tmp = dir.join(format!("{name}.form-tmp"));
    std::fs::write(&tmp, bytes).map_err(|e| format!("Écriture impossible : {e}"))?;
    if std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0) != bytes.len() as u64 {
        let _ = std::fs::remove_file(&tmp);
        return Err("L'image écrite n'a pas la bonne taille.".into());
    }
    std::fs::rename(&tmp, &target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Écriture impossible : {e}")
    })?;
    Ok(name)
}

/// Range une photo de recette (reçue en base64) dans « recettes » de la bibliothèque. Renvoie son chemin dans la bibliothèque
/// (« recettes/3fa9…c2.jpg »), celui que la base retient : il ne change pas quand on déplace le dossier.
#[tauri::command]
pub fn library_store_image(root: String, data: String, ext: String) -> Result<String, String> {
    use base64::Engine;
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err("Le dossier de la bibliothèque est introuvable.".into());
    }
    let ext = ext.to_lowercase();
    if !IMAGE_EXT.contains(&ext.as_str()) {
        return Err("Format d'image non pris en charge.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|e| format!("Image illisible : {e}"))?;
    let name = store_image_into(&root.join(RECIPES), &bytes, &ext)?;
    Ok(format!("{RECIPES}/{name}"))
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
        assert!(is_reserved("Recettes"));
        assert!(is_reserved("Images Ajoutées"));
        assert!(!is_reserved("instagram"));
        assert!(!is_reserved("pinterest"));
    }

    #[test]
    fn an_image_is_stored_under_its_fingerprint_once() {
        let dir = temp("store").join("recettes");
        let a = store_image_into(&dir, b"photo-1", "jpg").unwrap();
        let b = store_image_into(&dir, b"photo-1", "jpg").unwrap();
        let c = store_image_into(&dir, b"photo-2", "jpg").unwrap();
        assert_eq!(a, b, "la même image donne le même fichier");
        assert_ne!(a, c);
        assert!(a.ends_with(".jpg") && a.len() == 24 + 4);
        assert_eq!(std::fs::read(dir.join(&a)).unwrap(), b"photo-1");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2, "aucun fichier provisoire ne reste");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn a_truncated_copy_is_repaired() {
        let dir = temp("repair").join("recettes");
        let name = store_image_into(&dir, b"0123456789", "png").unwrap();
        std::fs::write(dir.join(&name), b"0123").unwrap();
        assert_eq!(store_image_into(&dir, b"0123456789", "png").unwrap(), name);
        assert_eq!(std::fs::read(dir.join(&name)).unwrap(), b"0123456789");
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn ensure_folders_creates_the_five_folders_and_keeps_existing_files() {
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

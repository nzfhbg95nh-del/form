// Suppression définitive d'une image de la bibliothèque : le fichier part dans la Corbeille Windows (jamais effacé pour de bon),
// où Victor peut encore le récupérer. Seuls les fichiers situés DANS le dossier de la bibliothèque sont acceptés.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize)]
pub struct TrashOutcome {
    rel: String,
    ok: bool,
    error: Option<String>,
}

/// Le chemin complet d'un fichier de la bibliothèque, ou rien s'il sortirait du dossier (chemin absolu, « .. »…).
pub fn safe_path(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel_path = Path::new(rel);
    if rel.is_empty() || rel_path.is_absolute() {
        return None;
    }
    let mut clean = PathBuf::new();
    for part in rel_path.components() {
        match part {
            Component::Normal(p) => clean.push(p),
            _ => return None,
        }
    }
    if clean.as_os_str().is_empty() {
        return None;
    }
    Some(root.join(clean))
}

/// Envoie des fichiers de la bibliothèque dans la Corbeille Windows. Un fichier déjà absent compte comme réussi.
#[tauri::command]
pub fn trash_files(root: String, rels: Vec<String>) -> Vec<TrashOutcome> {
    let root = PathBuf::from(root);
    rels.into_iter()
        .map(|rel| {
            let Some(path) = safe_path(&root, &rel) else {
                return TrashOutcome { rel, ok: false, error: Some("Chemin refusé : hors de la bibliothèque.".to_string()) };
            };
            if !path.exists() {
                return TrashOutcome { rel, ok: true, error: None };
            }
            match trash::delete(&path) {
                Ok(()) => TrashOutcome { rel, ok: true, error: None },
                Err(e) => TrashOutcome { rel, ok: false, error: Some(e.to_string()) },
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_normal_relative_path() {
        let root = Path::new("C:/Social Saver/Save images");
        let p = safe_path(root, "pinterest/DYSARTADD/Art graphic/123.jpg").unwrap();
        assert!(p.starts_with(root));
        assert!(p.ends_with("123.jpg"));
    }

    #[test]
    fn refuses_paths_that_escape_the_library() {
        let root = Path::new("C:/Social Saver/Save images");
        assert!(safe_path(root, "../secret.txt").is_none());
        assert!(safe_path(root, "instagram/../../x.jpg").is_none());
        assert!(safe_path(root, "C:/Windows/system32/x.dll").is_none());
        assert!(safe_path(root, "/etc/passwd").is_none());
        assert!(safe_path(root, "").is_none());
        assert!(safe_path(root, ".").is_none());
    }

    /// Envoie vraiment un fichier de test dans la Corbeille Windows (à lancer à la main : `cargo test -- --ignored`).
    #[test]
    #[ignore]
    fn really_sends_a_file_to_the_recycle_bin() {
        let dir = std::env::temp_dir().join("klippr-trash-test-real");
        std::fs::create_dir_all(dir.join("sous")).unwrap();
        let file = dir.join("sous").join("fichier-de-test-klippr.txt");
        std::fs::write(&file, "test").unwrap();
        let out = trash_files(dir.to_string_lossy().to_string(), vec!["sous/fichier-de-test-klippr.txt".to_string()]);
        assert!(out[0].ok, "{:?}", out[0].error);
        assert!(!file.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_counts_as_done() {
        let dir = std::env::temp_dir().join("klippr-trash-test-missing");
        let out = trash_files(dir.to_string_lossy().to_string(), vec!["nope/absent.jpg".to_string()]);
        assert!(out[0].ok);
    }
}

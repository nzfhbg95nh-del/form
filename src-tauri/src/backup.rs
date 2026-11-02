// Restauration d'une sauvegarde et ménage des anciennes sauvegardes.
//
// Restaurer = remplacer le fichier de la base. On ne peut pas le faire pendant que l'application l'utilise :
// la restauration est donc « préparée » (copie à côté, sous un nom d'attente), puis appliquée au prochain
// démarrage, avant que la base soit ouverte. L'ancienne base n'est jamais supprimée : elle est gardée
// sous le nom `form.avant-restauration-<date>.db`.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

const DB_NAME: &str = "form.db";
const PENDING_NAME: &str = "form.db.restore";
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Dossier des données introuvable : {e}"))
}

/// Vrai si le fichier commence comme une base SQLite (on ne remplace jamais la base par autre chose).
fn is_sqlite_file(path: &Path) -> bool {
    let mut header = [0u8; 16];
    match fs::File::open(path).and_then(|mut f| f.read_exact(&mut header)) {
        Ok(()) => &header == SQLITE_HEADER,
        Err(_) => false,
    }
}

fn seconds_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// À appeler au démarrage, avant l'ouverture de la base : applique une restauration en attente.
pub fn apply_pending_restore(app: &tauri::AppHandle) {
    let Ok(dir) = config_dir(app) else { return };
    let pending = dir.join(PENDING_NAME);
    if !pending.exists() {
        return;
    }
    if !is_sqlite_file(&pending) {
        // Fichier d'attente abîmé : on l'écarte, la base actuelle reste intacte.
        let _ = fs::remove_file(&pending);
        return;
    }
    let db = dir.join(DB_NAME);
    if db.exists() {
        let kept = dir.join(format!("form.avant-restauration-{}.db", seconds_now()));
        // Si on ne peut pas garder l'ancienne base, on ne remplace rien.
        if fs::rename(&db, &kept).is_err() {
            return;
        }
    }
    let _ = fs::remove_file(dir.join("form.db-wal"));
    let _ = fs::remove_file(dir.join("form.db-shm"));
    if fs::rename(&pending, &db).is_err() {
        let _ = fs::copy(&pending, &db).and_then(|_| fs::remove_file(&pending));
    }
}

/// Prépare la restauration d'une sauvegarde choisie par l'utilisateur (appliquée au redémarrage).
#[tauri::command]
pub fn stage_restore(app: tauri::AppHandle, source: String) -> Result<(), String> {
    let source = PathBuf::from(source);
    if !source.is_file() {
        return Err("Ce fichier n'existe pas.".to_string());
    }
    if !is_sqlite_file(&source) {
        return Err("Ce fichier n'est pas une sauvegarde de Form (base de données non reconnue).".to_string());
    }
    let dir = config_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Impossible de préparer la restauration : {e}"))?;
    fs::copy(&source, dir.join(PENDING_NAME))
        .map_err(|e| format!("Impossible de copier la sauvegarde : {e}"))?;
    Ok(())
}

/// Ferme et rouvre l'application (pour appliquer la restauration).
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Dossier de sauvegarde par défaut : « Documents\Form sauvegardes » (créé s'il n'existe pas).
#[tauri::command]
pub fn default_backup_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("Dossier Documents introuvable : {e}"))?
        .join("Form sauvegardes");
    fs::create_dir_all(&dir).map_err(|e| format!("Impossible de créer le dossier de sauvegarde : {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Les dossiers où ranger les sauvegardes, du préféré au dernier recours : « sauvegardes » dans la bibliothèque (elles la suivent quand
/// on la déplace), puis « Documents\Form sauvegardes » si la bibliothèque est introuvable (disque débranché…). Les dossiers sont créés.
pub fn candidate_backup_dirs(library: Option<&str>, documents: Option<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(root) = library.map(str::trim).filter(|r| !r.is_empty()).map(PathBuf::from).filter(|p| p.is_dir()) {
        out.push(root.join(crate::biblio::layout::BACKUPS));
    }
    if let Some(docs) = documents {
        out.push(docs.join("Form sauvegardes"));
    }
    out
}

#[tauri::command]
pub fn backup_dirs(app: tauri::AppHandle, library: Option<String>) -> Result<Vec<String>, String> {
    let dirs: Vec<String> = candidate_backup_dirs(library.as_deref(), app.path().document_dir().ok())
        .into_iter()
        .filter(|d| fs::create_dir_all(d).is_ok())
        .map(|d| d.to_string_lossy().into_owned())
        .collect();
    if dirs.is_empty() {
        return Err("Aucun dossier de sauvegarde possible (bibliothèque et Documents introuvables).".into());
    }
    Ok(dirs)
}

/// Ne garde que les `keep` sauvegardes automatiques les plus récentes du dossier (`form-sauvegarde-*.db`).
/// Seuls ces fichiers sont concernés : rien d'autre n'est jamais supprimé.
#[tauri::command]
pub fn prune_backups(dir: String, keep: usize) -> Result<usize, String> {
    let dir = PathBuf::from(dir);
    if !dir.is_dir() {
        return Ok(0);
    }
    let keep = keep.max(5);
    let mut names: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| format!("Dossier illisible : {e}"))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with("form-sauvegarde-") && name.ends_with(".db"))
        .collect();
    // Les noms contiennent la date (AAAA-MM-JJ) : l'ordre alphabétique est l'ordre chronologique.
    names.sort();
    names.reverse();
    let mut removed = 0;
    for name in names.into_iter().skip(keep) {
        if fs::remove_file(dir.join(&name)).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backups_go_to_the_library_first_then_to_documents() {
        let lib = std::env::temp_dir().join("form-backup-test-lib");
        std::fs::create_dir_all(&lib).unwrap();
        let docs = std::env::temp_dir().join("form-backup-test-docs");
        let dirs = candidate_backup_dirs(Some(lib.to_str().unwrap()), Some(docs.clone()));
        assert_eq!(dirs, vec![lib.join("sauvegardes"), docs.join("Form sauvegardes")]);
        let _ = std::fs::remove_dir_all(&lib);
    }

    #[test]
    fn a_missing_or_empty_library_leaves_only_documents() {
        let docs = std::env::temp_dir().join("form-backup-test-docs2");
        let only = vec![docs.join("Form sauvegardes")];
        assert_eq!(candidate_backup_dirs(None, Some(docs.clone())), only);
        assert_eq!(candidate_backup_dirs(Some("  "), Some(docs.clone())), only);
        assert_eq!(candidate_backup_dirs(Some("Z:\\n-existe-pas-form"), Some(docs)), only);
        assert!(candidate_backup_dirs(None, None).is_empty());
    }
}

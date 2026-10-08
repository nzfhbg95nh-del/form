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

// Ouvre Social Saver (l'appli qui télécharge les enregistrements Instagram et Pinterest dans le dossier d'images) depuis Form.
// Social Saver n'est ni modifié ni déplacé : on le lance seulement, tel qu'il est sur le Bureau.

use std::path::PathBuf;
use tauri::Manager;

/// Le programme `Social Saver\Social Saver.exe` du Bureau, s'il existe.
fn social_saver_exe(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let exe = desktop.join("Social Saver").join("Social Saver.exe");
    if exe.is_file() {
        Ok(exe)
    } else {
        Err("Je ne trouve pas Social Saver sur ton Bureau (dossier « Social Saver », fichier « Social Saver.exe »).".into())
    }
}

#[tauri::command]
pub fn social_saver_open(app: tauri::AppHandle) -> Result<(), String> {
    let exe = social_saver_exe(&app)?;
    let mut command = std::process::Command::new(&exe);
    if let Some(dir) = exe.parent() {
        command.current_dir(dir);
    }
    command.spawn().map(|_| ()).map_err(|e| format!("Impossible d'ouvrir Social Saver : {e}"))
}

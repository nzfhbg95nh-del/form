// Parcours du dossier de Social Saver. LECTURE SEULE : on ne déplace, ne renomme et ne supprime jamais rien.

use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct ScannedFile {
    /// Chemin relatif au dossier choisi, avec des « / » (ex. « instagram/auteur/20260921_xxx_01.jpg »).
    pub rel: String,
    pub size: u64,
    /// Date de modification, en millisecondes.
    pub mtime: i64,
}

const MEDIA_EXT: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp", "mp4", "m4v", "mov", "webm",
];

fn walk(root: &Path, dir: &Path, out: &mut Vec<ScannedFile>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else { continue };
        if file_type.is_dir() {
            walk(root, &path, out);
        } else if file_type.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !MEDIA_EXT.contains(&ext.as_str()) {
                continue;
            }
            let Ok(rel) = path.strip_prefix(root) else { continue };
            let Ok(meta) = entry.metadata() else { continue };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            out.push(ScannedFile {
                rel: rel.to_string_lossy().replace('\\', "/"),
                size: meta.len(),
                mtime,
            });
        }
    }
}

#[tauri::command]
pub async fn scan_folder(root: String) -> Result<Vec<ScannedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&root);
        if !root.is_dir() {
            return Err("Ce dossier est introuvable.".to_string());
        }
        let mut out = Vec::new();
        walk(root, root, &mut out);
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

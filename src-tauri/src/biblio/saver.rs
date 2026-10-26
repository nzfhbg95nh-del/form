// Télécharger mes enregistrements Instagram et mes épingles Pinterest (ce que faisait Social Saver), directement depuis Form.
// Form lance gallery-dl (programme libre, fourni avec l'installateur) avec exactement les mêmes réglages que Social Saver : mêmes dossiers,
// mêmes noms de fichiers, même liste des fichiers déjà téléchargés (`_archive.sqlite3`), mêmes pauses anti-blocage.
// Seuls les nouveaux fichiers sont téléchargés. Form n'utilise jamais de mot de passe : seulement les fichiers cookies.txt exportés par Victor.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);
static CHILD: Mutex<Option<Child>> = Mutex::new(None);

/// Le fichier de réglages de gallery-dl : identique à celui de Social Saver.
pub fn build_config(out_dir: &Path) -> Value {
    json!({
        "extractor": {
            "base-directory": out_dir.to_string_lossy(),
            "sleep-request": [2.0, 5.0],
            "sleep": [0.5, 1.5],
            "retries": 4,
            "archive": out_dir.join("_archive.sqlite3").to_string_lossy(),
            "instagram": {
                "directory": ["instagram", "{username}"],
                "filename": "{date:%Y%m%d}_{shortcode}_{num:>02}.{extension}",
                "videos": true,
                "include": "all"
            },
            "pinterest": {
                "directory": ["pinterest", "{board[owner][username]|'?'}", "{board[name]|'sans-board'}"],
                "filename": "{id}.{extension}",
                "videos": true
            }
        }
    })
}

/// Une ligne que gallery-dl écrit : « # fichier » = déjà présent ; un chemin = nouveau fichier ; « [source][niveau] … » = message.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum LineKind {
    New,
    Skipped,
    Log,
    Empty,
}

pub fn classify_line(line: &str) -> LineKind {
    let t = line.trim();
    if t.is_empty() {
        LineKind::Empty
    } else if line.starts_with("# ") {
        LineKind::Skipped
    } else if t.starts_with('[') {
        LineKind::Log
    } else {
        LineKind::New
    }
}

#[derive(Deserialize, Clone)]
pub struct SaverJob {
    pub url: String,
    /// Fichier cookies.txt de ce site.
    pub cookies: String,
}

#[derive(Serialize, Clone)]
struct LineEvent {
    text: String,
    kind: &'static str,
}

#[derive(Serialize, Clone)]
struct CountEvent {
    new: usize,
    skipped: usize,
}

#[derive(Serialize, Clone)]
struct DoneEvent {
    error: Option<String>,
    stopped: bool,
    new: usize,
    skipped: usize,
}

/// Où se trouve gallery-dl : fourni avec Form (dossier des ressources), ou, pendant le développement, dans `src-tauri/resources`.
fn find_gallery_dl(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("gallery-dl.exe"));
        candidates.push(dir.join("resources").join("gallery-dl.exe"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("gallery-dl.exe"));
            candidates.push(dir.join("resources").join("gallery-dl.exe"));
        }
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("gallery-dl.exe"));
    candidates.into_iter().find(|p| p.is_file())
}

#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

fn read_lines<R: std::io::Read>(reader: R, mut each: impl FnMut(String)) {
    let mut reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(_) => each(String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_string()),
        }
    }
}

fn run(app: &AppHandle, out_dir: PathBuf, jobs: Vec<SaverJob>) -> Result<(usize, usize), String> {
    let exe = find_gallery_dl(app).ok_or("Je ne trouve pas gallery-dl, le programme qui télécharge. Il est fourni avec l'installateur de Form : réinstalle Form.")?;
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("Impossible de créer le dossier de sauvegarde : {e}"))?;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("gallery-dl.conf");
    std::fs::write(&config_path, serde_json::to_string_pretty(&build_config(&out_dir)).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;

    let (mut new, mut skipped) = (0usize, 0usize);
    for job in jobs {
        if STOP.load(Ordering::SeqCst) {
            break;
        }
        let _ = app.emit("saver-line", LineEvent { text: format!("=== {} ===", job.url), kind: "title" });
        let mut cmd = Command::new(&exe);
        cmd.args(["--config-ignore", "--config"]).arg(&config_path).arg("--cookies").arg(&job.cookies).arg(&job.url);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        hide_window(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("Impossible de lancer gallery-dl : {e}"))?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        *CHILD.lock().map_err(|e| e.to_string())? = Some(child);

        // Les messages d'erreur arrivent sur l'autre flux : on les affiche aussi.
        let err_app = app.clone();
        let err_thread = stderr.map(|s| {
            std::thread::spawn(move || {
                read_lines(s, |l| {
                    if !l.trim().is_empty() {
                        let _ = err_app.emit("saver-line", LineEvent { text: l, kind: "log" });
                    }
                })
            })
        });
        if let Some(out) = stdout {
            read_lines(out, |line| match classify_line(&line) {
                LineKind::New => {
                    new += 1;
                    let _ = app.emit("saver-line", LineEvent { text: line, kind: "new" });
                    let _ = app.emit("saver-count", CountEvent { new, skipped });
                }
                LineKind::Skipped => {
                    skipped += 1;
                    if skipped % 25 == 0 {
                        let _ = app.emit("saver-count", CountEvent { new, skipped });
                    }
                }
                LineKind::Log => {
                    let _ = app.emit("saver-line", LineEvent { text: line, kind: "log" });
                }
                LineKind::Empty => {}
            });
        }
        if let Some(t) = err_thread {
            let _ = t.join();
        }
        if let Some(mut child) = CHILD.lock().map_err(|e| e.to_string())?.take() {
            let _ = child.wait();
        }
        let _ = app.emit("saver-count", CountEvent { new, skipped });
    }
    Ok((new, skipped))
}

/// Lance les téléchargements (un site après l'autre), en arrière-plan. Événements : « saver-line », « saver-count », « saver-done ».
#[tauri::command]
pub fn saver_start(app: AppHandle, out_dir: String, jobs: Vec<SaverJob>) -> Result<bool, String> {
    if jobs.is_empty() {
        return Err("Rien à télécharger : coche au moins une source.".into());
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    STOP.store(false, Ordering::SeqCst);
    std::thread::spawn(move || {
        let result = run(&app, PathBuf::from(out_dir), jobs);
        RUNNING.store(false, Ordering::SeqCst);
        let stopped = STOP.swap(false, Ordering::SeqCst);
        let event = match result {
            Ok((new, skipped)) => DoneEvent { error: None, stopped, new, skipped },
            Err(e) => DoneEvent { error: Some(e), stopped, new: 0, skipped: 0 },
        };
        let _ = app.emit("saver-done", event);
    });
    Ok(true)
}

/// Arrête le téléchargement en cours (les fichiers déjà reçus restent ; au prochain lancement, on reprend où on s'était arrêté).
#[tauri::command]
pub fn saver_stop() {
    STOP.store(true, Ordering::SeqCst);
    if let Ok(mut guard) = CHILD.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
        }
    }
}

#[derive(Serialize, Default)]
pub struct SaverDefaults {
    pub ig_user: Option<String>,
    pub pin_url: Option<String>,
    pub do_ig: Option<bool>,
    pub do_pin: Option<bool>,
    pub ig_cookies: Option<String>,
    pub pin_cookies: Option<String>,
}

/// Les réglages de Social Saver sur le Bureau (lecture seule) pour préremplir Form : pseudo, lien Pinterest, fichiers de cookies.
#[tauri::command]
pub fn saver_defaults(app: AppHandle) -> SaverDefaults {
    let Ok(desktop) = app.path().desktop_dir() else { return SaverDefaults::default() };
    let folder = desktop.join("Social Saver");
    let text = |v: &Value, key: &str| v.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let json: Value = std::fs::read_to_string(folder.join("settings.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null);
    let existing = |p: PathBuf| p.is_file().then(|| p.to_string_lossy().to_string());
    // Le fichier de cookies du site : celui indiqué dans les réglages s'il correspond, sinon celui rangé dans le dossier de Social Saver.
    let cookies_for = |site: &str| {
        text(&json, "cookies").filter(|c| c.contains(site) && Path::new(c).is_file()).or_else(|| existing(folder.join(format!("www.{site}.com_cookies.txt"))))
    };
    SaverDefaults {
        ig_user: text(&json, "ig_user"),
        pin_url: text(&json, "pin_url"),
        do_ig: json.get("do_ig").and_then(Value::as_bool),
        do_pin: json.get("do_pin").and_then(Value::as_bool),
        ig_cookies: cookies_for("instagram"),
        pin_cookies: cookies_for("pinterest"),
    }
}

/// Ancienneté (en jours) du fichier de cookies, ou rien s'il n'existe pas : les cookies expirent, Form prévient quand ils sont vieux.
#[tauri::command]
pub fn saver_file_age_days(path: String) -> Option<u64> {
    let modified = std::fs::metadata(&path).ok()?.modified().ok()?;
    Some(std::time::SystemTime::now().duration_since(modified).ok()?.as_secs() / 86_400)
}

// ───────────────────────── Images d'un lien (moodboard) ─────────────────────────
// Un tableau Pinterest ou un post Instagram est téléchargé dans un dossier TEMPORAIRE (jamais dans la bibliothèque), avec les mêmes pauses
// que Social Saver, puis Form lit les images, les pose sur la toile et efface le dossier.

/// Les réglages de gallery-dl pour un import dans un moodboard : tout à plat dans un dossier, sans liste d'archive (on re-télécharge à chaque fois),
/// sans les vidéos (une toile de moodboard n'accueille que des images).
pub fn build_import_config(dir: &Path) -> Value {
    json!({
        "extractor": {
            "base-directory": dir.to_string_lossy(),
            "sleep-request": [2.0, 5.0],
            "sleep": [0.5, 1.5],
            "retries": 4,
            "instagram": { "directory": [], "filename": "{shortcode}_{num:>02}.{extension}", "videos": false },
            "pinterest": { "directory": [], "filename": "{id}.{extension}", "videos": false }
        }
    })
}

#[derive(Serialize)]
pub struct LinkFetch {
    pub dir: String,
    pub files: Vec<String>,
}

#[derive(Serialize, Clone)]
struct LinkCount {
    count: usize,
}

fn import_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("link-import"))
}

/// Libère le « téléchargement en cours » quoi qu'il arrive (erreur, arrêt).
struct RunGuard;
impl Drop for RunGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
        if let Ok(mut c) = CHILD.lock() {
            *c = None;
        }
    }
}

fn fetch_link(app: &AppHandle, url: &str, cookies: Option<&str>, limit: u32) -> Result<LinkFetch, String> {
    let exe = find_gallery_dl(app).ok_or("Je ne trouve pas gallery-dl, le programme qui télécharge. Il est fourni avec l'installateur de Form : réinstalle Form.")?;
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("Un téléchargement est déjà en cours.".into());
    }
    let _guard = RunGuard;
    STOP.store(false, Ordering::SeqCst);
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let root = import_root(app)?;
    let dir = root.join(stamp.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| format!("Impossible de créer le dossier temporaire : {e}"))?;
    let conf = root.join(format!("{stamp}.conf"));
    std::fs::write(&conf, serde_json::to_string_pretty(&build_import_config(&dir)).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&exe);
    cmd.args(["--config-ignore", "--config"]).arg(&conf);
    if let Some(c) = cookies.filter(|c| !c.trim().is_empty() && Path::new(c).is_file()) {
        cmd.arg("--cookies").arg(c);
    }
    cmd.arg("--range").arg(format!("1-{}", limit.max(1))).arg(url);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Impossible de lancer gallery-dl : {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *CHILD.lock().map_err(|e| e.to_string())? = Some(child);

    let log: std::sync::Arc<Mutex<Vec<String>>> = std::sync::Arc::new(Mutex::new(Vec::new()));
    let err_log = log.clone();
    let err_thread = stderr.map(|s| {
        std::thread::spawn(move || {
            read_lines(s, |l| {
                if !l.trim().is_empty() {
                    if let Ok(mut v) = err_log.lock() {
                        v.push(l);
                    }
                }
            })
        })
    });
    let mut count = 0usize;
    if let Some(out) = stdout {
        read_lines(out, |line| {
            if classify_line(&line) == LineKind::New {
                count += 1;
                let _ = app.emit("linkimport-count", LinkCount { count });
            } else if classify_line(&line) == LineKind::Log {
                if let Ok(mut v) = log.lock() {
                    v.push(line);
                }
            }
        });
    }
    if let Some(t) = err_thread {
        let _ = t.join();
    }
    if let Some(mut child) = CHILD.lock().map_err(|e| e.to_string())?.take() {
        let _ = child.wait();
    }
    let _ = std::fs::remove_file(&conf);
    let stopped = STOP.swap(false, Ordering::SeqCst);

    let mut files: Vec<String> = std::fs::read_dir(&dir)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_file()).map(|p| p.to_string_lossy().to_string()).collect())
        .unwrap_or_default();
    files.sort();
    if files.is_empty() {
        let _ = std::fs::remove_dir_all(&dir);
        if stopped {
            return Err("Arrêté.".into());
        }
        let last = log.lock().ok().and_then(|v| v.iter().rev().find(|l| l.contains("error") || l.contains("Error") || l.contains("warning")).cloned().or_else(|| v.last().cloned()));
        return Err(match last {
            Some(l) => format!("Aucune image reçue. gallery-dl dit : {l}"),
            None => "Aucune image reçue : vérifie le lien (et tes cookies pour Instagram).".to_string(),
        });
    }
    Ok(LinkFetch { dir: dir.to_string_lossy().to_string(), files })
}

/// Télécharge dans un dossier temporaire les images d'un tableau Pinterest ou d'un post Instagram (au plus `limit`). Événement : « linkimport-count ».
#[tauri::command]
pub async fn link_fetch(app: AppHandle, url: String, cookies: Option<String>, limit: u32) -> Result<LinkFetch, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_link(&app, &url, cookies.as_deref(), limit)).await.map_err(|e| e.to_string())?
}

/// Efface le dossier temporaire d'un import (seulement un dossier de `link-import`, jamais ailleurs).
#[tauri::command]
pub fn link_cleanup(app: AppHandle, dir: String) -> Result<(), String> {
    let root = import_root(&app)?;
    let target = PathBuf::from(&dir);
    let inside = target.canonicalize().ok().zip(root.canonicalize().ok()).map(|(t, r)| t.starts_with(r) && t != root.canonicalize().unwrap_or_default()).unwrap_or(false);
    if !inside {
        return Err("Dossier refusé : ce n'est pas un dossier d'import.".into());
    }
    std::fs::remove_dir_all(&target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_config_matches_social_saver() {
        let c = build_config(Path::new("C:/Social Saver/Save images"));
        let e = &c["extractor"];
        assert_eq!(e["sleep-request"], json!([2.0, 5.0]));
        assert_eq!(e["sleep"], json!([0.5, 1.5]));
        assert_eq!(e["retries"], 4);
        assert!(e["archive"].as_str().unwrap().ends_with("_archive.sqlite3"));
        assert_eq!(e["instagram"]["directory"], json!(["instagram", "{username}"]));
        assert_eq!(e["instagram"]["filename"], "{date:%Y%m%d}_{shortcode}_{num:>02}.{extension}");
        assert_eq!(e["pinterest"]["directory"][2], "{board[name]|'sans-board'}");
        assert_eq!(e["pinterest"]["filename"], "{id}.{extension}");
    }

    #[test]
    fn the_import_config_is_flat_without_archive_or_videos() {
        let c = build_import_config(Path::new("C:/tmp/imp"));
        let e = &c["extractor"];
        assert_eq!(e["instagram"]["directory"], json!([]));
        assert_eq!(e["instagram"]["videos"], false);
        assert_eq!(e["pinterest"]["directory"], json!([]));
        assert!(e.get("archive").is_none());
        assert_eq!(e["sleep-request"], json!([2.0, 5.0]));
    }

    #[test]
    fn lines_are_told_apart() {
        assert_eq!(classify_line("# C:\\Save images\\instagram\\x\\a.jpg"), LineKind::Skipped);
        assert_eq!(classify_line("C:\\Save images\\instagram\\x\\b.jpg"), LineKind::New);
        assert_eq!(classify_line("[instagram][warning] quelque chose"), LineKind::Log);
        assert_eq!(classify_line("  "), LineKind::Empty);
    }
}

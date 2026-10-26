// Miniatures, générées en arrière-plan dans le dossier de données de Klippr (jamais à côté des originaux).
// Images : bibliothèque « image ». Vidéos (et images que « image » ne sait pas lire, comme HEIC) : ffmpeg, s'il est installé.

use image::{codecs::jpeg::JpegEncoder, DynamicImage, ImageDecoder, ImageReader};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter, Manager};

const THUMB_W: u32 = 400;
const THUMB_MAX_H: u32 = 2000;
const BATCH: usize = 64;

static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize)]
pub struct ThumbJob {
    pub rel: String,
    pub kind: String,
}

#[derive(Serialize, Clone)]
struct ThumbResult {
    rel: String,
    thumb: String,
    w: u32,
    h: u32,
    duration: Option<f64>,
    ok: bool,
}

#[derive(Serialize, Clone)]
struct ThumbBatch {
    results: Vec<ThumbResult>,
    done: usize,
    total: usize,
}

/// Nom de miniature stable : dérivé du chemin relatif (FNV-1a 64 bits), rangé dans un sous-dossier de 2 caractères.
fn thumb_name(rel: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in rel.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    let hex = format!("{:016x}", h);
    format!("{}/{}.jpg", &hex[..2], hex)
}

fn dir_of(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("thumbs"))
}

#[tauri::command]
pub fn thumbs_dir(app: AppHandle) -> Result<String, String> {
    Ok(dir_of(&app)?.to_string_lossy().to_string())
}

fn make_image(src: &Path, out: &Path) -> Result<(u32, u32), String> {
    let reader = ImageReader::open(src)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().ok();
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    let (w, h) = (img.width(), img.height());
    let small = if w > THUMB_W || h > THUMB_MAX_H { img.thumbnail(THUMB_W, THUMB_MAX_H) } else { img };
    let file = std::fs::File::create(out).map_err(|e| e.to_string())?;
    let mut writer = std::io::BufWriter::new(file);
    JpegEncoder::new_with_quality(&mut writer, 82)
        .encode_image(&small.to_rgb8())
        .map_err(|e| e.to_string())?;
    Ok((w, h))
}

#[cfg(windows)]
fn quiet(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000) // pas de fenêtre noire
}
#[cfg(not(windows))]
fn quiet(cmd: &mut Command) -> &mut Command {
    cmd
}

/// Durée lue dans la sortie d'erreur de ffmpeg (« Duration: 00:00:12.34 »).
fn parse_duration(stderr: &str) -> Option<f64> {
    let rest = stderr.split("Duration: ").nth(1)?;
    let t = rest.split(',').next()?.trim();
    let mut parts = t.split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let s: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn ffmpeg_frame(src: &Path, out: &Path, seek: Option<&str>) -> Option<String> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-hide_banner"]);
    if let Some(s) = seek {
        cmd.args(["-ss", s]);
    }
    cmd.arg("-i").arg(src);
    cmd.args(["-frames:v", "1", "-vf", &format!("scale={}:-2", THUMB_W), "-q:v", "4"]).arg(out);
    let output = quiet(&mut cmd).output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if out.exists() && std::fs::metadata(out).map(|m| m.len() > 0).unwrap_or(false) {
        Some(stderr)
    } else {
        None
    }
}

/// HEIC (photos d'iPhone) : Windows sait les lire grâce à son extension « HEIF » ; on lui demande une miniature JPEG par PowerShell.
/// Rend la taille de la miniature, ou une erreur si l'extension n'est pas installée.
fn make_heic_windows(src: &Path, out: &Path) -> Result<(u32, u32), String> {
    let script = format!(
        "Add-Type -AssemblyName PresentationCore;          $d=[System.Windows.Media.Imaging.BitmapDecoder]::Create([Uri]$env:KLIPPR_SRC,'None','OnLoad'); $f=$d.Frames[0];          $s=[Math]::Min(1.0,{w}.0/$f.PixelWidth);          $t=New-Object System.Windows.Media.Imaging.TransformedBitmap($f,(New-Object System.Windows.Media.ScaleTransform($s,$s)));          $e=New-Object System.Windows.Media.Imaging.JpegBitmapEncoder; $e.QualityLevel=85;          $e.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($t));          $fs=[IO.File]::Create($env:KLIPPR_OUT); $e.Save($fs); $fs.Close()",
        w = THUMB_W
    );
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]).env("KLIPPR_SRC", src).env("KLIPPR_OUT", out);
    let ok = quiet(&mut cmd).output().map(|o| o.status.success()).unwrap_or(false);
    if !ok || !out.exists() {
        return Err("HEIC illisible (extension HEIF de Windows absente ?)".to_string());
    }
    image::image_dimensions(out).map_err(|e| e.to_string())
}

/// Retourne (largeur, hauteur, durée). Pour une vidéo, largeur et hauteur sont celles de la miniature (seul le rapport compte).
fn make_video(src: &Path, out: &Path) -> Result<(u32, u32, Option<f64>), String> {
    let stderr = ffmpeg_frame(src, out, Some("0.5"))
        .or_else(|| ffmpeg_frame(src, out, None))
        .ok_or_else(|| "ffmpeg indisponible ou vidéo illisible".to_string())?;
    let (w, h) = image::image_dimensions(out).map_err(|e| e.to_string())?;
    Ok((w, h, parse_duration(&stderr)))
}

fn make_one(root: &Path, dir: &Path, job: &ThumbJob) -> ThumbResult {
    let thumb = thumb_name(&job.rel);
    let src = super::ajouts::resolve(root, &job.rel);
    let out = dir.join(&thumb);
    if let Some(parent) = out.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let result = if job.kind == "video" {
        make_video(&src, &out)
    } else {
        make_image(&src, &out)
            .map(|(w, h)| (w, h, None))
            // HEIC et autres formats : on tente ffmpeg, puis la lecture HEIC de Windows
            .or_else(|_| make_video(&src, &out))
            .or_else(|_| make_heic_windows(&src, &out).map(|(w, h)| (w, h, None)))
    };
    match result {
        Ok((w, h, duration)) => ThumbResult { rel: job.rel.clone(), thumb, w, h, duration, ok: true },
        Err(_) => ThumbResult { rel: job.rel.clone(), thumb: String::new(), w: 0, h: 0, duration: None, ok: false },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumb_name_is_stable_and_spread() {
        let a = thumb_name("instagram/x/20260101_AAAAAAAAAAA_01.jpg");
        assert_eq!(a, thumb_name("instagram/x/20260101_AAAAAAAAAAA_01.jpg"));
        assert_ne!(a, thumb_name("instagram/x/20260101_AAAAAAAAAAA_02.jpg"));
        assert!(a.ends_with(".jpg") && a.as_bytes()[2] == b'/');
    }

    #[test]
    fn duration_is_read_from_ffmpeg_output() {
        let log = "  Duration: 00:01:02.50, start: 0.000000, bitrate: 900 kb/s";
        assert_eq!(parse_duration(log), Some(62.5));
        assert_eq!(parse_duration("rien"), None);
    }

    #[test]
    fn big_image_gets_a_small_thumbnail_and_keeps_original_size() {
        let dir = std::env::temp_dir().join("klippr-test-thumbs");
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("big.png");
        image::RgbImage::from_pixel(1600, 900, image::Rgb([200, 30, 30])).save(&src).unwrap();
        let out = dir.join("big.jpg");
        let (w, h) = make_image(&src, &out).unwrap();
        assert_eq!((w, h), (1600, 900));
        assert_eq!(image::image_dimensions(&out).unwrap(), (400, 225));
    }

    #[test]
    fn small_image_is_not_enlarged() {
        let dir = std::env::temp_dir().join("klippr-test-thumbs");
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("small.png");
        image::RgbImage::from_pixel(120, 80, image::Rgb([10, 10, 200])).save(&src).unwrap();
        let out = dir.join("small.jpg");
        make_image(&src, &out).unwrap();
        assert_eq!(image::image_dimensions(&out).unwrap(), (120, 80));
    }

    /// Test sur une vraie photo HEIC de la bibliothèque (lecture seule) : à lancer à la main, `cargo test heic -- --ignored`.
    #[test]
    #[ignore]
    fn real_heic_gets_a_thumbnail_through_windows() {
        let src = std::path::Path::new(r"C:\Users\noesa\Desktop\Social Saver\Save images\pinterest\DYSARTADD\Architecture & Interior design\646336984065767432.heic");
        let out = std::env::temp_dir().join("klippr-test-thumbs").join("heic.jpg");
        std::fs::create_dir_all(out.parent().unwrap()).unwrap();
        let (w, h) = make_heic_windows(src, &out).unwrap();
        assert!(w <= 400 && w > 100 && h > w, "{w}x{h}");
    }

    #[test]
    fn unreadable_file_fails_cleanly() {
        let dir = std::env::temp_dir().join("klippr-test-thumbs");
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("broken.jpg");
        std::fs::write(&src, b"pas une image").unwrap();
        assert!(make_image(&src, &dir.join("broken-out.jpg")).is_err());
    }
}

/// Lance la génération en arrière-plan et rend la main tout de suite. Avancement : événements « thumbs-batch » puis « thumbs-done ».
#[tauri::command]
pub fn start_thumbs(app: AppHandle, root: String, jobs: Vec<ThumbJob>) -> Result<bool, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    let dir = dir_of(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| {
        RUNNING.store(false, Ordering::SeqCst);
        e.to_string()
    })?;
    std::thread::spawn(move || {
        let total = jobs.len();
        let done = AtomicUsize::new(0);
        let root = PathBuf::from(root);
        // On laisse quelques cœurs libres pour que l'interface reste fluide.
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        let threads = cores.saturating_sub(2).max(2);
        if let Ok(pool) = rayon::ThreadPoolBuilder::new().num_threads(threads).build() {
            // Les lots se suivent dans l'ordre demandé (les plus récents d'abord) ; le travail est réparti dans chaque lot.
            for chunk in jobs.chunks(BATCH) {
                let results: Vec<ThumbResult> = pool.install(|| chunk.par_iter().map(|j| make_one(&root, &dir, j)).collect());
                let n = done.fetch_add(chunk.len(), Ordering::SeqCst) + chunk.len();
                let _ = app.emit("thumbs-batch", ThumbBatch { results, done: n, total });
            }
        }
        RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("thumbs-done", ());
    });
    Ok(true)
}

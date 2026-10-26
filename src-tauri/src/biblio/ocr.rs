// Lecture du texte affiché dans les vidéos (ingrédients d'une recette, étapes…), par la lecture de texte intégrée à Windows.
// Quelques images de chaque vidéo sont extraites avec ffmpeg, puis lues par un script PowerShell (une seule fois par lot).
// Tout reste sur le PC.

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

static RUNNING: AtomicBool = AtomicBool::new(false);

/// Vidéos traitées d'un coup (une seule ouverture de PowerShell par lot).
const BATCH: usize = 16;

const SCRIPT: &str = r#"param([string]$list)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('fr-FR'))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if (-not $engine) { exit 3 }
foreach ($line in [IO.File]::ReadAllLines($list, [System.Text.Encoding]::UTF8)) {
  $p = $line.Split("`t")
  $text = ''
  try {
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p[1])) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $text = ($res.Text -replace '\s+', ' ').Trim()
  } catch { $text = '' }
  Write-Output ("{0}`t{1}" -f $p[0], $text)
}
"#;

#[derive(Deserialize)]
pub struct OcrJob {
    pub rel: String,
    pub duration: Option<f64>,
    /// Une image toutes les `every` secondes (lecture détaillée, pour les recettes) au lieu de trois images.
    pub every: Option<f64>,
}

#[derive(Serialize, Clone)]
struct OcrResult {
    rel: String,
    text: String,
}

#[derive(Serialize, Clone)]
struct OcrBatch {
    results: Vec<OcrResult>,
    done: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
struct OcrEnd {
    error: Option<String>,
    seconds: f64,
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

/// Les instants (en secondes) où l'on regarde la vidéo : début, milieu, fin (durée inconnue : 1, 3 et 6 s).
pub fn frame_times(duration: Option<f64>, every: Option<f64>) -> Vec<f64> {
    if let (Some(step), Some(d)) = (every, duration) {
        let step = step.max(0.5);
        let mut out = Vec::new();
        let mut t = 0.8;
        while t < d - 0.3 && out.len() < 45 {
            out.push(t);
            t += step;
        }
        if !out.is_empty() {
            return out;
        }
    }
    match duration {
        Some(d) if d > 4.0 => vec![(d * 0.15).max(0.5), d * 0.5, d * 0.85],
        Some(d) if d > 1.0 => vec![d * 0.3, d * 0.7],
        Some(_) => vec![0.1],
        None => vec![1.0, 3.0, 6.0],
    }
}

fn extract_frame(src: &Path, out: &Path, at: f64) -> bool {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-hide_banner", "-loglevel", "error", "-ss", &format!("{at:.2}"), "-i"]).arg(src);
    cmd.args(["-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3"]).arg(out);
    quiet(&mut cmd).output().is_ok() && out.exists() && std::fs::metadata(out).map(|m| m.len() > 0).unwrap_or(false)
}

/// Fusionne les textes des images d'une vidéo : chaque phrase n'apparaît qu'une fois, dans l'ordre.
pub fn merge_texts(texts: &[String]) -> String {
    let mut seen: Vec<String> = Vec::new();
    for t in texts {
        let t = t.trim();
        if t.len() >= 3 && !seen.iter().any(|s| s == t) {
            seen.push(t.to_string());
        }
    }
    seen.join(" · ")
}

fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("ocr-tmp");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn run(app: &AppHandle, root: &Path, jobs: Vec<OcrJob>) -> Result<(), String> {
    let dir = work_dir(app)?;
    let script = dir.join("ocr.ps1");
    // Le script est écrit avec un « BOM » pour que PowerShell 5 lise bien les accents.
    std::fs::write(&script, format!("\u{feff}{SCRIPT}")).map_err(|e| e.to_string())?;
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let pool = rayon::ThreadPoolBuilder::new().num_threads(cores.saturating_sub(2).clamp(2, 6)).build().map_err(|e| e.to_string())?;
    let total = jobs.len();
    let done = AtomicUsize::new(0);
    for chunk in jobs.chunks(BATCH) {
        // 1. des images de chaque vidéo (en parallèle)
        let frames: Vec<(usize, PathBuf)> = pool.install(|| {
            chunk
                .par_iter()
                .enumerate()
                .flat_map_iter(|(v, job)| {
                    let src = super::ajouts::resolve(root, &job.rel);
                    frame_times(job.duration, job.every)
                        .into_iter()
                        .enumerate()
                        .filter_map(|(k, at)| {
                            let out = dir.join(format!("f{v}_{k}.jpg"));
                            extract_frame(&src, &out, at).then_some((v, out))
                        })
                        .collect::<Vec<_>>()
                })
                .collect()
        });
        // 2. une seule lecture de texte pour tout le lot
        let list = dir.join("list.txt");
        let body: String = frames.iter().enumerate().map(|(i, (_, p))| format!("{i}\t{}\n", p.display())).collect();
        std::fs::write(&list, body).map_err(|e| e.to_string())?;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]).arg(&script).arg(&list);
        let output = quiet(&mut cmd).output().map_err(|e| format!("PowerShell indisponible : {e}"))?;
        if !output.status.success() && output.stdout.is_empty() && !frames.is_empty() {
            return Err("La lecture de texte de Windows n'est pas disponible.".to_string());
        }
        let mut per_video: BTreeMap<usize, Vec<String>> = BTreeMap::new();
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if let Some((i, text)) = line.split_once('\t') {
                if let Some((v, _)) = i.trim().parse::<usize>().ok().and_then(|i| frames.get(i)) {
                    per_video.entry(*v).or_default().push(text.to_string());
                }
            }
        }
        for (_, p) in &frames {
            let _ = std::fs::remove_file(p);
        }
        let results: Vec<OcrResult> = chunk
            .iter()
            .enumerate()
            .map(|(v, job)| OcrResult { rel: job.rel.clone(), text: merge_texts(per_video.get(&v).map(|t| t.as_slice()).unwrap_or(&[])) })
            .collect();
        let n = done.fetch_add(chunk.len(), Ordering::SeqCst) + chunk.len();
        let _ = app.emit("ocr-batch", OcrBatch { results, done: n, total });
    }
    Ok(())
}

/// Lit le texte des vidéos données, en arrière-plan. Événements : « ocr-batch », « ocr-done ».
#[tauri::command]
pub fn ocr_start(app: AppHandle, root: String, jobs: Vec<OcrJob>) -> Result<bool, String> {
    if jobs.is_empty() || RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    std::thread::spawn(move || {
        let started = Instant::now();
        let result = run(&app, Path::new(&root), jobs);
        RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("ocr-done", OcrEnd { error: result.err(), seconds: started.elapsed().as_secs_f64() });
    });
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_are_spread_over_the_video() {
        assert_eq!(frame_times(Some(40.0), None), vec![6.0, 20.0, 34.0]);
        assert_eq!(frame_times(Some(0.2), None), vec![0.1]);
        assert_eq!(frame_times(None, None), vec![1.0, 3.0, 6.0]);
        assert_eq!(frame_times(Some(2.0), None).len(), 2);
    }

    #[test]
    fn detailed_reading_takes_a_frame_every_few_seconds_but_not_too_many() {
        let t = frame_times(Some(20.0), Some(2.0));
        assert_eq!(t.len(), 10);
        assert!((t[1] - t[0] - 2.0).abs() < 1e-9);
        assert_eq!(frame_times(Some(600.0), Some(2.0)).len(), 45);
        // durée inconnue : on revient à la lecture normale
        assert_eq!(frame_times(None, Some(2.0)), vec![1.0, 3.0, 6.0]);
    }

    #[test]
    fn same_sentence_on_several_frames_is_kept_once() {
        let t = vec!["200 g de farine".to_string(), "  200 g de farine ".to_string(), "".to_string(), "ok".to_string(), "2 oeufs".to_string()];
        assert_eq!(merge_texts(&t), "200 g de farine · 2 oeufs");
    }
}

// IA locale : modèle d'images CLIP (ViT-B/32, OpenAI, converti en ONNX), exécuté par ONNX Runtime sur la carte
// graphique (DirectML) ou, à défaut, sur le processeur. Aucune image ne quitte le PC : seul le modèle est téléchargé, une fois.

use base64::Engine;
use image::{imageops::FilterType, DynamicImage};
use ort::{ep, environment::Environment, session::Session, value::Tensor};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Version figée du modèle sur Hugging Face (Xenova/clip-vit-base-patch32) : le fichier ne change pas sous nos pieds.
const MODEL_URL: &str = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/onnx/vision_model.onnx";
const MODEL_SIZE: u64 = 351_685_709;
const MODEL_SHA256: &str = "fd6e1402a588279d1723c7534d4bcba5bc0b14b47dfab0e46f8c47b8270d7d40";
const MODEL_FILE: &str = "vision_model.onnx";

const SIDE: usize = 224;
const MEAN: [f32; 3] = [0.481_454_66, 0.457_827_5, 0.408_210_73];
const STD: [f32; 3] = [0.268_629_54, 0.261_302_58, 0.275_777_11];
const BATCH: usize = 32;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static EMBEDDING: AtomicBool = AtomicBool::new(false);

pub(crate) fn model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("models").join("clip-vit-b32"))
}

fn thumbs_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("thumbs"))
}

// ───────────────────────── Statut ─────────────────────────

#[derive(Serialize)]
pub struct AiStatus {
    model_ready: bool,
    model_size: u64,
    downloaded: u64,
    downloading: bool,
    embedding: bool,
}

#[tauri::command]
pub fn ai_status(app: AppHandle) -> Result<AiStatus, String> {
    let dir = model_dir(&app)?;
    let ready = std::fs::metadata(dir.join(MODEL_FILE)).map(|m| m.len() == MODEL_SIZE).unwrap_or(false);
    let part = std::fs::metadata(dir.join(format!("{MODEL_FILE}.part"))).map(|m| m.len()).unwrap_or(0);
    Ok(AiStatus {
        model_ready: ready,
        model_size: MODEL_SIZE,
        downloaded: if ready { MODEL_SIZE } else { part },
        downloading: DOWNLOADING.load(Ordering::SeqCst),
        embedding: EMBEDDING.load(Ordering::SeqCst),
    })
}

// ───────────────────────── Téléchargement ─────────────────────────

#[derive(Serialize, Clone)]
pub(crate) struct DownloadProgress {
    pub done: u64,
    pub total: u64,
}

#[derive(Serialize, Clone)]
pub(crate) struct DownloadEnd {
    pub ok: bool,
    pub error: Option<String>,
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Un fichier à télécharger : adresse figée (version précise du modèle), taille et empreinte attendues.
pub(crate) struct Asset {
    pub url: &'static str,
    pub file: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

pub(crate) const VISION: Asset = Asset { url: MODEL_URL, file: MODEL_FILE, size: MODEL_SIZE, sha256: MODEL_SHA256 };

/// Télécharge un fichier dans `dir` (reprise possible), vérifie sa taille puis son empreinte, et le range sous son nom final.
/// `report` reçoit le nombre d'octets reçus pour ce fichier.
pub(crate) fn download_asset(dir: &Path, asset: &Asset, report: &dyn Fn(u64)) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let final_path = dir.join(asset.file);
    let part_path = dir.join(format!("{}.part", asset.file));
    if std::fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0) == asset.size {
        report(asset.size);
        return Ok(());
    }

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(None::<Duration>)
        .build()
        .map_err(|e| e.to_string())?;

    // Reprise : si un téléchargement a été interrompu, on repart de l'octet où il s'était arrêté.
    let mut have = std::fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
    if have > asset.size {
        let _ = std::fs::remove_file(&part_path);
        have = 0;
    }
    if have < asset.size {
        let mut request = client.get(asset.url);
        if have > 0 {
            request = request.header("Range", format!("bytes={have}-"));
        }
        let mut response = request.send().map_err(|e| format!("Connexion impossible : {e}"))?;
        let status = response.status();
        let append = status.as_u16() == 206;
        if !status.is_success() {
            return Err(format!("Le serveur a répondu {status}."));
        }
        if !append {
            have = 0; // le serveur renvoie le fichier entier
        }
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&part_path)
            .map_err(|e| e.to_string())?;
        let mut done = have;
        let mut buf = vec![0u8; 256 * 1024];
        let mut last = Instant::now();
        loop {
            let n = response.read(&mut buf).map_err(|e| format!("Téléchargement interrompu : {e}"))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            done += n as u64;
            if last.elapsed() >= Duration::from_millis(250) {
                report(done);
                last = Instant::now();
            }
        }
        file.flush().map_err(|e| e.to_string())?;
    }

    let size = std::fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
    if size != asset.size {
        return Err(format!("Fichier incomplet ({size} octets sur {}). Relance le téléchargement pour le reprendre.", asset.size));
    }
    report(asset.size);
    if sha256_file(&part_path)? != asset.sha256 {
        let _ = std::fs::remove_file(&part_path);
        return Err("Le fichier téléchargé est corrompu (empreinte différente). Il a été supprimé : relance le téléchargement.".to_string());
    }
    std::fs::rename(&part_path, &final_path).map_err(|e| e.to_string())
}

fn download(app: &AppHandle) -> Result<(), String> {
    let dir = model_dir(app)?;
    download_asset(&dir, &VISION, &|done| {
        let _ = app.emit("ai-download", DownloadProgress { done, total: VISION.size });
    })
}

/// Lance le téléchargement en arrière-plan. Événements : « ai-download » (avancement) puis « ai-download-done ».
#[tauri::command]
pub fn ai_download_model(app: AppHandle) -> Result<bool, String> {
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    std::thread::spawn(move || {
        let result = download(&app);
        DOWNLOADING.store(false, Ordering::SeqCst);
        let _ = app.emit("ai-download-done", DownloadEnd { ok: result.is_ok(), error: result.err() });
    });
    Ok(true)
}

// ───────────────────────── Préparation des images ─────────────────────────

/// Comme le modèle l'attend : plus petit côté à 224 px, recadrage au centre, couleurs normalisées, ordre canal-ligne-colonne.
pub fn preprocess(img: &DynamicImage) -> Vec<f32> {
    let (w, h) = (img.width().max(1), img.height().max(1));
    let scale = SIDE as f32 / w.min(h) as f32;
    let nw = ((w as f32 * scale).round() as u32).max(SIDE as u32);
    let nh = ((h as f32 * scale).round() as u32).max(SIDE as u32);
    let resized = img.resize_exact(nw, nh, FilterType::CatmullRom).to_rgb8();
    let x0 = (nw - SIDE as u32) / 2;
    let y0 = (nh - SIDE as u32) / 2;
    let plane = SIDE * SIDE;
    let mut out = vec![0f32; 3 * plane];
    for y in 0..SIDE {
        for x in 0..SIDE {
            let p = resized.get_pixel(x0 + x as u32, y0 + y as u32);
            for c in 0..3 {
                out[c * plane + y * SIDE + x] = (p[c] as f32 / 255.0 - MEAN[c]) / STD[c];
            }
        }
    }
    out
}

/// Ramène un vecteur à la longueur 1 : la ressemblance de deux images devient un simple produit scalaire.
pub fn l2_normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
}

pub fn encode_vector(v: &[f32]) -> String {
    let bytes: Vec<u8> = v.iter().flat_map(|x| x.to_le_bytes()).collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[cfg(test)]
fn decode_vector(s: &str) -> Option<Vec<f32>> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(s).ok()?;
    if bytes.len() % 4 != 0 {
        return None;
    }
    Some(bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

// ───────────────────────── Moteur ─────────────────────────

fn environment() -> Result<&'static Environment, String> {
    static ENV: OnceLock<Result<Environment, String>> = OnceLock::new();
    ENV.get_or_init(|| ort::init().build().map_err(|e| e.to_string())).as_ref().map_err(|e| e.clone())
}

/// Carte graphique d'abord ; si elle ne peut pas servir, le processeur. Rend la session et le nom du moteur utilisé.
pub(crate) fn open_session(model: &Path) -> Result<(Session, &'static str), String> {
    let env = environment()?;
    // DirectML demande de désactiver le « memory pattern » et l'exécution parallèle.
    let gpu = (|| -> Result<Session, String> {
        let mut b = Session::builder(env).map_err(|e| e.to_string())?;
        b = b.with_execution_providers([ep::DirectML::default().build().error_on_failure()]).map_err(|e| e.to_string())?;
        b = b.with_memory_pattern(false).map_err(|e| e.to_string())?;
        b = b.with_parallel_execution(false).map_err(|e| e.to_string())?;
        b.commit_from_file(model).map_err(|e| e.to_string())
    })();
    match gpu {
        Ok(session) => Ok((session, "Carte graphique (DirectML)")),
        Err(_) => {
            let mut builder = Session::builder(env).map_err(|e| e.to_string())?;
            let session = builder.commit_from_file(model).map_err(|e| e.to_string())?;
            Ok((session, "Processeur"))
        }
    }
}

#[derive(Deserialize)]
pub struct EmbedJob {
    pub rel: String,
    /// Chemin de la miniature, relatif au dossier des miniatures.
    pub thumb: String,
}

#[derive(Serialize, Clone)]
struct EmbedResult {
    rel: String,
    vec: String,
}

#[derive(Serialize, Clone)]
struct EmbedBatch {
    results: Vec<EmbedResult>,
    /// Images illisibles dans ce lot.
    failed: Vec<String>,
    done: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
struct EmbedEnd {
    error: Option<String>,
    provider: Option<String>,
    seconds: f64,
}

fn embed_all(app: &AppHandle, jobs: Vec<EmbedJob>) -> Result<String, String> {
    let model = model_dir(app)?.join(MODEL_FILE);
    if std::fs::metadata(&model).map(|m| m.len()).unwrap_or(0) != MODEL_SIZE {
        return Err("Le modèle n'est pas téléchargé.".to_string());
    }
    let thumbs = thumbs_root(app)?;
    let (mut session, provider) = open_session(&model)?;
    let _ = app.emit("ai-provider", provider);

    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let pool = rayon::ThreadPoolBuilder::new().num_threads(cores.saturating_sub(2).max(2)).build().map_err(|e| e.to_string())?;
    let total = jobs.len();
    let done = AtomicUsize::new(0);

    for chunk in jobs.chunks(BATCH) {
        let prepared: Vec<(usize, Option<Vec<f32>>)> = pool.install(|| {
            chunk
                .par_iter()
                .enumerate()
                .map(|(i, job)| (i, image::open(thumbs.join(&job.thumb)).ok().map(|img| preprocess(&img))))
                .collect()
        });
        let mut data = Vec::with_capacity(chunk.len() * 3 * SIDE * SIDE);
        let mut kept: Vec<usize> = Vec::new();
        let mut failed: Vec<String> = Vec::new();
        for (i, pixels) in prepared {
            match pixels {
                Some(p) => {
                    data.extend_from_slice(&p);
                    kept.push(i);
                }
                None => failed.push(chunk[i].rel.clone()),
            }
        }
        let mut results = Vec::with_capacity(kept.len());
        if !kept.is_empty() {
            let input = Tensor::from_array(([kept.len(), 3, SIDE, SIDE], data)).map_err(|e| e.to_string())?;
            let outputs = session.run(ort::inputs!["pixel_values" => input]).map_err(|e| e.to_string())?;
            let (shape, values) = outputs["image_embeds"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            let dim = *shape.last().unwrap_or(&0) as usize;
            if dim == 0 || values.len() != kept.len() * dim {
                return Err("Le modèle a rendu un résultat inattendu.".to_string());
            }
            for (row, &i) in kept.iter().enumerate() {
                let mut v = values[row * dim..(row + 1) * dim].to_vec();
                l2_normalize(&mut v);
                results.push(EmbedResult { rel: chunk[i].rel.clone(), vec: encode_vector(&v) });
            }
        }
        let n = done.fetch_add(chunk.len(), Ordering::SeqCst) + chunk.len();
        let _ = app.emit("ai-batch", EmbedBatch { results, failed, done: n, total });
    }
    Ok(provider.to_string())
}

/// Calcule l'empreinte de chaque miniature, en arrière-plan. Événements : « ai-provider », « ai-batch », « ai-done ».
#[tauri::command]
pub fn ai_start_embeddings(app: AppHandle, jobs: Vec<EmbedJob>) -> Result<bool, String> {
    if jobs.is_empty() || EMBEDDING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    std::thread::spawn(move || {
        let started = Instant::now();
        let result = embed_all(&app, jobs);
        EMBEDDING.store(false, Ordering::SeqCst);
        let end = match result {
            Ok(provider) => EmbedEnd { error: None, provider: Some(provider), seconds: started.elapsed().as_secs_f64() },
            Err(e) => EmbedEnd { error: Some(e), provider: None, seconds: started.elapsed().as_secs_f64() },
        };
        let _ = app.emit("ai-done", end);
    });
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn preprocess_has_the_expected_size_and_normalisation() {
        let img = DynamicImage::ImageRgb8(RgbImage::from_pixel(400, 300, Rgb([255, 255, 255])));
        let out = preprocess(&img);
        assert_eq!(out.len(), 3 * SIDE * SIDE);
        // blanc pur : (1 - moyenne) / écart-type, pour chaque canal
        for c in 0..3 {
            let expected = (1.0 - MEAN[c]) / STD[c];
            assert!((out[c * SIDE * SIDE] - expected).abs() < 1e-4);
            assert!((out[c * SIDE * SIDE + SIDE * SIDE - 1] - expected).abs() < 1e-4);
        }
    }

    #[test]
    fn preprocess_crops_the_centre_of_a_wide_image() {
        // 3 bandes verticales égales : rouge, vert, bleu. Le recadrage carré au centre ne garde que du vert.
        let mut img = RgbImage::new(900, 300);
        for (x, _, p) in img.enumerate_pixels_mut() {
            *p = if x < 300 { Rgb([255, 0, 0]) } else if x < 600 { Rgb([0, 255, 0]) } else { Rgb([0, 0, 255]) };
        }
        let out = preprocess(&DynamicImage::ImageRgb8(img));
        let plane = SIDE * SIDE;
        let green_hi = (1.0 - MEAN[1]) / STD[1];
        let red_lo = (0.0 - MEAN[0]) / STD[0];
        // le pixel central et les coins gauche et droite du carré sont verts
        for idx in [SIDE / 2 * SIDE + SIDE / 2, 10 * SIDE + 10, 10 * SIDE + SIDE - 10] {
            assert!((out[plane + idx] - green_hi).abs() < 0.15, "canal vert au pixel {idx}");
            assert!((out[idx] - red_lo).abs() < 0.15, "canal rouge au pixel {idx}");
        }
    }

    #[test]
    fn preprocess_crops_a_tall_image_and_accepts_tiny_ones() {
        let tall = DynamicImage::ImageRgb8(RgbImage::from_pixel(100, 900, Rgb([10, 20, 30])));
        assert_eq!(preprocess(&tall).len(), 3 * SIDE * SIDE);
        let tiny = DynamicImage::ImageRgb8(RgbImage::from_pixel(5, 3, Rgb([10, 20, 30])));
        assert_eq!(preprocess(&tiny).len(), 3 * SIDE * SIDE);
    }

    #[test]
    fn normalised_vectors_have_length_one() {
        let mut v = vec![3.0, 4.0];
        l2_normalize(&mut v);
        assert!((v[0] - 0.6).abs() < 1e-6 && (v[1] - 0.8).abs() < 1e-6);
        let mut zero = vec![0.0, 0.0];
        l2_normalize(&mut zero);
        assert_eq!(zero, vec![0.0, 0.0]);
    }

    #[test]
    fn vectors_survive_encoding() {
        let v = vec![0.5, -1.25, 3.0e-7, 42.0];
        assert_eq!(decode_vector(&encode_vector(&v)), Some(v));
        assert_eq!(decode_vector("pas du base64 !"), None);
        assert_eq!(decode_vector(&base64::engine::general_purpose::STANDARD.encode([1u8, 2, 3])), None);
    }

    #[test]
    fn sha256_is_computed_on_the_whole_file() {
        let path = std::env::temp_dir().join("klippr-test-sha.bin");
        std::fs::write(&path, b"abc").unwrap();
        assert_eq!(sha256_file(&path).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}

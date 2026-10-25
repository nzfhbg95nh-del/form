// Modèle de texte de CLIP : transforme une description (« un plat cuisiné ») en empreinte comparable à celle des images.
// Téléchargé une fois, sur demande : le modèle de texte et le fichier de vocabulaire.

use crate::biblio::ai::{download_asset, encode_vector, l2_normalize, model_dir, open_session, Asset, DownloadEnd, DownloadProgress};
use crate::biblio::clip_tokenizer::{ClipTokenizer, CONTEXT};
use ort::{session::Session, value::Tensor};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Même version figée du modèle que pour les images (Xenova/clip-vit-base-patch32).
const TEXT: Asset = Asset {
    url: "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/onnx/text_model.onnx",
    file: "text_model.onnx",
    size: 254_058_553,
    sha256: "3f6571f5bad13a97c469c1622e1cfc4d9aef78b79fdbfcff804ca357bfada8cc",
};
const VOCAB: Asset = Asset {
    url: "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/tokenizer.json",
    file: "tokenizer.json",
    size: 2_224_119,
    sha256: "f7f3b7af117d467b58374797691a6438d3e6b9e9cef800dfd5dced7f697a90cd",
};
const TOTAL: u64 = TEXT.size + VOCAB.size;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);

struct Engine {
    session: Session,
    tokenizer: ClipTokenizer,
    uses_mask: bool,
}
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

#[derive(Serialize)]
pub struct TextStatus {
    ready: bool,
    total: u64,
    downloaded: u64,
    downloading: bool,
}

fn size_of(path: &std::path::Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

#[tauri::command]
pub fn ai_text_status(app: AppHandle) -> Result<TextStatus, String> {
    let dir = model_dir(&app)?;
    let ready = size_of(&dir.join(TEXT.file)) == TEXT.size && size_of(&dir.join(VOCAB.file)) == VOCAB.size;
    let have = |a: &Asset| size_of(&dir.join(a.file)).max(size_of(&dir.join(format!("{}.part", a.file))));
    Ok(TextStatus { ready, total: TOTAL, downloaded: if ready { TOTAL } else { have(&TEXT) + have(&VOCAB) }, downloading: DOWNLOADING.load(Ordering::SeqCst) })
}

/// Lance le téléchargement en arrière-plan. Événements : « ai-text-download » (avancement) puis « ai-text-download-done ».
#[tauri::command]
pub fn ai_download_text(app: AppHandle) -> Result<bool, String> {
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    let dir = model_dir(&app)?;
    std::thread::spawn(move || {
        let progress = |base: u64| {
            let app = app.clone();
            move |done: u64| {
                let _ = app.emit("ai-text-download", DownloadProgress { done: base + done, total: TOTAL });
            }
        };
        // Le petit fichier d'abord, puis le gros.
        let result = download_asset(&dir, &VOCAB, &progress(0)).and_then(|_| download_asset(&dir, &TEXT, &progress(VOCAB.size)));
        DOWNLOADING.store(false, Ordering::SeqCst);
        let _ = app.emit("ai-text-download-done", DownloadEnd { ok: result.is_ok(), error: result.err() });
    });
    Ok(true)
}

fn load(app: &AppHandle) -> Result<Engine, String> {
    let dir = model_dir(app)?;
    if size_of(&dir.join(TEXT.file)) != TEXT.size || size_of(&dir.join(VOCAB.file)) != VOCAB.size {
        return Err("Le modèle de texte n'est pas téléchargé.".to_string());
    }
    let json = std::fs::read_to_string(dir.join(VOCAB.file)).map_err(|e| e.to_string())?;
    let tokenizer = ClipTokenizer::from_json(&json)?;
    let (session, _) = open_session(&dir.join(TEXT.file))?;
    let uses_mask = session.inputs().iter().any(|i| i.name() == "attention_mask");
    Ok(Engine { session, tokenizer, uses_mask })
}

/// Empreintes (longueur 1, 512 nombres, en base64) de plusieurs descriptions.
fn encode(app: &AppHandle, texts: &[String]) -> Result<Vec<String>, String> {
    let mut guard = ENGINE.lock().map_err(|_| "Moteur de texte bloqué.".to_string())?;
    if guard.is_none() {
        *guard = Some(load(app)?);
    }
    let engine = guard.as_mut().ok_or("Moteur de texte absent.")?;
    let end = engine.tokenizer.end_id();
    let mut ids: Vec<i64> = Vec::with_capacity(texts.len() * CONTEXT);
    let mut mask: Vec<i64> = Vec::with_capacity(texts.len() * CONTEXT);
    for t in texts {
        let row = engine.tokenizer.encode(t);
        let len = ClipTokenizer::content_len(&row, end);
        mask.extend((0..CONTEXT).map(|i| if i < len { 1 } else { 0 }));
        ids.extend(row);
    }
    let n = texts.len();
    let input_ids = Tensor::from_array(([n, CONTEXT], ids)).map_err(|e| e.to_string())?;
    let outputs = if engine.uses_mask {
        let attention = Tensor::from_array(([n, CONTEXT], mask)).map_err(|e| e.to_string())?;
        engine.session.run(ort::inputs!["input_ids" => input_ids, "attention_mask" => attention])
    } else {
        engine.session.run(ort::inputs!["input_ids" => input_ids])
    }
    .map_err(|e| e.to_string())?;
    let (shape, values) = outputs["text_embeds"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
    let dim = *shape.last().unwrap_or(&0) as usize;
    if dim == 0 || values.len() != n * dim {
        return Err("Le modèle de texte a rendu un résultat inattendu.".to_string());
    }
    Ok((0..n)
        .map(|i| {
            let mut v = values[i * dim..(i + 1) * dim].to_vec();
            l2_normalize(&mut v);
            encode_vector(&v)
        })
        .collect())
}

#[tauri::command]
pub async fn ai_encode_texts(app: AppHandle, texts: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || encode(&app, &texts)).await.map_err(|e| e.to_string())?
}

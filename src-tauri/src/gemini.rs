// Appels à l'API Gemini (palier gratuit). La clé est relue dans le coffre Windows ici même :
// elle ne passe jamais par l'interface. Rien n'est envoyé sans que l'utilisateur ait cliqué.

use serde_json::{json, Value};

const BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
const KEY_NAME: &str = "gemini_api_key";

fn api_key() -> Result<String, String> {
    crate::secrets::secret_get(KEY_NAME)?.ok_or_else(|| {
        "Aucune clé Gemini enregistrée : ajoute-la dans Réglages > Assistant IA.".to_string()
    })
}

/// Un nom de modèle ne contient que des lettres, chiffres, points, tirets : on refuse le reste.
fn check_model(model: &str) -> Result<(), String> {
    let ok = !model.is_empty()
        && model.len() < 80
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err("Nom de modèle invalide.".to_string())
    }
}

fn explain(status: u16, body: &str) -> String {
    match status {
        400 => format!("Gemini a refusé la demande (400). {}", short(body)),
        401 | 403 => "Google a refusé la clé : vérifie qu'elle est correcte et active (Réglages > Assistant IA).".to_string(),
        404 => "Modèle introuvable : choisis-en un autre dans Réglages > Assistant IA.".to_string(),
        429 => "La limite gratuite de Gemini est atteinte pour le moment : réessaie dans quelques minutes.".to_string(),
        500..=599 => "Le service Gemini a un problème en ce moment : réessaie plus tard.".to_string(),
        _ => format!("Erreur Gemini ({status}). {}", short(body)),
    }
}

fn short(body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| body.to_string());
    message.chars().take(240).collect()
}

/// Envoie un texte à Gemini et renvoie sa réponse au format JSON demandé (`schema`).
#[tauri::command]
pub async fn gemini_generate(
    model: String,
    system: String,
    prompt: String,
    schema: Value,
) -> Result<String, String> {
    check_model(&model)?;
    let key = api_key()?;
    let url = format!("{}/models/{}:generateContent", BASE, model);
    let body = json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": 0.2
        }
    });
    let response = reqwest::Client::new()
        .post(url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Connexion à Gemini impossible : {e}"))?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        return Err(explain(status, &text));
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("Réponse illisible : {e}"))?;
    value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Gemini n'a rien renvoyé (le texte a peut-être été bloqué).".to_string())
}

/// Liste les modèles utilisables avec la clé enregistrée.
#[tauri::command]
pub async fn gemini_models() -> Result<Vec<String>, String> {
    let key = api_key()?;
    let response = reqwest::Client::new()
        .get(format!("{}/models?pageSize=100", BASE))
        .header("x-goog-api-key", key)
        .send()
        .await
        .map_err(|e| format!("Connexion à Gemini impossible : {e}"))?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        return Err(explain(status, &text));
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("Réponse illisible : {e}"))?;
    let mut names: Vec<String> = value["models"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter(|m| {
                    m["supportedGenerationMethods"]
                        .as_array()
                        .map(|methods| methods.iter().any(|x| x == "generateContent"))
                        .unwrap_or(false)
                })
                .filter_map(|m| m["name"].as_str())
                .map(|name| name.trim_start_matches("models/").to_string())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    Ok(names)
}

/// Fait dessiner une icône par Gemini (modèle d'image) et renvoie une « data URL » (image PNG/JPEG).
/// Ce service n'est pas toujours inclus dans le palier gratuit : l'erreur est expliquée à l'utilisateur.
#[tauri::command]
pub async fn gemini_image(model: String, prompt: String) -> Result<String, String> {
    check_model(&model)?;
    let key = api_key()?;
    let url = format!("{}/models/{}:generateContent", BASE, model);
    let body = json!({
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": { "responseModalities": ["TEXT", "IMAGE"] }
    });
    let response = reqwest::Client::new()
        .post(url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Connexion à Gemini impossible : {e}"))?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        return Err(explain(status, &text));
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("Réponse illisible : {e}"))?;
    let parts = value["candidates"][0]["content"]["parts"].as_array().cloned().unwrap_or_default();
    for part in parts {
        let inline = if part["inlineData"].is_object() { &part["inlineData"] } else { &part["inline_data"] };
        if let Some(data) = inline["data"].as_str() {
            let mime = inline["mimeType"]
                .as_str()
                .or_else(|| inline["mime_type"].as_str())
                .unwrap_or("image/png");
            if mime.starts_with("image/") {
                return Ok(format!("data:{mime};base64,{data}"));
            }
        }
    }
    Err("Gemini n'a pas renvoyé d'image (la demande a peut-être été refusée ou ce modèle ne dessine pas).".to_string())
}

/// Seuls les liens YouTube sont envoyés à Gemini pour analyse (jamais une adresse quelconque).
fn is_youtube_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(|c| c == '/' || c == '?' || c == '#').next().unwrap_or("");
    matches!(host, "www.youtube.com" | "youtube.com" | "m.youtube.com" | "youtu.be")
}

/// Description publiée sous une vidéo YouTube (au mieux : si la page n'est pas lisible, on continue sans).
async fn youtube_description(url: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;
    let html = client
        .get(url)
        .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.5")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    let marker = "\"shortDescription\":";
    let start = html.find(marker)? + marker.len();
    let mut values = serde_json::Deserializer::from_str(&html[start..]).into_iter::<String>();
    let description = values.next()?.ok()?;
    Some(description.chars().take(6000).collect())
}

/// Envoie une vidéo YouTube à Gemini (il la regarde et l'écoute) et renvoie sa réponse au format JSON demandé.
#[tauri::command]
pub async fn gemini_generate_video(
    model: String,
    system: String,
    prompt: String,
    video_url: String,
    schema: Value,
) -> Result<String, String> {
    check_model(&model)?;
    if !is_youtube_url(&video_url) {
        return Err("Seuls les liens YouTube peuvent être analysés.".to_string());
    }
    let key = api_key()?;
    let mut text = prompt;
    if let Some(description) = youtube_description(&video_url).await {
        text = format!("{text}\n\nDescription publiée sous la vidéo :\n{description}");
    }
    let url = format!("{}/models/{}:generateContent", BASE, model);
    let body = json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [
            { "file_data": { "file_uri": video_url } },
            { "text": text }
        ] }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": 0.2
        }
    });
    let response = reqwest::Client::new()
        .post(url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Connexion à Gemini impossible : {e}"))?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        return Err(explain(status, &text));
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("Réponse illisible : {e}"))?;
    value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Gemini n'a rien renvoyé (la vidéo est peut-être privée, trop longue ou bloquée).".to_string())
}

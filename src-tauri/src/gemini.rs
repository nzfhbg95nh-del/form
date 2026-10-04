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

// Coffre-fort : les mots de passe et clés (Gemini, plus tard la messagerie) sont rangés dans le
// « Gestionnaire d'identification » de Windows, jamais dans un fichier ni dans la base de Form.
// Le code de l'interface ne peut ni lire ni afficher ces secrets : il peut seulement les enregistrer,
// savoir s'ils existent et les supprimer. Seul le code Rust (ce fichier) les relit pour faire les appels.

use keyring::Entry;

const SERVICE: &str = "fr.victor.form";

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|e| format!("Coffre Windows indisponible : {e}"))
}

/// Lecture réservée au code Rust : cette fonction n'est PAS une commande appelable depuis l'interface.
pub fn secret_get(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Lecture du coffre impossible : {e}")),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?
        .set_password(value.trim())
        .map_err(|e| format!("Enregistrement dans le coffre impossible : {e}"))
}

#[tauri::command]
pub fn secret_exists(name: String) -> Result<bool, String> {
    Ok(secret_get(&name)?.is_some())
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Suppression impossible : {e}")),
    }
}

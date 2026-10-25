fn main() {
    // `ort` dépose DirectML.dll à côté de l'exécutable pendant la compilation. Pour qu'elle parte aussi dans
    // l'installateur (tauri.conf.json > bundle > resources), on en garde une copie ici avant que Tauri ne lise la config.
    if let Ok(out) = std::env::var("OUT_DIR") {
        if let Some(profile_dir) = std::path::Path::new(&out).ancestors().nth(3) {
            let source = profile_dir.join("DirectML.dll");
            if source.exists() {
                let _ = std::fs::copy(source, "DirectML.dll");
            }
        }
    }
    tauri_build::build()
}

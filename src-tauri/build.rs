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
    // Ce script ne dépend pas de `ort` : lors d'une compilation à froid (GitHub), il peut passer avant que `ort` ait déposé la DLL.
    // Tauri exige que le fichier existe : on pose un fichier vide pour que la compilation continue. Les fabrications (bêta, version)
    // remplacent ensuite ce fichier par la vraie DLL et refusent de continuer s'il reste vide.
    let dest = std::path::Path::new("DirectML.dll");
    if !dest.exists() {
        let _ = std::fs::write(dest, b"");
        println!("cargo:warning=DirectML.dll absente : fichier vide posé en attendant celle d'ort");
    }
    tauri_build::build()
}
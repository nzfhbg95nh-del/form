// Doublons : trouve les images identiques (même contenu, octet pour octet) et quasi identiques (même image réduite, recompressée,
// légèrement retouchée). Comme NoMoreDuplicates : on compare d'abord les tailles de fichier (seuls ceux de même taille sont lus en entier),
// puis une « empreinte visuelle » de 64 bits calculée sur la miniature (dHash : une image réduite à 9 × 8 gris, un bit par comparaison
// entre deux voisins). Deux images sont quasi identiques quand leurs empreintes diffèrent de quelques bits seulement.
// Ce module ne fait que LIRE : rien n'est supprimé ici (la suppression passe par la Corbeille Windows, commande `trash_files`).

use image::{imageops::FilterType, DynamicImage};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter, Manager};

use super::trash::safe_path;

/// Une image plate (écart de gris inférieur à ceci) n'a pas d'empreinte visuelle : tout ressemblerait à tout.
const MIN_CONTRAST: u8 = 10;

#[derive(Deserialize, Clone)]
pub struct DupeFile {
    pub rel: String,
    pub size: u64,
    /// Miniature (chemin relatif au dossier des miniatures) ; rien = pas de comparaison visuelle pour ce fichier.
    pub thumb: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DupeGroup {
    /// « exact » : même contenu ; « near » : quasi identiques.
    pub kind: &'static str,
    pub rels: Vec<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    done: usize,
    total: usize,
}

/// L'empreinte visuelle d'une image, ou rien si elle est trop plate pour en avoir une.
pub fn dhash(img: &DynamicImage) -> Option<u64> {
    let gray = img.resize_exact(9, 8, FilterType::Triangle).to_luma8();
    let (mut lo, mut hi) = (255u8, 0u8);
    for p in gray.pixels() {
        lo = lo.min(p[0]);
        hi = hi.max(p[0]);
    }
    if hi - lo < MIN_CONTRAST {
        return None;
    }
    let mut bits = 0u64;
    for y in 0..8u32 {
        for x in 0..8u32 {
            bits <<= 1;
            if gray.get_pixel(x, y)[0] > gray.get_pixel(x + 1, y)[0] {
                bits |= 1;
            }
        }
    }
    Some(bits)
}

/// Groupes d'éléments dont les empreintes diffèrent d'au plus `max` bits (transitif : A~B et B~C réunit A, B et C). Groupes d'au moins deux.
pub fn near_components(hashes: &[u64], max: u32) -> Vec<Vec<usize>> {
    let n = hashes.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut [usize], mut i: usize) -> usize {
        while parent[i] != i {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        i
    }
    for i in 0..n {
        for j in (i + 1)..n {
            if (hashes[i] ^ hashes[j]).count_ones() <= max {
                let (a, b) = (find(&mut parent, i), find(&mut parent, j));
                if a != b {
                    parent[b] = a;
                }
            }
        }
    }
    let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        let root = find(&mut parent, i);
        groups.entry(root).or_default().push(i);
    }
    let mut out: Vec<Vec<usize>> = groups.into_values().filter(|g| g.len() > 1).collect();
    out.sort_by_key(|g| g[0]);
    out
}

fn file_sha(path: &Path) -> Option<[u8; 32]> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize().into())
}

/// Les groupes de fichiers identiques (indices dans `files`) : on ne lit en entier que les fichiers dont la taille est partagée.
fn exact_groups(app: &AppHandle, root: &Path, files: &[DupeFile]) -> Vec<Vec<usize>> {
    let mut by_size: HashMap<u64, Vec<usize>> = HashMap::new();
    for (i, f) in files.iter().enumerate() {
        if f.size > 0 {
            by_size.entry(f.size).or_default().push(i);
        }
    }
    let candidates: Vec<usize> = by_size.values().filter(|v| v.len() > 1).flatten().copied().collect();
    let total = candidates.len();
    let done = AtomicUsize::new(0);
    let hashed: Vec<(usize, [u8; 32])> = candidates
        .par_iter()
        .filter_map(|&i| {
            let h = safe_path(root, &files[i].rel).and_then(|p| file_sha(&p));
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            if n % 100 == 0 || n == total {
                let _ = app.emit("dupes-progress", Progress { phase: "Comparaison des fichiers", done: n, total });
            }
            h.map(|h| (i, h))
        })
        .collect();
    let mut by_hash: HashMap<(u64, [u8; 32]), Vec<usize>> = HashMap::new();
    for (i, h) in hashed {
        by_hash.entry((files[i].size, h)).or_default().push(i);
    }
    let mut out: Vec<Vec<usize>> = by_hash.into_values().filter(|g| g.len() > 1).collect();
    for g in out.iter_mut() {
        g.sort_unstable();
    }
    out.sort_by_key(|g| g[0]);
    out
}

fn thumbs_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("thumbs"))
}

/// Calcul complet : identiques d'abord, puis (si `max_distance` est donné) quasi identiques.
fn run(app: &AppHandle, root: PathBuf, files: Vec<DupeFile>, max_distance: Option<u32>) -> Result<Vec<DupeGroup>, String> {
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let pool = rayon::ThreadPoolBuilder::new().num_threads(cores.saturating_sub(2).max(2)).build().map_err(|e| e.to_string())?;
    pool.install(|| {
        let exact = exact_groups(app, &root, &files);
        // Chaque groupe de fichiers identiques compte pour un seul élément dans la comparaison visuelle.
        let mut exact_of: Vec<Option<usize>> = vec![None; files.len()];
        for (g, members) in exact.iter().enumerate() {
            for &i in members {
                exact_of[i] = Some(g);
            }
        }
        let reps: Vec<usize> = (0..files.len()).filter(|&i| exact_of[i].map_or(true, |g| exact[g][0] == i)).collect();

        let mut near: Vec<Vec<usize>> = Vec::new();
        if let Some(max) = max_distance {
            let thumbs = thumbs_root(app)?;
            let with_thumb: Vec<usize> = reps.iter().copied().filter(|&i| files[i].thumb.is_some()).collect();
            let total = with_thumb.len();
            let done = AtomicUsize::new(0);
            let hashed: Vec<(usize, u64)> = with_thumb
                .par_iter()
                .filter_map(|&i| {
                    let path = thumbs.join(files[i].thumb.as_deref()?);
                    let h = image::open(path).ok().and_then(|img| dhash(&img));
                    let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                    if n % 250 == 0 || n == total {
                        let _ = app.emit("dupes-progress", Progress { phase: "Comparaison des images", done: n, total });
                    }
                    h.map(|h| (i, h))
                })
                .collect();
            let hashes: Vec<u64> = hashed.iter().map(|(_, h)| *h).collect();
            near = near_components(&hashes, max).into_iter().map(|c| c.into_iter().map(|k| hashed[k].0).collect()).collect();
        }

        let in_near: std::collections::HashSet<usize> = near.iter().flatten().copied().collect();
        let expand = |i: usize| -> Vec<usize> { exact_of[i].map_or_else(|| vec![i], |g| exact[g].clone()) };
        let mut groups: Vec<DupeGroup> = Vec::new();
        for component in &near {
            let mut members: Vec<usize> = component.iter().flat_map(|&i| expand(i)).collect();
            members.sort_unstable();
            groups.push(DupeGroup { kind: "near", rels: members.into_iter().map(|i| files[i].rel.clone()).collect() });
        }
        for g in &exact {
            if !in_near.contains(&g[0]) {
                groups.push(DupeGroup { kind: "exact", rels: g.iter().map(|&i| files[i].rel.clone()).collect() });
            }
        }
        Ok(groups)
    })
}

/// Cherche les doublons parmi les fichiers donnés. Événement : « dupes-progress ». Ne supprime rien.
#[tauri::command]
pub async fn dupes_scan(app: AppHandle, root: String, files: Vec<DupeFile>, max_distance: Option<u32>) -> Result<Vec<DupeGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || run(&app, PathBuf::from(root), files, max_distance)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma, RgbImage};

    /// Une image avec un dégradé et une forme : assez de contraste pour avoir une empreinte.
    fn picture(w: u32, h: u32, shift: u32) -> DynamicImage {
        let mut img = RgbImage::new(w, h);
        for (x, y, p) in img.enumerate_pixels_mut() {
            let v = ((x * 255 / w) as u8).wrapping_add(((y * 40 / h) as u8) * (1 + shift as u8 % 2));
            let blob = x > w / 3 && x < w / 2 && y > h / 4 && y < h / 2;
            *p = if blob { image::Rgb([240, 20, 20]) } else { image::Rgb([v, v / 2, 255 - v]) };
        }
        DynamicImage::ImageRgb8(img)
    }

    #[test]
    fn the_same_picture_resized_keeps_almost_the_same_hash() {
        let big = picture(400, 300, 0);
        let small = big.resize_exact(120, 90, FilterType::Triangle);
        let (a, b) = (dhash(&big).unwrap(), dhash(&small).unwrap());
        assert!((a ^ b).count_ones() <= 5, "{} bits", (a ^ b).count_ones());
    }

    #[test]
    fn a_different_picture_has_a_far_hash() {
        let a = dhash(&picture(400, 300, 0)).unwrap();
        let mut other = RgbImage::new(400, 300);
        for (x, y, p) in other.enumerate_pixels_mut() {
            *p = if (x / 50 + y / 50) % 2 == 0 { image::Rgb([250, 250, 250]) } else { image::Rgb([10, 10, 10]) };
        }
        let b = dhash(&DynamicImage::ImageRgb8(other)).unwrap();
        assert!((a ^ b).count_ones() > 10);
    }

    #[test]
    fn a_flat_picture_has_no_hash() {
        assert!(dhash(&DynamicImage::ImageLuma8(GrayImage::from_pixel(50, 50, Luma([120])))).is_none());
    }

    #[test]
    fn groups_follow_the_distance_and_chain() {
        // 0b0000, 0b0001 (1 bit), 0b0011 (1 bit de plus), très loin
        let h = [0u64, 1, 3, u64::MAX];
        assert_eq!(near_components(&h, 1), vec![vec![0, 1, 2]]);
        assert_eq!(near_components(&h, 0), Vec::<Vec<usize>>::new());
        assert_eq!(near_components(&[7, 7, 9], 0), vec![vec![0, 1]]);
    }

    #[test]
    fn the_file_hash_tells_identical_files_apart() {
        let dir = std::env::temp_dir().join("form-dupes-test");
        std::fs::create_dir_all(&dir).unwrap();
        let (a, b, c) = (dir.join("a.bin"), dir.join("b.bin"), dir.join("c.bin"));
        std::fs::write(&a, b"meme contenu").unwrap();
        std::fs::write(&b, b"meme contenu").unwrap();
        std::fs::write(&c, b"autre chose!").unwrap();
        assert_eq!(file_sha(&a), file_sha(&b));
        assert_ne!(file_sha(&a), file_sha(&c));
        assert!(file_sha(&dir.join("absent.bin")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

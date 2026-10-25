// Couleurs dominantes d'une image, calculées sur sa miniature (rien ne quitte le PC).
// Méthode : on regroupe les pixels par teinte proche (cases de 16 niveaux par canal), on garde au plus 5 couleurs bien
// distinctes (écart de couleur perceptuel en espace Lab), et on ignore le blanc, le noir et le transparent, qui sont
// surtout des fonds.

use image::DynamicImage;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering as Cmp;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

static RUNNING: AtomicBool = AtomicBool::new(false);

const SIDE: u32 = 48;
const MAX_COLORS: usize = 5;
/// Deux couleurs plus proches que cet écart (ΔE) ne comptent que pour une.
const MIN_DISTANCE: f32 = 20.0;
/// Une couleur qui couvre moins de cette part des pixels gardés est ignorée.
const MIN_SHARE: f32 = 0.04;

type Lab = [f32; 3];

fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
}

fn linear_to_srgb(c: f32) -> f32 {
    if c <= 0.003_130_8 { c * 12.92 } else { 1.055 * c.powf(1.0 / 2.4) - 0.055 }
}

fn lab_f(t: f32) -> f32 {
    if t > 0.008_856 { t.cbrt() } else { 7.787 * t + 16.0 / 116.0 }
}

fn lab_f_inv(t: f32) -> f32 {
    if t * t * t > 0.008_856 { t * t * t } else { (t - 16.0 / 116.0) / 7.787 }
}

const WHITE: [f32; 3] = [0.950_47, 1.0, 1.088_83];

pub fn rgb_to_lab(r: u8, g: u8, b: u8) -> Lab {
    let (r, g, b) = (srgb_to_linear(r as f32 / 255.0), srgb_to_linear(g as f32 / 255.0), srgb_to_linear(b as f32 / 255.0));
    let x = (0.412_456_4 * r + 0.357_576_1 * g + 0.180_437_5 * b) / WHITE[0];
    let y = 0.212_672_9 * r + 0.715_152_2 * g + 0.072_175 * b;
    let z = (0.019_333_9 * r + 0.119_192 * g + 0.950_304_1 * b) / WHITE[2];
    let (fx, fy, fz) = (lab_f(x), lab_f(y), lab_f(z));
    [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
}

pub fn lab_to_rgb(lab: Lab) -> [u8; 3] {
    let fy = (lab[0] + 16.0) / 116.0;
    let (fx, fz) = (fy + lab[1] / 500.0, fy - lab[2] / 200.0);
    let (x, y, z) = (lab_f_inv(fx) * WHITE[0], lab_f_inv(fy), lab_f_inv(fz) * WHITE[2]);
    let r = 3.240_454_2 * x - 1.537_138_5 * y - 0.498_531_4 * z;
    let g = -0.969_266 * x + 1.876_010_8 * y + 0.041_556 * z;
    let b = 0.055_643_4 * x - 0.204_025_9 * y + 1.057_225_2 * z;
    let to8 = |c: f32| (linear_to_srgb(c.clamp(0.0, 1.0)) * 255.0).round() as u8;
    [to8(r), to8(g), to8(b)]
}

fn distance(a: &Lab, b: &Lab) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

/// Presque blanc ou presque noir : un fond, pas une couleur.
fn is_background(lab: &Lab) -> bool {
    let chroma = (lab[1] * lab[1] + lab[2] * lab[2]).sqrt();
    (lab[0] >= 96.0 && chroma < 8.0) || lab[0] <= 7.0
}

fn cmp_f32(a: f32, b: f32) -> Cmp {
    a.partial_cmp(&b).unwrap_or(Cmp::Equal)
}

/// Les couleurs dominantes : (R, V, B, part en %), de la plus présente à la moins présente.
pub fn dominant_colors(img: &DynamicImage) -> Vec<([u8; 3], u8)> {
    let small = img.thumbnail(SIDE, SIDE).to_rgba8();
    // case (r>>4, g>>4, b>>4) → (nombre de pixels, somme de L, a, b)
    let mut bins: HashMap<(u8, u8, u8), (u32, [f64; 3])> = HashMap::new();
    let mut kept = 0u32;
    for p in small.pixels() {
        if p[3] < 128 {
            continue;
        }
        let lab = rgb_to_lab(p[0], p[1], p[2]);
        if is_background(&lab) {
            continue;
        }
        let entry = bins.entry((p[0] >> 4, p[1] >> 4, p[2] >> 4)).or_insert((0, [0.0; 3]));
        entry.0 += 1;
        for k in 0..3 {
            entry.1[k] += lab[k] as f64;
        }
        kept += 1;
    }
    if kept == 0 {
        return Vec::new();
    }
    let mut cases: Vec<(u32, Lab)> = bins
        .into_values()
        .map(|(n, s)| (n, [(s[0] / n as f64) as f32, (s[1] / n as f64) as f32, (s[2] / n as f64) as f32]))
        .collect();
    // Les cases les plus remplies d'abord (à égalité, par couleur : le résultat ne dépend pas de l'ordre de la table).
    cases.sort_by(|a, b| b.0.cmp(&a.0).then(cmp_f32(a.1[0], b.1[0])).then(cmp_f32(a.1[1], b.1[1])).then(cmp_f32(a.1[2], b.1[2])));
    let mut centers: Vec<Lab> = Vec::new();
    for (_, lab) in &cases {
        if centers.len() == MAX_COLORS {
            break;
        }
        if centers.iter().all(|c| distance(c, lab) >= MIN_DISTANCE) {
            centers.push(*lab);
        }
    }
    // Chaque case rejoint le centre le plus proche ; la couleur finale est la moyenne pondérée.
    let mut groups: Vec<(u32, [f64; 3])> = vec![(0, [0.0; 3]); centers.len()];
    for (n, lab) in &cases {
        let best = (0..centers.len())
            .min_by(|&i, &j| cmp_f32(distance(&centers[i], lab), distance(&centers[j], lab)))
            .unwrap_or(0);
        groups[best].0 += n;
        for k in 0..3 {
            groups[best].1[k] += lab[k] as f64 * *n as f64;
        }
    }
    let mut out: Vec<(u32, [u8; 3])> = groups
        .into_iter()
        .filter(|(n, _)| *n as f32 / kept as f32 >= MIN_SHARE)
        .map(|(n, s)| (n, lab_to_rgb([(s[0] / n as f64) as f32, (s[1] / n as f64) as f32, (s[2] / n as f64) as f32])))
        .collect();
    out.sort_by(|a, b| b.0.cmp(&a.0));
    out.into_iter().map(|(n, rgb)| (rgb, ((n as f32 / kept as f32) * 100.0).round().max(1.0) as u8)).collect()
}

/// « rrggbb:part,rrggbb:part… » (chaîne vide : aucune couleur à retenir).
pub fn encode(colors: &[([u8; 3], u8)]) -> String {
    colors.iter().map(|(c, p)| format!("{:02x}{:02x}{:02x}:{}", c[0], c[1], c[2], p)).collect::<Vec<_>>().join(",")
}

// ───────────────────────── Calcul en arrière-plan ─────────────────────────

#[derive(Deserialize)]
pub struct ColorJob {
    pub rel: String,
    /// Chemin de la miniature, relatif au dossier des miniatures.
    pub thumb: String,
}

#[derive(Serialize, Clone)]
struct ColorResult {
    rel: String,
    colors: String,
}

#[derive(Serialize, Clone)]
struct ColorBatch {
    results: Vec<ColorResult>,
    done: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
struct ColorEnd {
    error: Option<String>,
    seconds: f64,
}

fn thumbs_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("thumbs"))
}

fn run(app: &AppHandle, jobs: Vec<ColorJob>) -> Result<(), String> {
    let thumbs = thumbs_root(app)?;
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let pool = rayon::ThreadPoolBuilder::new().num_threads(cores.saturating_sub(2).max(2)).build().map_err(|e| e.to_string())?;
    let total = jobs.len();
    let done = AtomicUsize::new(0);
    for chunk in jobs.chunks(200) {
        let results: Vec<ColorResult> = pool.install(|| {
            chunk
                .par_iter()
                .filter_map(|job| {
                    // Miniature illisible : pas de ligne, elle sera retentée plus tard.
                    let img = image::open(thumbs.join(&job.thumb)).ok()?;
                    Some(ColorResult { rel: job.rel.clone(), colors: encode(&dominant_colors(&img)) })
                })
                .collect()
        });
        let n = done.fetch_add(chunk.len(), Ordering::SeqCst) + chunk.len();
        let _ = app.emit("colors-batch", ColorBatch { results, done: n, total });
    }
    Ok(())
}

/// Calcule les couleurs des miniatures données, en arrière-plan. Événements : « colors-batch », « colors-done ».
#[tauri::command]
pub fn colors_start(app: AppHandle, jobs: Vec<ColorJob>) -> Result<bool, String> {
    if jobs.is_empty() || RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    std::thread::spawn(move || {
        let started = Instant::now();
        let result = run(&app, jobs);
        RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("colors-done", ColorEnd { error: result.err(), seconds: started.elapsed().as_secs_f64() });
    });
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    fn solid(c: [u8; 3]) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_pixel(60, 40, Rgb(c)))
    }

    fn close(a: [u8; 3], b: [u8; 3]) -> bool {
        a.iter().zip(b.iter()).all(|(x, y)| (*x as i32 - *y as i32).abs() <= 6)
    }

    #[test]
    fn lab_round_trip_keeps_the_colour() {
        for c in [[255u8, 0, 0], [12, 200, 90], [40, 40, 200], [250, 220, 10]] {
            let lab = rgb_to_lab(c[0], c[1], c[2]);
            assert!(close(lab_to_rgb(lab), c), "{:?}", c);
        }
    }

    #[test]
    fn a_plain_red_image_gives_one_red_colour() {
        let out = dominant_colors(&solid([220, 20, 30]));
        assert_eq!(out.len(), 1);
        assert!(close(out[0].0, [220, 20, 30]), "{:?}", out[0].0);
        assert_eq!(out[0].1, 100);
    }

    #[test]
    fn white_and_black_are_ignored() {
        assert!(dominant_colors(&solid([255, 255, 255])).is_empty());
        assert!(dominant_colors(&solid([0, 0, 0])).is_empty());
        assert_eq!(encode(&[]), "");
    }

    #[test]
    fn two_colours_come_out_by_share_and_background_does_not_count() {
        // 3/4 bleu, 1/4 jaune, et une bande blanche en plus (fond) qui ne compte pas.
        let mut img = RgbImage::from_pixel(48, 48, Rgb([255, 255, 255]));
        for y in 0..36 {
            for x in 0..48 {
                let c = if x < 36 { Rgb([20, 40, 200]) } else { Rgb([250, 220, 10]) };
                img.put_pixel(x, y, c);
            }
        }
        let out = dominant_colors(&DynamicImage::ImageRgb8(img));
        assert_eq!(out.len(), 2);
        assert!(close(out[0].0, [20, 40, 200]));
        assert!(close(out[1].0, [250, 220, 10]));
        assert!((out[0].1 as i32 - 75).abs() <= 3 && (out[1].1 as i32 - 25).abs() <= 3, "{:?}", out);
    }

    #[test]
    fn near_identical_shades_count_as_one_colour() {
        let mut img = RgbImage::new(48, 48);
        for (x, _, p) in img.enumerate_pixels_mut() {
            *p = if x % 2 == 0 { Rgb([200, 30, 30]) } else { Rgb([206, 34, 28]) };
        }
        assert_eq!(dominant_colors(&DynamicImage::ImageRgb8(img)).len(), 1);
    }

    #[test]
    fn encode_writes_hex_and_percent() {
        assert_eq!(encode(&[([255, 0, 16], 60), ([1, 2, 3], 7)]), "ff0010:60,010203:7");
    }
}

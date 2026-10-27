// Aperçu d'un lien web (comme le « signet » de Notion) : titre, description, nom du site et une petite image, lus dans la page.
// L'image est téléchargée et réduite ici, puis rendue en « data: » : l'appli n'affiche jamais d'image distante.

use base64::Engine;
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct LinkPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub site: String,
    /// Petite image (JPEG réduit) en « data: », si la page en annonce une.
    pub image: Option<String>,
}

const MAX_PAGE: usize = 1_500_000;
const MAX_IMAGE: usize = 4_000_000;

/// Les adresses de la machine ou du réseau local ne sont jamais lues.
fn is_private_host(host: &str) -> bool {
    let h = host.trim_matches(|c| c == '[' || c == ']').to_lowercase();
    if h == "localhost" || h.ends_with(".local") || h.ends_with(".localhost") || h.ends_with(".internal") {
        return true;
    }
    if let Ok(ip) = h.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified(),
            std::net::IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xfe00) == 0xfc00 || (v6.segments()[0] & 0xffc0) == 0xfe80,
        };
    }
    false
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
}

/// Les attributs d'une balise (`nom="valeur"`), noms en minuscules.
fn attrs(tag: &str) -> Vec<(String, String)> {
    let b = tag.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        while i < b.len() && (b[i].is_ascii_whitespace() || b[i] == b'<' || b[i] == b'/') {
            i += 1;
        }
        let start = i;
        while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'=' && b[i] != b'>' && b[i] != b'/' {
            i += 1;
        }
        let name = tag[start..i].to_lowercase();
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i < b.len() && b[i] == b'=' {
            i += 1;
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            let value = if i < b.len() && (b[i] == b'"' || b[i] == b'\'') {
                let q = b[i];
                i += 1;
                let s = i;
                while i < b.len() && b[i] != q {
                    i += 1;
                }
                let v = tag[s..i.min(b.len())].to_string();
                i += 1;
                v
            } else {
                let s = i;
                while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'>' {
                    i += 1;
                }
                tag[s..i].to_string()
            };
            if !name.is_empty() {
                out.push((name, decode_entities(&value)));
            }
        } else if i == start {
            i += 1;
        }
    }
    out
}

/// Les balises `<meta>` d'une page : (nom ou propriété, contenu).
pub fn parse_meta(html: &str) -> Vec<(String, String)> {
    let lower = html.to_lowercase();
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(p) = lower[from..].find("<meta") {
        let start = from + p;
        let Some(end) = lower[start..].find('>') else { break };
        let tag = &html[start..start + end + 1];
        let a = attrs(tag);
        let key = a.iter().find(|(k, _)| k == "property" || k == "name").map(|(_, v)| v.to_lowercase());
        let content = a.iter().find(|(k, _)| k == "content").map(|(_, v)| v.clone());
        if let (Some(k), Some(c)) = (key, content) {
            out.push((k, c));
        }
        from = start + end + 1;
    }
    out
}

fn title_tag(html: &str) -> String {
    let lower = html.to_lowercase();
    let Some(s) = lower.find("<title") else { return String::new() };
    let Some(open_end) = lower[s..].find('>') else { return String::new() };
    let body = s + open_end + 1;
    let Some(close) = lower[body..].find("</title>") else { return String::new() };
    decode_entities(html[body..body + close].trim())
}

/// Ce qu'on retient d'une page : titre, description, nom du site, adresse de l'image.
pub fn read_page(html: &str) -> (String, String, String, Option<String>) {
    let meta = parse_meta(html);
    let get = |keys: &[&str]| keys.iter().find_map(|k| meta.iter().find(|(m, c)| m == k && !c.trim().is_empty()).map(|(_, c)| c.trim().to_string()));
    let title = get(&["og:title", "twitter:title"]).unwrap_or_else(|| title_tag(html));
    let description = get(&["og:description", "twitter:description", "description"]).unwrap_or_default();
    let site = get(&["og:site_name"]).unwrap_or_default();
    let image = get(&["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
    (title, description, site, image)
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())
}

fn read_limited(resp: reqwest::blocking::Response, max: usize) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut buf = Vec::new();
    resp.take(max as u64).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Réduit l'image à 480 px de large au plus et la rend en JPEG « data: ».
fn shrink(bytes: &[u8]) -> Option<String> {
    let img = image::load_from_memory(bytes).ok()?;
    let small = img.thumbnail(480, 480).to_rgb8();
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 78).encode_image(&small).ok()?;
    Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(out)))
}

pub fn fetch_preview(raw: &str) -> Result<LinkPreview, String> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|_| "Ce n'est pas une adresse web valide.".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Seules les adresses http et https sont lues.".into());
    }
    let host = url.host_str().ok_or("Adresse sans nom de site.")?;
    if is_private_host(host) {
        return Err("Les adresses de ton ordinateur ou de ton réseau ne sont pas lues.".into());
    }
    let c = client()?;
    let resp = c.get(url.clone()).send().map_err(|e| format!("Page injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("La page répond « {} ».", resp.status()));
    }
    let final_url = resp.url().clone();
    let html = String::from_utf8_lossy(&read_limited(resp, MAX_PAGE)?).into_owned();
    let (title, description, mut site, image_url) = read_page(&html);
    if site.is_empty() {
        site = final_url.host_str().unwrap_or("").trim_start_matches("www.").to_string();
    }
    let image = image_url
        .and_then(|u| final_url.join(&u).ok())
        .filter(|u| u.host_str().is_some_and(|h| !is_private_host(h)))
        .and_then(|u| c.get(u).send().ok())
        .filter(|r| r.status().is_success())
        .and_then(|r| read_limited(r, MAX_IMAGE).ok())
        .and_then(|b| shrink(&b));
    Ok(LinkPreview { url: final_url.to_string(), title, description, site, image })
}

/// Lit une page web : titre, description, site et petite image (pour le bloc « Aperçu de lien »).
#[tauri::command]
pub async fn link_preview(url: String) -> Result<LinkPreview, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_preview(&url)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = r#"<html><head><title>Titre de la balise</title>
        <meta property="og:title" content="Un titre &amp; plus">
        <meta content="Une description" property="og:description" />
        <meta property='og:site_name' content='Mon Site'>
        <meta property="og:image" content="/img/cover.png">
        </head><body>…</body></html>"#;

    #[test]
    fn une_page_donne_titre_description_site_et_image() {
        let (title, desc, site, image) = read_page(PAGE);
        assert_eq!(title, "Un titre & plus");
        assert_eq!(desc, "Une description");
        assert_eq!(site, "Mon Site");
        assert_eq!(image.as_deref(), Some("/img/cover.png"));
    }

    #[test]
    fn sans_balises_meta_on_prend_le_titre_de_la_page() {
        let (title, desc, site, image) = read_page("<html><head><title> Bonjour  </title></head></html>");
        assert_eq!((title.as_str(), desc.as_str(), site.as_str(), image), ("Bonjour", "", "", None));
    }

    #[test]
    fn les_adresses_locales_sont_refusees() {
        for h in ["localhost", "127.0.0.1", "192.168.1.10", "10.0.0.5", "169.254.1.1", "[::1]", "nas.local"] {
            assert!(is_private_host(h), "{h}");
        }
        for h in ["example.com", "8.8.8.8", "www.youtube.com"] {
            assert!(!is_private_host(h), "{h}");
        }
        assert!(fetch_preview("http://localhost:8000/x").is_err());
        assert!(fetch_preview("ftp://example.com/x").is_err());
        assert!(fetch_preview("pas une adresse").is_err());
    }
}

// Se connecter à Instagram / Pinterest depuis une fenêtre de Form, pour que le téléchargement des enregistrements se fasse tout seul.
// Victor tape lui-même son mot de passe dans la fenêtre du site : Form ne le voit jamais. Form lit seulement les cookies de la session
// (comme le ferait l'extension « Get cookies.txt ») et les range dans un fichier cookies.txt que gallery-dl sait lire.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

struct Site {
    key: &'static str,
    home: &'static str,
    login: &'static str,
    /// Le cookie dont la présence prouve qu'on est connecté.
    session_cookie: &'static str,
    title: &'static str,
}

const SITES: [Site; 2] = [
    Site {
        key: "instagram",
        home: "https://www.instagram.com/",
        login: "https://www.instagram.com/accounts/login/",
        session_cookie: "sessionid",
        title: "Connexion à Instagram",
    },
    Site {
        key: "pinterest",
        home: "https://www.pinterest.com/",
        login: "https://www.pinterest.com/login/",
        session_cookie: "_pinterest_sess",
        title: "Connexion à Pinterest",
    },
];

fn site(key: &str) -> Result<&'static Site, String> {
    SITES.iter().find(|s| s.key == key).ok_or_else(|| format!("Site inconnu : {key}"))
}

fn label(s: &Site) -> String {
    format!("login-{}", s.key)
}

/// Un cookie, réduit à ce dont le fichier cookies.txt a besoin.
#[derive(Debug, Clone, PartialEq)]
pub struct Biscuit {
    pub domain: String,
    pub path: String,
    pub secure: bool,
    pub http_only: bool,
    /// Date d'expiration (secondes Unix), 0 = cookie de session.
    pub expires: i64,
    pub name: String,
    pub value: String,
}

/// Les cookies de session n'ont pas de date : on leur en donne une (une semaine), sinon gallery-dl les jetterait.
pub const SESSION_LIFETIME: i64 = 7 * 24 * 3600;

/// Le contenu d'un fichier cookies.txt (format Netscape) : une ligne par cookie, champs séparés par des tabulations.
pub fn netscape(cookies: &[Biscuit], now: i64) -> String {
    let mut out = String::from("# Netscape HTTP Cookie File\n# Fichier préparé par Form à partir de ta connexion. Ne le partage pas : il donne accès à ton compte.\n");
    for c in cookies {
        let prefix = if c.http_only { "#HttpOnly_" } else { "" };
        let subdomains = if c.domain.starts_with('.') { "TRUE" } else { "FALSE" };
        let expires = if c.expires > 0 { c.expires } else { now + SESSION_LIFETIME };
        out.push_str(&format!(
            "{prefix}{}\t{subdomains}\t{}\t{}\t{expires}\t{}\t{}\n",
            c.domain,
            if c.path.is_empty() { "/" } else { &c.path },
            if c.secure { "TRUE" } else { "FALSE" },
            c.name,
            c.value
        ));
    }
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStatus {
    pub connected: bool,
    /// Fichier cookies.txt prêt pour le téléchargement (seulement si connecté).
    pub cookies_file: Option<String>,
    /// Date de fin de la session (secondes Unix), si le site la donne.
    pub expires: Option<i64>,
}

fn cookies_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("cookies");
    fs::create_dir_all(&dir).map_err(|e| format!("Dossier des cookies illisible : {e}"))?;
    Ok(dir)
}

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Lit les cookies du site (la fenêtre de connexion si elle est ouverte, sinon la fenêtre principale : elles partagent la même session).
fn read_cookies(app: &AppHandle, s: &Site) -> Result<Vec<Biscuit>, String> {
    let win = app.get_webview_window(&label(s)).or_else(|| app.get_webview_window("main")).ok_or("Aucune fenêtre disponible")?;
    let url = Url::parse(s.home).map_err(|e| e.to_string())?;
    let list = win.cookies_for_url(url).map_err(|e| e.to_string())?;
    Ok(list
        .iter()
        .map(|c| Biscuit {
            domain: c.domain().unwrap_or("").to_string(),
            path: c.path().unwrap_or("/").to_string(),
            secure: c.secure().unwrap_or(false),
            http_only: c.http_only().unwrap_or(false),
            expires: c.expires_datetime().map(|d| d.unix_timestamp()).unwrap_or(0),
            name: c.name().to_string(),
            value: c.value().to_string(),
        })
        .collect())
}

/// Ouvre la fenêtre de connexion du site (ou la ramène devant).
#[tauri::command]
pub async fn login_open(app: AppHandle, site_key: String) -> Result<(), String> {
    let s = site(&site_key)?;
    if let Some(w) = app.get_webview_window(&label(s)) {
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let url = Url::parse(s.login).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(&app, label(s), WebviewUrl::External(url))
        .title(s.title)
        .inner_size(520.0, 760.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Referme la fenêtre de connexion.
#[tauri::command]
pub async fn login_close(app: AppHandle, site_key: String) -> Result<(), String> {
    let s = site(&site_key)?;
    if let Some(w) = app.get_webview_window(&label(s)) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Dit si Victor est connecté au site et, si oui, remet à jour le fichier cookies.txt.
#[tauri::command]
pub async fn login_check(app: AppHandle, site_key: String) -> Result<LoginStatus, String> {
    let s = site(&site_key)?;
    let all = read_cookies(&app, s)?;
    let now = now();
    let session = all.iter().find(|c| c.name == s.session_cookie && !c.value.is_empty());
    let alive = session.filter(|c| c.expires == 0 || c.expires > now);
    let Some(session) = alive else {
        return Ok(LoginStatus { connected: false, cookies_file: None, expires: None });
    };
    let file = cookies_dir(&app)?.join(format!("{}.txt", s.key));
    fs::write(&file, netscape(&all, now)).map_err(|e| format!("Écriture des cookies impossible : {e}"))?;
    Ok(LoginStatus {
        connected: true,
        cookies_file: Some(file.to_string_lossy().into_owned()),
        expires: if session.expires > 0 { Some(session.expires) } else { None },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cookie(name: &str, http_only: bool, expires: i64) -> Biscuit {
        Biscuit { domain: ".instagram.com".into(), path: "/".into(), secure: true, http_only, expires, name: name.into(), value: "v".into() }
    }

    #[test]
    fn a_cookie_line_has_the_seven_netscape_fields() {
        let text = netscape(&[cookie("csrftoken", false, 2_000_000_000)], 1_000);
        let line = text.lines().find(|l| !l.starts_with('#')).unwrap();
        assert_eq!(line, ".instagram.com\tTRUE\t/\tTRUE\t2000000000\tcsrftoken\tv");
    }

    #[test]
    fn http_only_cookies_get_the_marker_gallery_dl_understands() {
        let text = netscape(&[cookie("sessionid", true, 2_000_000_000)], 1_000);
        assert!(text.contains("\n#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t2000000000\tsessionid\tv\n"));
    }

    #[test]
    fn a_session_cookie_gets_an_expiry_so_it_is_not_dropped() {
        let text = netscape(&[cookie("sessionid", false, 0)], 1_000);
        assert!(text.contains(&format!("\t{}\tsessionid", 1_000 + SESSION_LIFETIME)));
    }

    #[test]
    fn a_host_only_cookie_has_no_subdomain_flag() {
        let mut c = cookie("x", false, 5);
        c.domain = "www.instagram.com".into();
        assert!(netscape(&[c], 1).contains("www.instagram.com\tFALSE\t"));
    }

    #[test]
    fn only_known_sites_are_accepted() {
        assert!(site("instagram").is_ok());
        assert!(site("pinterest").is_ok());
        assert!(site("facebook").is_err());
    }
}

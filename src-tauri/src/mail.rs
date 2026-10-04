// Lecture du courrier (IMAP) en LECTURE SEULE.
// - On se connecte en TLS (port 993), on ouvre le dossier avec EXAMINE (lecture seule) et on lit avec
//   BODY.PEEK : les messages ne sont jamais marqués « lus », déplacés ou supprimés.
// - Le mot de passe est relu dans le coffre Windows ici même : il ne passe pas par l'interface.
// - Rien n'est envoyé : aucune connexion SMTP, aucune écriture dans la messagerie.

use mailparse::{dateparse, parse_headers, parse_mail, MailHeaderMap, ParsedMail};
use serde::Serialize;
use std::net::TcpStream;

type MailSession = imap::Session<native_tls::TlsStream<TcpStream>>;

const MAX_BODY_BYTES: u32 = 25 * 1024 * 1024;
const PASSWORD_NAME: &str = "mail_password";

#[derive(Serialize)]
pub struct MailItem {
    pub uid: u32,
    pub message_id: String,
    pub from: String,
    pub subject: String,
    /// Date du message, au format AAAA-MM-JJ.
    pub date: String,
    pub snippet: String,
    pub attachments: Vec<String>,
    /// Vrai si l'expéditeur ou l'objet correspond aux filtres de l'utilisateur.
    pub matched: bool,
}

fn host_ok(host: &str) -> bool {
    !host.is_empty()
        && host.len() < 100
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

fn connect(host: &str, port: u16, user: &str) -> Result<MailSession, String> {
    if !host_ok(host) {
        return Err("Nom de serveur invalide.".to_string());
    }
    let password = crate::secrets::secret_get(PASSWORD_NAME)?.ok_or_else(|| {
        "Aucun mot de passe de messagerie enregistré : ajoute-le dans Réglages > Courrier.".to_string()
    })?;
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("Connexion sécurisée indisponible : {}", e))?;
    let client = imap::connect((host, port), host, &tls)
        .map_err(|e| format!("Connexion au serveur impossible : {}", e))?;
    client
        .login(user, password)
        .map_err(|e| format!("La messagerie a refusé la connexion (vérifie l'adresse et le mot de passe d'application) : {}", e.0))
}

/// Jours depuis 1970 -> AAAA-MM-JJ (calcul du calendrier grégorien, sans dépendance supplémentaire).
fn iso_date(epoch: i64) -> String {
    let days = epoch.div_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn find_text(mail: &ParsedMail, mime: &str) -> Option<String> {
    if mail.subparts.is_empty() {
        if mail.ctype.mimetype.eq_ignore_ascii_case(mime) {
            return mail.get_body().ok();
        }
        return None;
    }
    mail.subparts.iter().find_map(|part| find_text(part, mime))
}

fn strip_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

fn snippet_of(mail: &ParsedMail) -> String {
    let text = find_text(mail, "text/plain")
        .or_else(|| find_text(mail, "text/html").map(|h| strip_tags(&h)))
        .unwrap_or_default();
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    flat.chars().take(600).collect()
}

fn collect_attachments(mail: &ParsedMail, out: &mut Vec<String>) {
    for part in &mail.subparts {
        let disposition = part.get_content_disposition();
        let name = disposition
            .params
            .get("filename")
            .cloned()
            .or_else(|| part.ctype.params.get("name").cloned());
        if let Some(n) = name {
            out.push(n);
        }
        collect_attachments(part, out);
    }
}

fn filters(list: Vec<String>) -> Vec<String> {
    list.into_iter()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

struct Header {
    uid: u32,
    size: u32,
    message_id: String,
    from: String,
    subject: String,
    date: String,
    matched: bool,
}

fn fetch_blocking(
    host: String,
    port: u16,
    user: String,
    folder: String,
    scan_last: u32,
    senders: Vec<String>,
    subjects: Vec<String>,
    only_matches: bool,
    limit: u32,
) -> Result<Vec<MailItem>, String> {
    let senders = filters(senders);
    let subjects = filters(subjects);
    let mut session = connect(&host, port, &user)?;
    // EXAMINE = ouverture en lecture seule.
    let mailbox = session
        .examine(&folder)
        .map_err(|e| format!("Dossier « {} » introuvable : {}", folder, e))?;
    let total = mailbox.exists;
    let mut headers: Vec<Header> = Vec::new();

    if total > 0 {
        let scan = scan_last.clamp(1, 2000);
        let start = if total > scan { total - scan + 1 } else { 1 };
        let range = format!("{}:{}", start, total);
        let fetched = session
            .fetch(range, "(UID RFC822.SIZE BODY.PEEK[HEADER])")
            .map_err(|e| format!("Lecture des messages impossible : {}", e))?;
        for m in fetched.iter() {
            let (uid, bytes) = match (m.uid, m.header()) {
                (Some(uid), Some(bytes)) => (uid, bytes),
                _ => continue,
            };
            let parsed = match parse_headers(bytes) {
                Ok((h, _)) => h,
                Err(_) => continue,
            };
            let from = parsed.get_first_value("From").unwrap_or_default();
            let subject = parsed.get_first_value("Subject").unwrap_or_default();
            let date = parsed
                .get_first_value("Date")
                .and_then(|d| dateparse(&d).ok())
                .map(iso_date)
                .unwrap_or_default();
            let message_id = parsed
                .get_first_value("Message-ID")
                .unwrap_or_default()
                .trim()
                .to_string();
            let from_l = from.to_lowercase();
            let subject_l = subject.to_lowercase();
            let matched = senders.iter().any(|f| from_l.contains(f))
                || subjects.iter().any(|f| subject_l.contains(f));
            headers.push(Header {
                uid,
                size: m.size.unwrap_or(0),
                message_id: if message_id.is_empty() { format!("uid-{}-{}", folder, uid) } else { message_id },
                from,
                subject,
                date,
                matched,
            });
        }
    }

    // Les plus récents d'abord.
    headers.sort_by(|a, b| b.uid.cmp(&a.uid));
    let selected: Vec<Header> = headers
        .into_iter()
        .filter(|h| !only_matches || h.matched)
        .take(limit.clamp(1, 200) as usize)
        .collect();

    let mut items: Vec<MailItem> = Vec::new();
    for h in selected {
        let mut snippet = String::new();
        let mut attachments: Vec<String> = Vec::new();
        // Le contenu complet n'est lu que pour les messages reconnus (et de taille raisonnable).
        if h.matched && h.size <= MAX_BODY_BYTES {
            if let Ok(bodies) = session.uid_fetch(h.uid.to_string(), "BODY.PEEK[]") {
                if let Some(bytes) = bodies.iter().find_map(|b| b.body()) {
                    if let Ok(mail) = parse_mail(bytes) {
                        snippet = snippet_of(&mail);
                        collect_attachments(&mail, &mut attachments);
                    }
                }
            }
        }
        items.push(MailItem {
            uid: h.uid,
            message_id: h.message_id,
            from: h.from,
            subject: h.subject,
            date: h.date,
            snippet,
            attachments,
            matched: h.matched,
        });
    }
    let _ = session.logout();
    Ok(items)
}

/// Relève les messages récents. `only_matches` : ne garder que ceux qui correspondent aux filtres.
#[tauri::command]
pub async fn mail_fetch(
    host: String,
    port: u16,
    user: String,
    folder: String,
    scan_last: u32,
    senders: Vec<String>,
    subjects: Vec<String>,
    only_matches: bool,
    limit: u32,
) -> Result<Vec<MailItem>, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fetch_blocking(host, port, user, folder, scan_last, senders, subjects, only_matches, limit)
    })
    .await
    .map_err(|e| format!("Erreur interne : {}", e))?;
    result
}

/// Teste la connexion et renvoie un message lisible.
#[tauri::command]
pub async fn mail_test(host: String, port: u16, user: String, folder: String) -> Result<String, String> {
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let mut session = connect(&host, port, &user)?;
        let mailbox = session
            .examine(&folder)
            .map_err(|e| format!("Dossier « {} » introuvable : {}", folder, e))?;
        let total = mailbox.exists;
        let _ = session.logout();
        Ok(format!("Connexion réussie : {} messages dans « {} ».", total, folder))
    })
    .await
    .map_err(|e| format!("Erreur interne : {}", e))?;
    result
}

//! Pull Cursor usage CSV from cursor.com using the local Cursor session token.
//! Runs at most once per local calendar day.

use base64::Engine;
use chrono::Local;
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const USAGE_CSV_URL: &str =
    "https://cursor.com/api/dashboard/export-usage-events-csv?strategy=tokens";

fn cursor_state_db() -> Option<PathBuf> {
    dirs::data_dir().map(|d| {
        d.join("Cursor")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb")
    })
}

fn jwt_payload(token: &str) -> Option<Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let mut payload = parts[1].replace('-', "+").replace('_', "/");
    while payload.len() % 4 != 0 {
        payload.push('=');
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Read `cursorAuth/accessToken` from Cursor's state.vscdb (read-only).
fn read_access_token() -> Result<String, String> {
    let path = cursor_state_db().ok_or("Dossier Cursor introuvable")?;
    if !path.exists() {
        return Err("state.vscdb Cursor introuvable — ouvre Cursor une fois connecté".into());
    }

    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = Connection::open_with_flags(&path, flags)
        .map_err(|e| format!("Lecture state.vscdb: {e}"))?;

    let raw: String = conn
        .query_row(
            "SELECT value FROM ItemTable WHERE key = ?1",
            ["cursorAuth/accessToken"],
            |row| row.get(0),
        )
        .map_err(|_| {
            "Token Cursor introuvable — connecte-toi dans l’app Cursor".to_string()
        })?;

    let token = raw.trim().trim_matches('"').to_string();
    if token.is_empty() {
        return Err("Token Cursor vide".into());
    }
    Ok(token)
}

fn session_cookie(access_token: &str) -> Result<String, String> {
    let payload = jwt_payload(access_token).ok_or("JWT Cursor invalide")?;
    let sub = payload
        .get("sub")
        .and_then(|v| v.as_str())
        .ok_or("JWT Cursor sans sub")?;
    // Cookie format used by cursor.com dashboard: userId%3A%3Ajwt
    Ok(format!("{sub}%3A%3A{access_token}"))
}

/// Download the usage-events CSV for the signed-in Cursor account.
pub fn fetch_usage_csv() -> Result<String, String> {
    let access = read_access_token()?;
    let cookie = session_cookie(&access)?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("ClawdUsage/0.1")
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(USAGE_CSV_URL)
        .header("Accept", "*/*")
        .header("Cookie", format!("WorkosCursorSessionToken={cookie}"))
        .header("Referer", "https://cursor.com/dashboard")
        .send()
        .map_err(|e| format!("Réseau Cursor: {e}"))?;

    let status = resp.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(
            "Session Cursor expirée — reconnecte-toi dans l’app Cursor".into(),
        );
    }
    if !status.is_success() {
        return Err(format!("API Cursor: HTTP {status}"));
    }

    let text = resp.text().map_err(|e| e.to_string())?;
    if !text.starts_with("Date,") {
        return Err("Réponse Cursor inattendue (pas un CSV)".into());
    }
    Ok(text)
}

pub fn today_local() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
}

/// Persist raw CSV next to other app data (debug / re-import).
pub fn cache_csv(app_data: &std::path::Path, content: &str) {
    let _ = fs::create_dir_all(app_data);
    let _ = fs::write(app_data.join("cursor-api-last.csv"), content);
}

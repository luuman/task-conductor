//! 从 GitHub 拉取加密备份文件并解密写入 tc_sync.db。
use std::path::Path;

use super::crypto::{derive_file_key, decrypt_bytes};
use super::importer::{init_db, upsert_session, add_pull_record};

pub struct SyncParams {
    pub master_key_hex: String,
    pub github_repo: String,    // "owner/repo"
    pub github_pat: String,
}

fn github_raw_url(repo: &str, path: &str) -> String {
    format!("https://raw.githubusercontent.com/{}/main/{}", repo, path)
}

fn fetch_bytes(url: &str, pat: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(url)
        .header("Authorization", format!("token {}", pat))
        .send()
        .map_err(|e| format!("HTTP error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}: {}", resp.status(), url));
    }
    resp.bytes().map(|b| b.to_vec()).map_err(|e| format!("read error: {e}"))
}

pub fn pull(params: SyncParams, db_path: &Path) -> Result<usize, String> {
    let master_key = hex::decode(&params.master_key_hex)
        .map_err(|e| format!("invalid master_key_hex: {e}"))?;
    if master_key.len() != 32 {
        return Err(format!("master_key must be 32 bytes, got {}", master_key.len()));
    }
    let master_key: [u8; 32] = master_key.try_into().unwrap();

    // 拉取并解密 manifest
    let manifest_path = "manifest.json.enc";
    let manifest_url = github_raw_url(&params.github_repo, manifest_path);
    let manifest_enc = fetch_bytes(&manifest_url, &params.github_pat)?;
    let manifest_key = derive_file_key(&master_key, manifest_path)?;
    let manifest_json = decrypt_bytes(&manifest_key, &manifest_enc)?;
    let entries: Vec<serde_json::Value> = serde_json::from_slice(&manifest_json)
        .map_err(|e| format!("manifest parse error: {e}"))?;

    let conn = init_db(db_path).map_err(|e| format!("db init error: {e}"))?;
    let mut imported = 0;

    for entry in &entries {
        let enc_path = entry["enc_path"].as_str().unwrap_or_default();
        let session_id = entry["session_id"].as_str().unwrap_or_default();
        if enc_path.is_empty() || session_id.is_empty() {
            continue;
        }

        let file_url = github_raw_url(&params.github_repo, enc_path);
        let file_enc = match fetch_bytes(&file_url, &params.github_pat) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("warn: skip {session_id}: {e}");
                continue;
            }
        };

        let file_key = derive_file_key(&master_key, enc_path)?;
        let plaintext = decrypt_bytes(&file_key, &file_enc)?;
        let jsonl = String::from_utf8_lossy(&plaintext);

        // 解析第一行（session_meta）
        let first_line = jsonl.lines().next().unwrap_or("");
        let meta: serde_json::Value = serde_json::from_str(first_line)
            .unwrap_or(serde_json::Value::Null);

        let summary = meta["summary"].as_str().unwrap_or("");
        let cwd = meta["cwd"].as_str().unwrap_or("");
        let started_at = meta["started_at"].as_str().unwrap_or("");
        let last_event_at = meta["last_event_at"].as_str().unwrap_or("");
        let event_count = meta["event_count"].as_i64().unwrap_or(0);

        // transcript = 第一行之后的所有行（JSON 字符串数组）
        let transcript_lines: Vec<&str> = jsonl.lines().skip(1).collect();
        let transcript = transcript_lines.join("\n");

        upsert_session(
            &conn, session_id, summary, cwd, started_at, last_event_at,
            event_count, enc_path, &transcript,
        )
        .map_err(|e| format!("db upsert error: {e}"))?;

        imported += 1;
    }

    add_pull_record(&conn, imported, "ok").map_err(|e| format!("pull record error: {e}"))?;
    Ok(imported)
}

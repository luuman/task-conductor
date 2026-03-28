//! tc_sync.db 的创建和读写。
use rusqlite::{Connection, Result, params};
use std::path::Path;

#[derive(Debug, serde::Serialize)]
pub struct ArchivedSession {
    pub session_id: String,
    pub summary: String,
    pub cwd: String,
    pub started_at: String,
    pub last_event_at: String,
    pub event_count: i64,
    pub enc_path: String,
    pub transcript: String,
    pub synced_at: String,
    pub is_favorite: i64,
    pub is_deleted: i64,
}

pub fn init_db(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS archived_sessions (
            session_id    TEXT PRIMARY KEY,
            summary       TEXT NOT NULL DEFAULT '',
            cwd           TEXT NOT NULL DEFAULT '',
            started_at    TEXT NOT NULL DEFAULT '',
            last_event_at TEXT NOT NULL DEFAULT '',
            event_count   INTEGER NOT NULL DEFAULT 0,
            enc_path      TEXT NOT NULL DEFAULT '',
            transcript    TEXT NOT NULL DEFAULT '',
            synced_at     TEXT NOT NULL DEFAULT '',
            is_favorite   INTEGER NOT NULL DEFAULT 0,
            is_deleted    INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS pull_records (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            pulled_at   TEXT NOT NULL,
            files_count INTEGER NOT NULL,
            status      TEXT NOT NULL
        );
    ")?;
    Ok(conn)
}

pub fn upsert_session(
    conn: &Connection,
    session_id: &str,
    summary: &str,
    cwd: &str,
    started_at: &str,
    last_event_at: &str,
    event_count: i64,
    enc_path: &str,
    transcript: &str,
) -> Result<()> {
    let synced_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO archived_sessions
         (session_id, summary, cwd, started_at, last_event_at, event_count, enc_path, transcript, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![session_id, summary, cwd, started_at, last_event_at, event_count, enc_path, transcript, synced_at],
    )?;
    Ok(())
}

pub fn add_pull_record(conn: &Connection, files_count: usize, status: &str) -> Result<()> {
    let pulled_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO pull_records (pulled_at, files_count, status) VALUES (?1, ?2, ?3)",
        params![pulled_at, files_count as i64, status],
    )?;
    Ok(())
}

pub fn get_archived_sessions(conn: &Connection) -> Result<Vec<ArchivedSession>> {
    let mut stmt = conn.prepare(
        "SELECT session_id, summary, cwd, started_at, last_event_at, event_count,
                enc_path, transcript, synced_at, is_favorite, is_deleted
         FROM archived_sessions WHERE is_deleted = 0
         ORDER BY last_event_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ArchivedSession {
            session_id: row.get(0)?,
            summary: row.get(1)?,
            cwd: row.get(2)?,
            started_at: row.get(3)?,
            last_event_at: row.get(4)?,
            event_count: row.get(5)?,
            enc_path: row.get(6)?,
            transcript: row.get(7)?,
            synced_at: row.get(8)?,
            is_favorite: row.get(9)?,
            is_deleted: row.get(10)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_init_db_creates_tables() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("tc_sync.db");
        let conn = init_db(&db_path).unwrap();
        // 验证表存在
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM archived_sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_upsert_and_query_session() {
        let dir = tempdir().unwrap();
        let conn = init_db(&dir.path().join("tc_sync.db")).unwrap();
        upsert_session(&conn, "s1", "My Session", "/tmp", "2026-01-01", "2026-01-01", 5,
                       "encrypted/s1.jsonl.enc", r#"[{"role":"user"}]"#).unwrap();
        let sessions = get_archived_sessions(&conn).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "s1");
        assert_eq!(sessions[0].event_count, 5);
    }

    #[test]
    fn test_add_pull_record() {
        let dir = tempdir().unwrap();
        let conn = init_db(&dir.path().join("tc_sync.db")).unwrap();
        add_pull_record(&conn, 3, "ok").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM pull_records", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}

//! 应用启动时检查今日是否已 Pull，若未拉取则触发一次 Pull。
use rusqlite::Connection;

/// 检查今日（UTC）是否已完成 Pull。
pub fn pulled_today(conn: &Connection) -> bool {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pull_records WHERE pulled_at LIKE ?1",
            rusqlite::params![format!("{}%", today)],
            |r| r.get(0),
        )
        .unwrap_or(0);
    count > 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::importer::{init_db, add_pull_record};
    use tempfile::tempdir;

    #[test]
    fn test_pulled_today_false_when_no_records() {
        let dir = tempdir().unwrap();
        let conn = init_db(&dir.path().join("tc_sync.db")).unwrap();
        assert!(!pulled_today(&conn));
    }

    #[test]
    fn test_pulled_today_true_after_record() {
        let dir = tempdir().unwrap();
        let conn = init_db(&dir.path().join("tc_sync.db")).unwrap();
        add_pull_record(&conn, 1, "ok").unwrap();
        assert!(pulled_today(&conn));
    }
}

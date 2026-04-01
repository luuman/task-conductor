mod sync;

use crate::sync::{
    importer::{init_db, get_archived_sessions, ArchivedSession},
    puller::{pull, SyncParams},
};
use serde::Serialize;
use tauri::Manager;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// ── 文件树类型 ──

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: Option<u64>,
    modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileEntry>>,
}

// ── 缓存 ──

struct CachedDir {
    entries: Vec<FileEntry>,
    cached_at: Instant,
}

pub struct FileCache {
    dirs: Mutex<HashMap<String, CachedDir>>,
}

impl FileCache {
    fn new() -> Self {
        Self {
            dirs: Mutex::new(HashMap::new()),
        }
    }
}

// ── 常量 ──

const CACHE_TTL_SECS: u64 = 30;

const IGNORE_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".cache",
    ".DS_Store",
    "Thumbs.db",
];

const HIDDEN_EXCEPTIONS: &[&str] = &[".env.example", ".gitignore", ".editorconfig"];

// ── 辅助函数 ──

fn should_ignore(name: &str) -> bool {
    if IGNORE_NAMES.contains(&name) {
        return true;
    }
    name.starts_with('.') && !HIDDEN_EXCEPTIONS.contains(&name)
}

fn format_timestamp(time: SystemTime) -> String {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

fn read_dir_entries(root: &Path, dir: &Path) -> Result<Vec<FileEntry>, String> {
    let rd = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))?;
    let mut items = Vec::new();

    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if should_ignore(&name) {
            continue;
        }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_dir = meta.is_dir();
        let rel_path = entry
            .path()
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let modified = meta.modified().map(format_timestamp).unwrap_or_default();

        items.push(FileEntry {
            name,
            path: rel_path,
            is_dir,
            size: if is_dir { None } else { Some(meta.len()) },
            modified,
            children: None,
        });
    }

    items.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(items)
}

fn scan_recursive(
    root: &Path,
    dir: &Path,
    depth: u32,
    max_depth: u32,
) -> Result<Vec<FileEntry>, String> {
    let mut items = read_dir_entries(root, dir)?;

    if depth < max_depth {
        for item in &mut items {
            if item.is_dir {
                let child_path = root.join(&item.path);
                item.children =
                    Some(scan_recursive(root, &child_path, depth + 1, max_depth).unwrap_or_default());
            }
        }
    }

    Ok(items)
}

// ── Tauri 命令 ──

/// 列出目录的直接子项（带缓存）
#[tauri::command]
fn list_dir(
    state: tauri::State<'_, FileCache>,
    root: String,
    rel_path: String,
) -> Result<Vec<FileEntry>, String> {
    let root_path = PathBuf::from(&root);
    let target = if rel_path.is_empty() || rel_path == "." {
        root_path.clone()
    } else {
        root_path.join(&rel_path)
    };

    let canon_root = root_path
        .canonicalize()
        .map_err(|e| format!("根路径无效: {e}"))?;
    let canon_target = target
        .canonicalize()
        .map_err(|e| format!("目标路径无效: {e}"))?;
    if !canon_target.starts_with(&canon_root) {
        return Err("路径越界".to_string());
    }

    // 查缓存
    let cache_key = format!("{root}:{rel_path}");
    {
        let cache = state.dirs.lock().map_err(|_| "缓存锁错误")?;
        if let Some(cached) = cache.get(&cache_key) {
            if cached.cached_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS) {
                return Ok(cached.entries.clone());
            }
        }
    }

    let entries = read_dir_entries(&root_path, &canon_target)?;

    // 写缓存
    {
        let mut cache = state.dirs.lock().map_err(|_| "缓存锁错误")?;
        cache.insert(
            cache_key,
            CachedDir {
                entries: entries.clone(),
                cached_at: Instant::now(),
            },
        );
    }

    Ok(entries)
}

/// 扫描目录树到指定深度（带缓存根级）
#[tauri::command]
fn scan_tree(
    state: tauri::State<'_, FileCache>,
    root: String,
    max_depth: u32,
) -> Result<Vec<FileEntry>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("目录不存在: {root}"));
    }

    let entries = scan_recursive(&root_path, &root_path, 0, max_depth)?;

    // 缓存根级（扁平）
    let cache_key = format!("{root}:");
    {
        let mut cache = state.dirs.lock().map_err(|_| "缓存锁错误")?;
        cache.insert(
            cache_key,
            CachedDir {
                entries: entries
                    .iter()
                    .map(|e| FileEntry {
                        children: None,
                        ..e.clone()
                    })
                    .collect(),
                cached_at: Instant::now(),
            },
        );
    }

    Ok(entries)
}

/// 清除文件缓存
#[tauri::command]
fn invalidate_file_cache(
    state: tauri::State<'_, FileCache>,
    root: String,
    rel_path: Option<String>,
) -> Result<(), String> {
    let mut cache = state.dirs.lock().map_err(|_| "缓存锁错误")?;
    let prefix = format!("{root}:");
    match rel_path {
        Some(path) => {
            cache.remove(&format!("{prefix}{path}"));
        }
        None => {
            cache.retain(|k, _| !k.starts_with(&prefix));
        }
    }
    Ok(())
}

/// 在新 WebviewWindow 中打开预览 URL
#[tauri::command]
async fn open_preview_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    let label = format!("preview-{}", url.len());
    WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::External(
        url.parse().map_err(|e| format!("无效 URL: {e}"))?
    ))
    .title("Preview")
    .inner_size(1280.0, 800.0)
    .build()
    .map_err(|e| format!("打开预览窗口失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ── Sync 辅助 ──

fn get_db_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("tc_sync.db")
}

// ── Sync Tauri 命令 ──

#[tauri::command]
fn sync_pull(
    app: tauri::AppHandle,
    master_key_hex: String,
    github_repo: String,
    github_pat: String,
) -> Result<usize, String> {
    let db_path = get_db_path(&app);
    let params = SyncParams { master_key_hex, github_repo, github_pat };
    pull(params, &db_path)
}

#[tauri::command]
fn get_archived_sessions_cmd(app: tauri::AppHandle) -> Result<Vec<ArchivedSession>, String> {
    let db_path = get_db_path(&app);
    let conn = init_db(&db_path).map_err(|e| e.to_string())?;
    get_archived_sessions(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_favorite(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = init_db(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE archived_sessions SET is_favorite = CASE WHEN is_favorite=1 THEN 0 ELSE 1 END WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_archived(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = init_db(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE archived_sessions SET is_deleted = 1 WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(FileCache::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_dir,
            scan_tree,
            invalidate_file_cache,
            sync_pull,
            get_archived_sessions_cmd,
            toggle_favorite,
            delete_archived
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

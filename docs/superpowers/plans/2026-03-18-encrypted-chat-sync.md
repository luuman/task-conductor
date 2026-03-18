# 加密对话同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Claude Code 本地对话数据加密同步到 GitHub 私有仓库，Tauri 桌面端可拉取解密并在 Sessions 页面展示。

**Architecture:** Rust `sync/` 模块实现加密/解密/Git/扫描/导入全链路。Tauri Commands 暴露给前端。SessionEnd Hook 触发自动同步。前端 Settings 嵌入配置面板，Sessions 页面融合实时+历史数据。

**Tech Stack:** Rust (aes-gcm, argon2, hkdf, git2, zstd, walkdir) + Tauri 2 + React/TypeScript/Zustand

**Spec:** `docs/superpowers/specs/2026-03-18-encrypted-chat-sync-design.md`

---

## File Structure

### Rust 新建文件

| 文件 | 职责 |
|------|------|
| `src-tauri/src/sync/mod.rs` | 模块入口，内部 Mutex，暴露公开 API |
| `src-tauri/src/sync/crypto.rs` | Argon2id 派生 + HKDF 子密钥 + AES-256-GCM + zeroize |
| `src-tauri/src/sync/manifest.rs` | meta.json / manifest.json.enc 读写 + 增量 diff |
| `src-tauri/src/sync/scanner.rs` | 扫描 ~/.claude/，收集 JSONL + subagents 文件列表 |
| `src-tauri/src/sync/git.rs` | git2 clone/fetch/commit/push + SSH/PAT 认证 |
| `src-tauri/src/sync/importer.rs` | 解密 JSONL → 解析 → 写入 tc_sync.db |
| `src-tauri/src/sync/compress.rs` | zstd 压缩/解压 |
| `src-tauri/src/bin/tc_sync.rs` | `tc-sync` 独立二进制入口（通过 lib crate 复用 sync/ 模块） |

### Rust 修改文件

| 文件 | 改动 |
|------|------|
| `src-tauri/Cargo.toml` | 新增依赖 + `[[bin]]` target |
| `src-tauri/src/lib.rs` | 注册 sync commands，`pub mod sync` |

### 重要路径说明

- Rust 文件路径相对于 `tauri/` 目录，git 命令中需加 `tauri/` 前缀
- Cargo 包名为 `task-conductor-app`（非 task-conductor-tauri）
- CLI 二进制在 `src/bin/tc_sync.rs`（非 `src/sync/cli.rs`），通过 `use task_conductor_app::sync` 引用 lib crate

### 前端新建文件

| 文件 | 职责 |
|------|------|
| `src/lib/api/sync.ts` | 封装 Tauri invoke + event 监听 |
| `src/lib/store/sync-store.ts` | Zustand store（同步状态） |
| `src/lib/types/session.ts` | UnifiedSession 统一类型 |
| `src/features/admin/pages/settings/SyncSettings.tsx` | 同步配置面板 |

### 前端修改文件

| 文件 | 改动 |
|------|------|
| `src/features/admin/pages/sessions/` | 融合 synced 数据源 |
| `src/features/admin/pages/settings/` | 嵌入 SyncSettings |

### 脚本文件

| 文件 | 职责 |
|------|------|
| `scripts/install-sync-hook.sh` | 注册 SessionEnd hook |

---

## Task 1: Cargo.toml 依赖 + 模块骨架

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/sync/mod.rs`
- Create: `src-tauri/src/sync/crypto.rs`
- Create: `src-tauri/src/sync/manifest.rs`
- Create: `src-tauri/src/sync/scanner.rs`
- Create: `src-tauri/src/sync/git.rs`
- Create: `src-tauri/src/sync/importer.rs`
- Create: `src-tauri/src/sync/compress.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 在 Cargo.toml 添加依赖**

```toml
# 在 [dependencies] 下追加
aes-gcm = "0.10"
argon2 = "0.5"
hkdf = "0.12"
sha2 = "0.10"
hmac = "0.12"
hex = "0.4"
git2 = "0.19"
walkdir = "2"
zeroize = { version = "1", features = ["derive"] }
zstd = "0.13"
rand = "0.8"
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
hostname = "0.4"
dirs = "5"
rusqlite = { version = "0.31", features = ["bundled"] }
libc = "0.2"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: 创建 sync/mod.rs 骨架**

```rust
pub mod crypto;
pub mod manifest;
pub mod scanner;
pub mod git;
pub mod importer;
pub mod compress;

use std::sync::Mutex;
use std::path::PathBuf;

pub struct SyncManager {
    repo_path: PathBuf,
    claude_dir: PathBuf,
    master_key: Option<Vec<u8>>,
}

/// 全局锁：同一时刻只有一个 sync 操作
static SYNC_LOCK: Mutex<()> = Mutex::new(());

impl SyncManager {
    pub fn new(repo_path: PathBuf, claude_dir: PathBuf) -> Self {
        Self {
            repo_path,
            claude_dir,
            master_key: None,
        }
    }
}
```

- [ ] **Step 3: 创建其余空模块文件**

每个文件只写 `// TODO: implement` 占位，确保编译通过。

- [ ] **Step 4: 在 lib.rs 中声明 sync 模块**

```rust
pub mod sync;  // pub 以便 bin target 可以引用
```

- [ ] **Step 5: 编译验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo build -p task-conductor-app 2>&1 | tail -20`
Expected: 编译成功（可有 unused warnings）

- [ ] **Step 6: Commit**

```bash
git add tauri/src-tauri/Cargo.toml tauri/src-tauri/src/sync/ tauri/src-tauri/src/lib.rs
git commit -m "feat(sync): add module skeleton and dependencies"
```

---

## Task 2: crypto.rs — 密钥派生 + 加密/解密

**Files:**
- Create: `src-tauri/src/sync/crypto.rs`

- [ ] **Step 1: 实现 derive_master_key**

```rust
use argon2::{Argon2, Algorithm, Version, Params};
use hkdf::Hkdf;
use sha2::Sha256;
use aes_gcm::{Aes256Gcm, Key, Nonce, KeyInit};
use aes_gcm::aead::Aead;
use rand::RngCore;
use zeroize::Zeroize;

/// .enc 文件头: "TCSN" + version
pub const ENC_MAGIC: &[u8; 4] = b"TCSN";
pub const ENC_VERSION: u8 = 0x01;
pub const HEADER_LEN: usize = 5;
pub const NONCE_LEN: usize = 12;

#[derive(Clone, Zeroize)]
#[zeroize(drop)]
pub struct MasterKey(pub [u8; 32]);

pub struct Argon2Params {
    pub m_cost: u32,  // 65536 (64MB)
    pub t_cost: u32,  // 3
    pub p_cost: u32,  // 1
}

impl Default for Argon2Params {
    fn default() -> Self {
        Self { m_cost: 65536, t_cost: 3, p_cost: 1 }
    }
}

pub fn generate_salt() -> [u8; 32] {
    let mut salt = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

pub fn derive_master_key(password: &str, salt: &[u8; 32], params: &Argon2Params) -> Result<MasterKey, String> {
    let argon2_params = Params::new(params.m_cost, params.t_cost, params.p_cost, Some(32))
        .map_err(|e| format!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("argon2 hash: {e}"))?;
    Ok(MasterKey(key))
}
```

- [ ] **Step 2: 实现 derive_file_key (HKDF)**

```rust
pub fn derive_file_key(master: &MasterKey, file_path: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, &master.0);
    let mut file_key = [0u8; 32];
    hk.expand(file_path.as_bytes(), &mut file_key)
        .expect("HKDF expand should not fail for 32 bytes");
    file_key
}
```

- [ ] **Step 3: 实现 encrypt_data / decrypt_data**

```rust
pub fn encrypt_data(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("encrypt: {e}"))?;

    // header + nonce + ciphertext(含 auth tag)
    let mut out = Vec::with_capacity(HEADER_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(ENC_MAGIC);
    out.push(ENC_VERSION);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn decrypt_data(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < HEADER_LEN + NONCE_LEN + 16 {
        return Err("data too short".into());
    }
    if &data[..4] != ENC_MAGIC {
        return Err("invalid magic".into());
    }
    if data[4] != ENC_VERSION {
        return Err(format!("unsupported enc version: {}", data[4]));
    }
    let nonce = Nonce::from_slice(&data[HEADER_LEN..HEADER_LEN + NONCE_LEN]);
    let ciphertext = &data[HEADER_LEN + NONCE_LEN..];

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(nonce, ciphertext)
        .map_err(|e| format!("decrypt: {e}"))
}
```

- [ ] **Step 4: 实现 compute_hmac**

```rust
use hmac::{Hmac, Mac};
type HmacSha256 = Hmac<Sha256>;

pub fn compute_hmac(master: &MasterKey, data: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(&master.0)
        .expect("HMAC key length is valid");
    mac.update(data);
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}
```

注意：需在 Cargo.toml 补上 `hex = "0.4"`。

- [ ] **Step 5: 写内联测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip_encrypt_decrypt() {
        let password = "test-password-123";
        let salt = generate_salt();
        let master = derive_master_key(password, &salt, &Argon2Params::default()).unwrap();
        let file_key = derive_file_key(&master, "test/file.jsonl");

        let plaintext = b"hello world, this is a test";
        let encrypted = encrypt_data(&file_key, plaintext).unwrap();
        let decrypted = decrypt_data(&file_key, &encrypted).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_key_fails() {
        let salt = generate_salt();
        let key1 = derive_master_key("password1", &salt, &Argon2Params::default()).unwrap();
        let key2 = derive_master_key("password2", &salt, &Argon2Params::default()).unwrap();
        let fk1 = derive_file_key(&key1, "f");
        let fk2 = derive_file_key(&key2, "f");

        let encrypted = encrypt_data(&fk1, b"secret").unwrap();
        assert!(decrypt_data(&fk2, &encrypted).is_err());
    }

    #[test]
    fn test_enc_header() {
        let key = [0u8; 32];
        let encrypted = encrypt_data(&key, b"data").unwrap();
        assert_eq!(&encrypted[..4], b"TCSN");
        assert_eq!(encrypted[4], 0x01);
    }

    #[test]
    fn test_hmac_deterministic() {
        let salt = generate_salt();
        let master = derive_master_key("pass", &salt, &Argon2Params::default()).unwrap();
        let h1 = compute_hmac(&master, b"data");
        let h2 = compute_hmac(&master, b"data");
        assert_eq!(h1, h2);
    }
}
```

- [ ] **Step 6: 编译 + 跑测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo test -p task-conductor-tauri --lib sync::crypto -- --nocapture 2>&1 | tail -30`
Expected: 4 tests passed

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/sync/crypto.rs src-tauri/Cargo.toml
git commit -m "feat(sync): implement crypto module — Argon2id + HKDF + AES-256-GCM"
```

---

## Task 3: compress.rs — zstd 压缩/解压

**Files:**
- Create: `src-tauri/src/sync/compress.rs`

- [ ] **Step 1: 实现压缩/解压**

```rust
use std::io::{Read, Write};

/// zstd 压缩，level 3（默认平衡）
pub fn compress(data: &[u8]) -> Result<Vec<u8>, String> {
    zstd::encode_all(data, 3).map_err(|e| format!("compress: {e}"))
}

pub fn decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    zstd::decode_all(data).map_err(|e| format!("decompress: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let original = b"{\"type\":\"message\",\"content\":\"hello\"}\n".repeat(100);
        let compressed = compress(&original).unwrap();
        assert!(compressed.len() < original.len()); // JSONL 压缩率高
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(decompressed, original);
    }
}
```

- [ ] **Step 2: 测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo test -p task-conductor-tauri --lib sync::compress`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/sync/compress.rs
git commit -m "feat(sync): add zstd compress/decompress"
```

---

## Task 4: scanner.rs — 扫描 ~/.claude/ 对话文件

**Files:**
- Create: `src-tauri/src/sync/scanner.rs`

- [ ] **Step 1: 定义 ScannedFile 结构**

```rust
use std::path::{Path, PathBuf};
use std::fs;
use walkdir::WalkDir;
use sha2::{Sha256, Digest};

#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub abs_path: PathBuf,
    /// 相对于 ~/.claude/ 的路径
    pub rel_path: String,
    /// 文件大小 (bytes)
    pub size: u64,
    /// 修改时间 (unix timestamp ms)
    pub modified: u64,
}
```

- [ ] **Step 2: 实现 scan_claude_dir**

```rust
/// 扫描 ~/.claude/projects/ 下所有 .jsonl 文件 + subagents/ + history.jsonl
pub fn scan_claude_dir(claude_dir: &Path) -> Result<Vec<ScannedFile>, String> {
    let mut files = Vec::new();

    // 1. projects/**/*.jsonl
    let projects_dir = claude_dir.join("projects");
    if projects_dir.exists() {
        for entry in WalkDir::new(&projects_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            let ext = path.extension().and_then(|e| e.to_str());
            if ext == Some("jsonl") || ext == Some("json") {
                if let Some(sf) = scanned_file(claude_dir, path) {
                    files.push(sf);
                }
            }
        }
    }

    // 2. history.jsonl
    let history = claude_dir.join("history.jsonl");
    if history.exists() {
        if let Some(sf) = scanned_file(claude_dir, &history) {
            files.push(sf);
        }
    }

    Ok(files)
}

fn scanned_file(base: &Path, path: &Path) -> Option<ScannedFile> {
    let meta = fs::metadata(path).ok()?;
    let rel = path.strip_prefix(base).ok()?.to_string_lossy().to_string();
    let modified = meta.modified().ok()?
        .duration_since(std::time::UNIX_EPOCH).ok()?
        .as_millis() as u64;
    Some(ScannedFile {
        abs_path: path.to_path_buf(),
        rel_path: rel,
        size: meta.len(),
        modified,
    })
}

/// 项目路径 → 哈希目录名（HMAC 需要 master key，这里只做 SHA-256 前缀）
pub fn hash_project_path(project_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(project_path.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8]) // 16 hex chars
}
```

- [ ] **Step 3: 写测试（使用临时目录）**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_scan_finds_jsonl() {
        let tmp = TempDir::new().unwrap();
        let projects = tmp.path().join("projects").join("-home-user-proj");
        fs::create_dir_all(&projects).unwrap();
        fs::write(projects.join("abc123.jsonl"), "{}").unwrap();
        fs::write(projects.join("readme.md"), "# hi").unwrap();
        fs::write(tmp.path().join("history.jsonl"), "{}").unwrap();

        let files = scan_claude_dir(tmp.path()).unwrap();
        assert_eq!(files.len(), 2); // abc123.jsonl + history.jsonl
        assert!(files.iter().any(|f| f.rel_path.ends_with(".jsonl")));
    }

    #[test]
    fn test_hash_project_path() {
        let h = hash_project_path("/home/user/project");
        assert_eq!(h.len(), 16);
    }
}
```

注意：Cargo.toml 加 `tempfile = "3"` 到 `[dev-dependencies]`。

- [ ] **Step 4: 测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo test -p task-conductor-tauri --lib sync::scanner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sync/scanner.rs src-tauri/Cargo.toml
git commit -m "feat(sync): implement scanner — walk ~/.claude/ for JSONL files"
```

---

## Task 5: manifest.rs — 加密索引 + 增量 diff

**Files:**
- Create: `src-tauri/src/sync/manifest.rs`

- [ ] **Step 1: 定义数据结构**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::fs;

use super::crypto::{MasterKey, Argon2Params, encrypt_data, decrypt_data, derive_file_key, compute_hmac};

/// meta.json（明文，仅加密参数）
#[derive(Serialize, Deserialize, Clone)]
pub struct MetaJson {
    pub version: u32,
    pub enc_version: u32,
    pub salt: String,          // base64
    pub argon2_params: Argon2ParamsSerde,
    pub verify_blob: String,   // base64 加密后的固定字符串
    pub created_at: String,
    pub hostname: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Argon2ParamsSerde {
    pub m: u32,
    pub t: u32,
    pub p: u32,
}

/// manifest.json（加密存储）
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Manifest {
    pub files: HashMap<String, FileEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub hmac: String,
    pub size: u64,
    pub compressed_size: u64,
    pub modified: String,
    pub source_path_hint: String,
}

/// local-state.json（本地，不进 git）
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct LocalState {
    pub files: HashMap<String, LocalFileState>,
    pub last_push: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LocalFileState {
    pub hmac: String,
    pub modified: u64,
    pub dirty: bool,
}
```

- [ ] **Step 2: 实现 meta.json 读写 + verify_blob**

```rust
const VERIFY_PLAINTEXT: &[u8] = b"tc-sync-password-verify-v1";

impl MetaJson {
    pub fn create(salt: &[u8; 32], master: &MasterKey, params: &Argon2Params) -> Result<Self, String> {
        let file_key = derive_file_key(master, "__verify__");
        let encrypted = encrypt_data(&file_key, VERIFY_PLAINTEXT)?;
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".into());

        Ok(Self {
            version: 1,
            enc_version: 1,
            salt: base64::engine::general_purpose::STANDARD.encode(salt),
            argon2_params: Argon2ParamsSerde {
                m: params.m_cost,
                t: params.t_cost,
                p: params.p_cost,
            },
            verify_blob: base64::engine::general_purpose::STANDARD.encode(&encrypted),
            created_at: chrono::Utc::now().to_rfc3339(),
            hostname,
        })
    }

    pub fn verify_password(&self, master: &MasterKey) -> bool {
        let blob = match base64::engine::general_purpose::STANDARD
            .decode(&self.verify_blob) {
            Ok(b) => b,
            Err(_) => return false,
        };
        let file_key = derive_file_key(master, "__verify__");
        match decrypt_data(&file_key, &blob) {
            Ok(plain) => plain == VERIFY_PLAINTEXT,
            Err(_) => false,
        }
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        let data = fs::read_to_string(path).map_err(|e| format!("read meta: {e}"))?;
        serde_json::from_str(&data).map_err(|e| format!("parse meta: {e}"))
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("serialize: {e}"))?;
        fs::write(path, json).map_err(|e| format!("write meta: {e}"))
    }
}
```

需要在文件顶部加 `use base64::Engine;`。

- [ ] **Step 3: 实现 manifest 加密读写**

```rust
impl Manifest {
    pub fn encrypt_and_save(&self, path: &Path, master: &MasterKey) -> Result<(), String> {
        let json = serde_json::to_vec(self).map_err(|e| format!("serialize: {e}"))?;
        let key = derive_file_key(master, "__manifest__");
        let encrypted = encrypt_data(&key, &json)?;
        fs::write(path, encrypted).map_err(|e| format!("write manifest: {e}"))
    }

    pub fn decrypt_and_load(path: &Path, master: &MasterKey) -> Result<Self, String> {
        let data = fs::read(path).map_err(|e| format!("read manifest: {e}"))?;
        let key = derive_file_key(master, "__manifest__");
        let json = decrypt_data(&key, &data)?;
        serde_json::from_slice(&json).map_err(|e| format!("parse manifest: {e}"))
    }
}
```

- [ ] **Step 4: 实现增量 diff**

```rust
use super::scanner::ScannedFile;

pub struct DiffResult {
    /// 需要加密上传的文件
    pub to_encrypt: Vec<ScannedFile>,
    /// 无变化可跳过的文件
    pub unchanged: usize,
}

impl LocalState {
    pub fn diff(&self, scanned: &[ScannedFile], master: &MasterKey) -> DiffResult {
        let mut to_encrypt = Vec::new();
        let mut unchanged = 0;

        for file in scanned {
            let data = match fs::read(&file.abs_path) {
                Ok(d) => d,
                Err(_) => continue,
            };
            let hmac = compute_hmac(master, &data);

            match self.files.get(&file.rel_path) {
                Some(state) if state.hmac == hmac && !state.dirty => {
                    unchanged += 1;
                }
                _ => {
                    to_encrypt.push(file.clone());
                }
            }
        }

        DiffResult { to_encrypt, unchanged }
    }

    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("{e}"))?;
        fs::write(path, json).map_err(|e| format!("{e}"))
    }
}
```

- [ ] **Step 5: 写测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::crypto::{generate_salt, derive_master_key};
    use tempfile::TempDir;

    fn test_master_key() -> MasterKey {
        let salt = generate_salt();
        derive_master_key("test", &salt, &Argon2Params::default()).unwrap()
    }

    #[test]
    fn test_meta_verify_correct_password() {
        let salt = generate_salt();
        let master = derive_master_key("mypass", &salt, &Argon2Params::default()).unwrap();
        let meta = MetaJson::create(&salt, &master, &Argon2Params::default()).unwrap();
        assert!(meta.verify_password(&master));
    }

    #[test]
    fn test_meta_verify_wrong_password() {
        let salt = generate_salt();
        let master1 = derive_master_key("right", &salt, &Argon2Params::default()).unwrap();
        let master2 = derive_master_key("wrong", &salt, &Argon2Params::default()).unwrap();
        let meta = MetaJson::create(&salt, &master1, &Argon2Params::default()).unwrap();
        assert!(!meta.verify_password(&master2));
    }

    #[test]
    fn test_manifest_encrypt_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let master = test_master_key();
        let mut manifest = Manifest::default();
        manifest.files.insert("test.enc".into(), FileEntry {
            hmac: "abc".into(),
            size: 100,
            compressed_size: 50,
            modified: "2026-01-01".into(),
            source_path_hint: "~/.claude/test.jsonl".into(),
        });

        let path = tmp.path().join("manifest.json.enc");
        manifest.encrypt_and_save(&path, &master).unwrap();

        let loaded = Manifest::decrypt_and_load(&path, &master).unwrap();
        assert_eq!(loaded.files.len(), 1);
        assert!(loaded.files.contains_key("test.enc"));
    }
}
```

- [ ] **Step 6: 测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo test -p task-conductor-tauri --lib sync::manifest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/sync/manifest.rs
git commit -m "feat(sync): implement manifest — encrypted index + incremental diff"
```

---

## Task 6: git.rs — Git 操作

**Files:**
- Create: `src-tauri/src/sync/git.rs`

- [ ] **Step 1: 实现 GitRepo 结构**

```rust
use git2::{Repository, Signature, Cred, RemoteCallbacks, PushOptions, FetchOptions};
use std::path::{Path, PathBuf};

pub enum AuthMethod {
    Ssh { key_path: PathBuf },
    Pat { token: String },
}

pub struct GitRepo {
    repo: Repository,
    auth: AuthMethod,
}

impl GitRepo {
    /// 克隆或打开已有仓库
    pub fn open_or_clone(repo_path: &Path, remote_url: &str, auth: &AuthMethod, branch: &str) -> Result<Self, String> {
        let repo = if repo_path.join(".git").exists() {
            Repository::open(repo_path).map_err(|e| format!("git open: {e}"))?
        } else {
            std::fs::create_dir_all(repo_path).map_err(|e| format!("mkdir: {e}"))?;
            let mut callbacks = Self::make_callbacks(auth);
            let mut fo = FetchOptions::new();
            fo.remote_callbacks(callbacks);
            let mut builder = git2::build::RepoBuilder::new();
            builder.fetch_options(fo);
            builder.branch(branch);
            builder.clone(remote_url, repo_path)
                .map_err(|e| format!("git clone: {e}"))?
        };

        // 确保在正确的 branch
        let auth_clone = auth.clone();
        let git = Self { repo, auth: auth_clone };
        git.checkout_or_create_branch(branch)?;
        Ok(git)
    }

    fn make_callbacks(auth: &AuthMethod) -> RemoteCallbacks<'_> {
        let mut callbacks = RemoteCallbacks::new();
        match auth {
            AuthMethod::Ssh { key_path } => {
                let kp = key_path.clone();
                callbacks.credentials(move |_url, username, _allowed| {
                    Cred::ssh_key(
                        username.unwrap_or("git"),
                        None,
                        &kp,
                        None,
                    )
                });
            }
            AuthMethod::Pat { token } => {
                let t = token.clone();
                callbacks.credentials(move |_url, _username, _allowed| {
                    Cred::userpass_plaintext("x-access-token", &t)
                });
            }
        }
        callbacks
    }

    fn checkout_or_create_branch(&self, name: &str) -> Result<(), String> {
        // 尝试切到已有分支，不存在则创建
        let head = self.repo.head().ok();
        let commit = head.as_ref()
            .and_then(|h| h.peel_to_commit().ok());

        match self.repo.find_branch(name, git2::BranchType::Local) {
            Ok(branch) => {
                let refname = branch.get().name().unwrap_or("");
                self.repo.set_head(refname).map_err(|e| format!("set head: {e}"))?;
            }
            Err(_) => {
                if let Some(c) = commit {
                    self.repo.branch(name, &c, false)
                        .map_err(|e| format!("create branch: {e}"))?;
                    let refname = format!("refs/heads/{name}");
                    self.repo.set_head(&refname).map_err(|e| format!("set head: {e}"))?;
                }
                // 空仓库：第一次 commit 后自然在此 branch
            }
        }
        Ok(())
    }
}
```

- [ ] **Step 2: 实现 add_commit_push**

```rust
impl GitRepo {
    /// stage 所有变更 → commit → push
    pub fn add_commit_push(&self, message: &str, branch: &str) -> Result<(), String> {
        // Stage all
        let mut index = self.repo.index().map_err(|e| format!("index: {e}"))?;
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(|e| format!("add all: {e}"))?;
        index.write().map_err(|e| format!("write index: {e}"))?;

        let tree_oid = index.write_tree().map_err(|e| format!("write tree: {e}"))?;
        let tree = self.repo.find_tree(tree_oid).map_err(|e| format!("find tree: {e}"))?;

        let sig = Signature::now("tc-sync", "tc-sync@local").map_err(|e| format!("sig: {e}"))?;

        let parent = self.repo.head().ok()
            .and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.as_ref().map(|p| vec![p]).unwrap_or_default();

        self.repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .map_err(|e| format!("commit: {e}"))?;

        // Push
        let mut remote = self.repo.find_remote("origin")
            .map_err(|e| format!("find remote: {e}"))?;
        let mut callbacks = Self::make_callbacks(&self.auth);
        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(callbacks);
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        remote.push(&[&refspec], Some(&mut push_opts))
            .map_err(|e| format!("push: {e}"))?;

        Ok(())
    }

    /// Fetch 所有 sync/* 远程分支
    pub fn fetch_all_sync_branches(&self) -> Result<Vec<String>, String> {
        let mut remote = self.repo.find_remote("origin")
            .map_err(|e| format!("find remote: {e}"))?;
        let mut callbacks = Self::make_callbacks(&self.auth);
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(callbacks);
        remote.fetch(&["refs/heads/sync/*:refs/remotes/origin/sync/*"], Some(&mut fo), None)
            .map_err(|e| format!("fetch: {e}"))?;

        // 列出所有 origin/sync/* 分支
        let mut branches = Vec::new();
        for branch in self.repo.branches(Some(git2::BranchType::Remote))
            .map_err(|e| format!("list branches: {e}"))? {
            let (branch, _) = branch.map_err(|e| format!("branch: {e}"))?;
            if let Some(name) = branch.name().ok().flatten() {
                if name.starts_with("origin/sync/") {
                    branches.push(name.trim_start_matches("origin/").to_string());
                }
            }
        }
        Ok(branches)
    }

    pub fn repo_path(&self) -> &Path {
        self.repo.workdir().unwrap_or(self.repo.path())
    }
}
```

- [ ] **Step 3: 为 AuthMethod 实现 Clone**

```rust
impl Clone for AuthMethod {
    fn clone(&self) -> Self {
        match self {
            Self::Ssh { key_path } => Self::Ssh { key_path: key_path.clone() },
            Self::Pat { token } => Self::Pat { token: token.clone() },
        }
    }
}
```

- [ ] **Step 4: 编译验证**（git2 操作难以单元测试，集成测试后续补）

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo build -p task-conductor-tauri 2>&1 | tail -20`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sync/git.rs
git commit -m "feat(sync): implement git module — clone/fetch/commit/push with SSH/PAT auth"
```

---

## Task 7: mod.rs — SyncManager 主逻辑（push / pull）

**Files:**
- Modify: `src-tauri/src/sync/mod.rs`

- [ ] **Step 1: 实现 sync_push 主流程**

```rust
use std::sync::Mutex;
use std::path::{Path, PathBuf};
use std::fs;
use tauri::{AppHandle, Emitter};

pub mod crypto;
pub mod manifest;
pub mod scanner;
pub mod git;
pub mod importer;
pub mod compress;

use crypto::{MasterKey, Argon2Params, derive_master_key, derive_file_key, encrypt_data, compute_hmac, generate_salt};
use manifest::{MetaJson, Manifest, LocalState, FileEntry};
use scanner::{scan_claude_dir, hash_project_path, ScannedFile};
use git::{GitRepo, AuthMethod};
use compress::{compress, decompress};
use base64::Engine;

static SYNC_LOCK: Mutex<()> = Mutex::new(());

#[derive(serde::Serialize, Clone)]
pub struct SyncResult {
    pub added: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub total_size: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct SyncProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub file_name: Option<String>,
}

pub fn push(
    repo_path: &Path,
    claude_dir: &Path,
    password: &str,
    branch: &str,
    auth: &AuthMethod,
    remote_url: &str,
    app: Option<&AppHandle>,
) -> Result<SyncResult, String> {
    let _lock = SYNC_LOCK.lock().map_err(|e| format!("lock: {e}"))?;

    // 1. 打开仓库
    let git = GitRepo::open_or_clone(repo_path, remote_url, auth, branch)?;

    // 2. 读取或创建 meta.json
    let meta_path = repo_path.join("meta.json");
    let (meta, master) = if meta_path.exists() {
        let meta = MetaJson::load(&meta_path)?;
        let salt_bytes: [u8; 32] = base64::engine::general_purpose::STANDARD
            .decode(&meta.salt).map_err(|e| format!("decode salt: {e}"))?
            .try_into().map_err(|_| "invalid salt length")?;
        let params = Argon2Params {
            m_cost: meta.argon2_params.m,
            t_cost: meta.argon2_params.t,
            p_cost: meta.argon2_params.p,
        };
        let master = derive_master_key(password, &salt_bytes, &params)?;
        if !meta.verify_password(&master) {
            return Err("密码错误".into());
        }
        (meta, master)
    } else {
        let salt = generate_salt();
        let params = Argon2Params::default();
        let master = derive_master_key(password, &salt, &params)?;
        let meta = MetaJson::create(&salt, &master, &params)?;
        meta.save(&meta_path)?;
        (meta, master)
    };

    // 3. 扫描
    emit_progress(app, "scanning", 0, 0, None);
    let scanned = scan_claude_dir(claude_dir)?;

    // 4. 增量 diff
    let state_path = repo_path.join(".local-state.json");
    let local_state = LocalState::load(&state_path);
    let diff = local_state.diff(&scanned, &master);

    let total = diff.to_encrypt.len();
    let mut added = 0;
    let mut total_size = 0u64;

    // 5. 加密变更文件
    let encrypted_dir = repo_path.join("encrypted");
    let mut new_manifest = Manifest::decrypt_and_load(
        &repo_path.join("manifest.json.enc"), &master
    ).unwrap_or_default();
    let mut new_state = local_state;

    for (i, file) in diff.to_encrypt.iter().enumerate() {
        emit_progress(app, "encrypting", i + 1, total, Some(&file.rel_path));

        let plaintext = fs::read(&file.abs_path)
            .map_err(|e| format!("read {}: {e}", file.abs_path.display()))?;
        let hmac = compute_hmac(&master, &plaintext);

        // 压缩 → 加密
        let compressed = compress(&plaintext)?;
        let enc_rel = file_to_enc_path(&file.rel_path);
        let file_key = derive_file_key(&master, &enc_rel);
        let encrypted = encrypt_data(&file_key, &compressed)?;

        // 写入
        let enc_path = encrypted_dir.join(&enc_rel);
        if let Some(parent) = enc_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
        fs::write(&enc_path, &encrypted).map_err(|e| format!("write: {e}"))?;
        total_size += encrypted.len() as u64;

        // 更新 manifest + local state
        new_manifest.files.insert(enc_rel.clone(), FileEntry {
            hmac: hmac.clone(),
            size: plaintext.len() as u64,
            compressed_size: compressed.len() as u64,
            modified: chrono::Utc::now().to_rfc3339(),
            source_path_hint: format!("~/.claude/{}", file.rel_path),
        });
        new_state.files.insert(file.rel_path.clone(), manifest::LocalFileState {
            hmac,
            modified: file.modified,
            dirty: false,
        });

        added += 1;
    }

    // 6. 保存 manifest (加密) + local state
    new_manifest.encrypt_and_save(&repo_path.join("manifest.json.enc"), &master)?;
    new_state.last_push = Some(chrono::Utc::now().to_rfc3339());
    new_state.save(&state_path)?;

    // 7. Git commit + push
    if added > 0 {
        emit_progress(app, "pushing", 0, 0, None);
        git.add_commit_push(&format!("sync: {} files updated", added), branch)?;
    }

    Ok(SyncResult {
        added,
        updated: 0,
        unchanged: diff.unchanged,
        total_size,
    })
}

/// 将 rel_path (如 projects/-home-user/abc.jsonl) 转为加密路径
fn file_to_enc_path(rel_path: &str) -> String {
    // projects/{project-dir}/xxx.jsonl → {hash}/xxx.jsonl.enc
    let parts: Vec<&str> = rel_path.splitn(3, '/').collect();
    if parts.len() >= 3 && parts[0] == "projects" {
        let proj_hash = hash_project_path(parts[1]);
        format!("{}/{}.enc", proj_hash, parts[2])
    } else {
        // history.jsonl 等顶层文件
        format!("{}.enc", rel_path)
    }
}

fn emit_progress(app: Option<&AppHandle>, phase: &str, current: usize, total: usize, file: Option<&str>) {
    if let Some(app) = app {
        let _ = app.emit("sync:progress", SyncProgress {
            phase: phase.into(),
            current,
            total,
            file_name: file.map(String::from),
        });
    }
}
```

- [ ] **Step 2: 实现 sync_pull 主流程**

```rust
pub fn pull(
    repo_path: &Path,
    password: &str,
    auth: &AuthMethod,
    remote_url: &str,
    db_path: &Path,
    app: Option<&AppHandle>,
) -> Result<SyncResult, String> {
    let _lock = SYNC_LOCK.lock().map_err(|e| format!("lock: {e}"))?;

    let git = GitRepo::open_or_clone(repo_path, remote_url, auth, "main")?;

    // 1. Fetch 所有 sync/* 分支
    emit_progress(app, "pulling", 0, 0, None);
    let branches = git.fetch_all_sync_branches()?;

    // 2. 读 meta.json（从任一分支，meta 应该相同）
    let meta_path = repo_path.join("meta.json");
    let meta = MetaJson::load(&meta_path)?;
    let salt_bytes: [u8; 32] = base64::engine::general_purpose::STANDARD
        .decode(&meta.salt).map_err(|e| format!("decode salt: {e}"))?
        .try_into().map_err(|_| "invalid salt")?;
    let params = Argon2Params {
        m_cost: meta.argon2_params.m,
        t_cost: meta.argon2_params.t,
        p_cost: meta.argon2_params.p,
    };
    let master = derive_master_key(password, &salt_bytes, &params)?;
    if !meta.verify_password(&master) {
        return Err("密码错误".into());
    }

    // 3. 遍历每个分支，解密 manifest → 解密文件 → 导入
    let mut total_imported = 0;
    let mut total_skipped = 0;

    for branch in &branches {
        // checkout 远程分支到临时 detached HEAD 读取
        let manifest_path = repo_path.join("manifest.json.enc");
        if !manifest_path.exists() {
            continue;
        }
        let manifest = Manifest::decrypt_and_load(&manifest_path, &master)?;

        let total = manifest.files.len();
        for (i, (enc_rel, entry)) in manifest.files.iter().enumerate() {
            emit_progress(app, "decrypting", i + 1, total, Some(enc_rel));

            let enc_path = repo_path.join("encrypted").join(enc_rel);
            if !enc_path.exists() {
                total_skipped += 1;
                continue;
            }

            let encrypted = fs::read(&enc_path).map_err(|e| format!("read: {e}"))?;
            let file_key = derive_file_key(&master, enc_rel);
            let compressed = decrypt_data(&file_key, &encrypted)?;
            let plaintext = decompress(&compressed)?;

            // 导入到 SQLite
            importer::import_jsonl(&plaintext, branch, db_path)?;
            total_imported += 1;
        }
    }

    Ok(SyncResult {
        added: total_imported,
        updated: 0,
        unchanged: total_skipped,
        total_size: 0,
    })
}
```

- [ ] **Step 3: 编译验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo build -p task-conductor-tauri 2>&1 | tail -20`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/sync/mod.rs
git commit -m "feat(sync): implement push/pull main logic in SyncManager"
```

---

## Task 8: importer.rs — JSONL 解析 → SQLite 导入

**Files:**
- Create: `src-tauri/src/sync/importer.rs`

- [ ] **Step 1: 实现 JSONL 解析 + SQLite 写入**

```rust
use std::path::Path;
use serde_json::Value;

/// 从解密后的 JSONL 数据导入到 tc_sync.db
pub fn import_jsonl(data: &[u8], source_branch: &str, db_path: &Path) -> Result<(), String> {
    let text = String::from_utf8_lossy(data);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() {
        return Ok(());
    }

    // 解析所有行
    let mut session_id: Option<String> = None;
    let mut project_path: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut first_prompt: Option<String> = None;
    let mut last_summary: Option<String> = None;
    let mut message_count = 0u32;
    let mut created_at: Option<String> = None;
    let mut modified_at: Option<String> = None;
    let mut events: Vec<(String, String, String)> = Vec::new(); // (type, timestamp, json)

    for line in &lines {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // 提取 session 元数据（从第一条有效记录）
        if session_id.is_none() {
            session_id = v.get("sessionId").and_then(|s| s.as_str()).map(String::from);
            project_path = v.get("cwd").and_then(|s| s.as_str()).map(String::from);
            git_branch = v.get("gitBranch").and_then(|s| s.as_str()).map(String::from);
        }

        let event_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("unknown");
        let timestamp = v.get("timestamp").and_then(|t| t.as_str()).unwrap_or("");

        // 时间范围
        if !timestamp.is_empty() {
            if created_at.is_none() {
                created_at = Some(timestamp.to_string());
            }
            modified_at = Some(timestamp.to_string());
        }

        // 提取 first_prompt（第一条 user 消息）
        if event_type == "user" && first_prompt.is_none() {
            first_prompt = extract_text(&v, 200);
        }

        // 提取 summary（最后一条 assistant 消息）
        if event_type == "assistant" {
            last_summary = extract_text(&v, 200);
        }

        if event_type == "message" || event_type == "user" || event_type == "assistant" {
            message_count += 1;
        }

        events.push((event_type.to_string(), timestamp.to_string(), line.to_string()));
    }

    let session_id = match session_id {
        Some(id) => id,
        None => return Ok(()), // 无法识别 session
    };

    // 写入 SQLite
    write_to_db(db_path, &session_id, source_branch, project_path.as_deref(),
        first_prompt.as_deref(), last_summary.as_deref(), message_count,
        created_at.as_deref(), modified_at.as_deref(),
        git_branch.as_deref(), &events)
}

fn extract_text(v: &Value, max_len: usize) -> Option<String> {
    let msg = v.get("message")?;
    let content = msg.get("content")
        .and_then(|c| c.as_str())
        .or_else(|| msg.get("text").and_then(|t| t.as_str()))?;
    let truncated: String = content.chars().take(max_len).collect();
    Some(truncated)
}

fn write_to_db(
    db_path: &Path,
    session_id: &str,
    source_branch: &str,
    project_path: Option<&str>,
    first_prompt: Option<&str>,
    summary: Option<&str>,
    message_count: u32,
    created_at: Option<&str>,
    modified_at: Option<&str>,
    git_branch: Option<&str>,
    events: &[(String, String, String)],
) -> Result<(), String> {
    // 使用 rusqlite（需在 Cargo.toml 加依赖）
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("open db: {e}"))?;

    // 建表
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS synced_sessions (
            session_id TEXT PRIMARY KEY,
            source_branch TEXT NOT NULL,
            project_hash TEXT,
            project_path TEXT,
            first_prompt TEXT,
            summary TEXT,
            message_count INTEGER,
            created_at TEXT,
            modified_at TEXT,
            git_branch TEXT,
            synced_at TEXT
        );
        CREATE TABLE IF NOT EXISTS synced_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            event_type TEXT,
            timestamp TEXT,
            content TEXT,
            FOREIGN KEY (session_id) REFERENCES synced_sessions(session_id)
        );
        CREATE INDEX IF NOT EXISTS idx_synced_events_session ON synced_events(session_id);
        CREATE INDEX IF NOT EXISTS idx_synced_sessions_modified ON synced_sessions(modified_at);
        CREATE INDEX IF NOT EXISTS idx_synced_sessions_branch ON synced_sessions(source_branch);
    ").map_err(|e| format!("create tables: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Upsert session
    conn.execute(
        "INSERT OR REPLACE INTO synced_sessions
         (session_id, source_branch, project_path, first_prompt, summary,
          message_count, created_at, modified_at, git_branch, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            session_id, source_branch, project_path, first_prompt, summary,
            message_count, created_at, modified_at, git_branch, now
        ],
    ).map_err(|e| format!("upsert session: {e}"))?;

    // 删除旧 events 再插入（简单策略）
    conn.execute("DELETE FROM synced_events WHERE session_id = ?1",
        rusqlite::params![session_id])
        .map_err(|e| format!("delete events: {e}"))?;

    let mut stmt = conn.prepare(
        "INSERT INTO synced_events (session_id, event_type, timestamp, content)
         VALUES (?1, ?2, ?3, ?4)"
    ).map_err(|e| format!("prepare: {e}"))?;

    for (etype, ts, content) in events {
        stmt.execute(rusqlite::params![session_id, etype, ts, content])
            .map_err(|e| format!("insert event: {e}"))?;
    }

    Ok(())
}
```

注意：Cargo.toml 加 `rusqlite = { version = "0.31", features = ["bundled"] }`。

- [ ] **Step 2: 写测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_import_jsonl() {
        let tmp = TempDir::new().unwrap();
        let db = tmp.path().join("test.db");
        let jsonl = br#"{"sessionId":"abc-123","type":"user","timestamp":"2026-03-18T10:00:00Z","cwd":"/home/user/proj","gitBranch":"main","message":{"content":"hello world"}}
{"sessionId":"abc-123","type":"assistant","timestamp":"2026-03-18T10:00:01Z","message":{"content":"Hi! How can I help?"}}
"#;
        import_jsonl(jsonl, "sync/desktop", &db).unwrap();

        let conn = rusqlite::Connection::open(&db).unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM synced_sessions", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 1);

        let event_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM synced_events WHERE session_id = 'abc-123'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(event_count, 2);
    }
}
```

- [ ] **Step 3: 测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo test -p task-conductor-tauri --lib sync::importer`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/sync/importer.rs src-tauri/Cargo.toml
git commit -m "feat(sync): implement importer — JSONL parse + SQLite write"
```

---

## Task 9: Tauri Commands — 暴露给前端

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 在 lib.rs 添加 sync 相关 Tauri commands**

```rust
use std::sync::Mutex as StdMutex;

/// 内存缓存密码（30 分钟超时）
struct PasswordCache {
    password: Option<String>,
    set_at: Option<std::time::Instant>,
}

static PASSWORD_CACHE: StdMutex<PasswordCache> = StdMutex::new(PasswordCache {
    password: None,
    set_at: None,
});

impl PasswordCache {
    fn get(&self) -> Option<&str> {
        let pw = self.password.as_deref()?;
        let set_at = self.set_at?;
        if set_at.elapsed() > std::time::Duration::from_secs(1800) {
            None // 30 分钟超时
        } else {
            Some(pw)
        }
    }
}

#[tauri::command]
async fn sync_init(
    app: tauri::AppHandle,
    repo_url: String,
    password: String,
    auth_type: String,  // "ssh" | "pat"
    auth_value: String, // SSH key path 或 PAT token
) -> Result<(), String> {
    let auth = match auth_type.as_str() {
        "ssh" => sync::git::AuthMethod::Ssh { key_path: auth_value.into() },
        "pat" => sync::git::AuthMethod::Pat { token: auth_value },
        _ => return Err("auth_type must be ssh or pat".into()),
    };
    let repo_path = dirs::home_dir().unwrap().join(".claude-sync");
    let claude_dir = dirs::home_dir().unwrap().join(".claude");
    let branch = format!("sync/{}", hostname::get().unwrap_or_default().to_string_lossy());

    sync::push(&repo_path, &claude_dir, &password, &branch, &auth, &repo_url, Some(&app))?;

    // 缓存密码
    let mut cache = PASSWORD_CACHE.lock().unwrap();
    cache.password = Some(password);
    cache.set_at = Some(std::time::Instant::now());

    Ok(())
}

#[tauri::command]
async fn sync_push(app: tauri::AppHandle, password: String) -> Result<sync::SyncResult, String> {
    // 读取配置（从 meta.json 获取 repo_url 等）
    let repo_path = dirs::home_dir().unwrap().join(".claude-sync");
    let claude_dir = dirs::home_dir().unwrap().join(".claude");
    let branch = format!("sync/{}", hostname::get().unwrap_or_default().to_string_lossy());

    // TODO: 从持久化配置读取 auth 和 remote_url
    // 暂用 placeholder
    let auth = get_saved_auth(&repo_path)?;
    let remote_url = get_saved_remote(&repo_path)?;

    sync::push(&repo_path, &claude_dir, &password, &branch, &auth, &remote_url, Some(&app))
}

#[tauri::command]
async fn sync_pull(app: tauri::AppHandle, password: String) -> Result<sync::SyncResult, String> {
    let repo_path = dirs::home_dir().unwrap().join(".claude-sync");
    let db_path = dirs::data_dir().unwrap()
        .join("com.sichengli.task-conductor")
        .join("tc_sync.db");
    let auth = get_saved_auth(&repo_path)?;
    let remote_url = get_saved_remote(&repo_path)?;

    sync::pull(&repo_path, &password, &auth, &remote_url, &db_path, Some(&app))
}

#[tauri::command]
async fn sync_status() -> Result<serde_json::Value, String> {
    let repo_path = dirs::home_dir().unwrap().join(".claude-sync");
    let meta_path = repo_path.join("meta.json");

    if !meta_path.exists() {
        return Ok(serde_json::json!({ "is_configured": false }));
    }

    let meta = sync::manifest::MetaJson::load(&meta_path)?;
    let state_path = repo_path.join(".local-state.json");
    let state = sync::manifest::LocalState::load(&state_path);

    Ok(serde_json::json!({
        "is_configured": true,
        "last_sync_time": state.last_push,
        "file_count": state.files.len(),
        "hostname": meta.hostname,
    }))
}

#[tauri::command]
async fn sync_verify_password(password: String) -> Result<bool, String> {
    let repo_path = dirs::home_dir().unwrap().join(".claude-sync");
    let meta = sync::manifest::MetaJson::load(&repo_path.join("meta.json"))?;
    let salt: [u8; 32] = base64::engine::general_purpose::STANDARD
        .decode(&meta.salt).map_err(|e| format!("{e}"))?
        .try_into().map_err(|_| "bad salt")?;
    let params = sync::crypto::Argon2Params {
        m_cost: meta.argon2_params.m,
        t_cost: meta.argon2_params.t,
        p_cost: meta.argon2_params.p,
    };
    let master = sync::crypto::derive_master_key(&password, &salt, &params)?;
    Ok(meta.verify_password(&master))
}
```

- [ ] **Step 2: 注册 commands 到 invoke_handler**

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    list_dir,
    scan_tree,
    invalidate_file_cache,
    // sync commands
    sync_init,
    sync_push,
    sync_pull,
    sync_status,
    sync_verify_password,
])
```

注意：Cargo.toml 加 `dirs = "5"`。

- [ ] **Step 3: 编译验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo build -p task-conductor-tauri 2>&1 | tail -30`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat(sync): register Tauri commands — init/push/pull/status/verify"
```

---

## Task 10: tc-sync CLI 二进制

**Files:**
- Create: `src-tauri/src/sync/cli.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 在 Cargo.toml 添加 bin target**

```toml
[[bin]]
name = "tc-sync"
path = "src/sync/cli.rs"
```

- [ ] **Step 2: 实现 CLI 入口**

```rust
//! tc-sync CLI — 由 SessionEnd hook 调用
//! 用法: echo "password" | tc-sync push --repo ~/.claude-sync

use std::io::{self, BufRead};
use std::path::PathBuf;

// 复用 sync 模块
mod sync;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: tc-sync <push|pull> [--repo PATH] [--password-stdin]");
        std::process::exit(1);
    }

    let command = &args[1];
    let repo_path = get_arg(&args, "--repo")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap().join(".claude-sync"));

    // 从 stdin 读密码
    let password = if args.contains(&"--password-stdin".to_string()) {
        let stdin = io::stdin();
        stdin.lock().lines().next()
            .and_then(|l| l.ok())
            .unwrap_or_default()
    } else {
        // 从 tmpfs 文件读
        let key_dir = std::env::var("XDG_RUNTIME_DIR")
            .unwrap_or_else(|_| format!("/tmp/tc-sync-{}", unsafe { libc::getuid() }));
        std::fs::read_to_string(format!("{}/tc-sync.key", key_dir))
            .unwrap_or_default()
            .trim().to_string()
    };

    if password.is_empty() {
        eprintln!("No password provided");
        std::process::exit(1);
    }

    let claude_dir = dirs::home_dir().unwrap().join(".claude");
    let hostname = hostname::get().unwrap_or_default().to_string_lossy().to_string();
    let branch = format!("sync/{hostname}");

    // 从 repo 中读取已保存的认证信息
    // （简化：默认 SSH）
    let ssh_key = dirs::home_dir().unwrap().join(".ssh/id_ed25519");
    let auth = sync::git::AuthMethod::Ssh { key_path: ssh_key };
    let remote_url = read_remote_url(&repo_path);

    match command.as_str() {
        "push" => {
            match sync::push(&repo_path, &claude_dir, &password, &branch, &auth, &remote_url, None) {
                Ok(r) => println!("Synced: {} added, {} unchanged", r.added, r.unchanged),
                Err(e) => eprintln!("Push failed: {e}"),
            }
        }
        "pull" => {
            let db_path = dirs::data_dir().unwrap()
                .join("com.sichengli.task-conductor/tc_sync.db");
            match sync::pull(&repo_path, &password, &auth, &remote_url, &db_path, None) {
                Ok(r) => println!("Pulled: {} imported, {} skipped", r.added, r.unchanged),
                Err(e) => eprintln!("Pull failed: {e}"),
            }
        }
        _ => {
            eprintln!("Unknown command: {command}");
            std::process::exit(1);
        }
    }
}

fn get_arg(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn read_remote_url(repo_path: &std::path::Path) -> String {
    // 从 git config 读 origin url
    git2::Repository::open(repo_path)
        .and_then(|r| r.find_remote("origin").map(|remote| {
            remote.url().unwrap_or("").to_string()
        }))
        .unwrap_or_default()
}
```

注意：Cargo.toml 加 `libc = "0.2"`。

- [ ] **Step 3: 编译验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo build -p task-conductor-tauri --bin tc-sync 2>&1 | tail -20`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/sync/cli.rs src-tauri/Cargo.toml
git commit -m "feat(sync): add tc-sync CLI binary for hook-driven sync"
```

---

## Task 11: Hook 安装脚本

**Files:**
- Create: `scripts/install-sync-hook.sh`

- [ ] **Step 1: 创建脚本**

```bash
#!/bin/bash
# 安装 SessionEnd sync hook 到 ~/.claude/settings.json
set -e

HOOK_SCRIPT="$HOME/.claude/hooks/sync-hook.sh"
SETTINGS="$HOME/.claude/settings.json"

# 1. 创建 hook 脚本
mkdir -p "$(dirname "$HOOK_SCRIPT")"
cat > "$HOOK_SCRIPT" << 'HOOKEOF'
#!/bin/bash
TC_SYNC_BIN="$HOME/.local/bin/tc-sync"
LOCK_FILE="/tmp/tc-sync.lock"
COOLDOWN_FILE="/tmp/tc-sync-last-push"

if [ -f "$COOLDOWN_FILE" ]; then
  LAST=$(cat "$COOLDOWN_FILE")
  NOW=$(date +%s)
  [ $((NOW - LAST)) -lt 300 ] && exit 0
fi

KEY_DIR="${XDG_RUNTIME_DIR:-/tmp/tc-sync-$(id -u)}"
KEY_FILE="$KEY_DIR/tc-sync.key"
[ ! -f "$KEY_FILE" ] && exit 0

(
  flock -n 200 || exit 0
  cat "$KEY_FILE" | "$TC_SYNC_BIN" push --password-stdin 2>/dev/null
  date +%s > "$COOLDOWN_FILE"
) 200>"$LOCK_FILE" &
HOOKEOF
chmod +x "$HOOK_SCRIPT"

# 2. 注册到 settings.json
if [ ! -f "$SETTINGS" ]; then
  echo '{"hooks":{}}' > "$SETTINGS"
fi

# 使用 python 安全地更新 JSON
python3 << PYEOF
import json, sys

with open("$SETTINGS") as f:
    cfg = json.load(f)

hooks = cfg.setdefault("hooks", {})
session_end = hooks.setdefault("SessionEnd", [])

# 检查是否已安装
hook_cmd = "$HOOK_SCRIPT"
already = any(
    h.get("hooks", [{}])[0].get("command", "") == hook_cmd
    for h in session_end if isinstance(h, dict)
)

if not already:
    session_end.append({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": hook_cmd,
            "timeout": 5
        }]
    })
    with open("$SETTINGS", "w") as f:
        json.dump(cfg, f, indent=2)
    print("✓ Sync hook installed")
else:
    print("→ Sync hook already installed")
PYEOF

# 3. 安装 tc-sync 二进制
BINARY_SRC="$(dirname "$0")/../tauri/target/release/tc-sync"
if [ -f "$BINARY_SRC" ]; then
  mkdir -p "$HOME/.local/bin"
  cp "$BINARY_SRC" "$HOME/.local/bin/tc-sync"
  chmod +x "$HOME/.local/bin/tc-sync"
  echo "✓ tc-sync binary installed to ~/.local/bin/"
else
  echo "⚠ tc-sync binary not found. Run 'cargo build --release --bin tc-sync' first."
fi

echo "Done."
```

- [ ] **Step 2: Commit**

```bash
git add scripts/install-sync-hook.sh
git commit -m "feat(sync): add hook installation script"
```

---

## Task 12: 前端 — sync API + store

**Files:**
- Create: `tauri/src/lib/api/sync.ts`
- Create: `tauri/src/lib/store/sync-store.ts`
- Create: `tauri/src/lib/types/session.ts`

- [ ] **Step 1: 创建 sync API 封装**

```typescript
// src/lib/api/sync.ts
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface SyncResult {
  added: number
  updated: number
  unchanged: number
  total_size: number
}

export interface SyncStatus {
  is_configured: boolean
  last_sync_time?: string
  file_count?: number
  hostname?: string
}

export interface SyncProgress {
  phase: 'scanning' | 'encrypting' | 'pushing' | 'pulling' | 'decrypting'
  current: number
  total: number
  file_name?: string
}

export const syncApi = {
  init: (repoUrl: string, password: string, authType: 'ssh' | 'pat', authValue: string) =>
    invoke<void>('sync_init', { repoUrl, password, authType, authValue }),

  push: (password: string) =>
    invoke<SyncResult>('sync_push', { password }),

  pull: (password: string) =>
    invoke<SyncResult>('sync_pull', { password }),

  status: () =>
    invoke<SyncStatus>('sync_status'),

  verifyPassword: (password: string) =>
    invoke<boolean>('sync_verify_password', { password }),

  onProgress: (callback: (progress: SyncProgress) => void): Promise<UnlistenFn> =>
    listen<SyncProgress>('sync:progress', (event) => callback(event.payload)),
}
```

- [ ] **Step 2: 创建 Zustand store**

```typescript
// src/lib/store/sync-store.ts
import { create } from 'zustand'
import type { SyncStatus, SyncProgress } from '../api/sync'

interface SyncState {
  status: SyncStatus | null
  progress: SyncProgress | null
  isSyncing: boolean
  error: string | null

  setStatus: (s: SyncStatus) => void
  setProgress: (p: SyncProgress | null) => void
  setSyncing: (v: boolean) => void
  setError: (e: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: null,
  progress: null,
  isSyncing: false,
  error: null,

  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setError: (error) => set({ error }),
}))
```

- [ ] **Step 3: 创建 UnifiedSession 类型**

```typescript
// src/lib/types/session.ts
export interface UnifiedSession {
  sessionId: string
  source: 'live' | 'synced'
  sourceBranch?: string
  projectPath?: string
  firstPrompt?: string
  summary?: string
  messageCount: number
  createdAt: string
  modifiedAt: string
  gitBranch?: string
}
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/lib/api/sync.ts tauri/src/lib/store/sync-store.ts tauri/src/lib/types/session.ts
git commit -m "feat(sync): add frontend sync API, store, and UnifiedSession type"
```

---

## Task 13: 前端 — SyncSettings 面板

**Files:**
- Create: `tauri/src/features/admin/pages/settings/SyncSettings.tsx`
- Modify: 现有 Settings 页面（嵌入 SyncSettings）

- [ ] **Step 1: 实现 SyncSettings 组件**

需要先读取现有 Settings 页面结构，确定嵌入方式。组件包含：
- 仓库地址输入框
- 认证方式选择（SSH / PAT）
- 密码输入 + 验证按钮
- 同步状态显示（上次时间、文件数）
- 手动 Push / Pull 按钮
- 进度条（监听 sync:progress event）

```typescript
// src/features/admin/pages/settings/SyncSettings.tsx
import { useState, useEffect } from 'react'
import { syncApi, type SyncProgress } from '../../../../lib/api/sync'
import { useSyncStore } from '../../../../lib/store/sync-store'

export function SyncSettings() {
  const { status, progress, isSyncing, error, setStatus, setProgress, setSyncing, setError } = useSyncStore()
  const [repoUrl, setRepoUrl] = useState('')
  const [password, setPassword] = useState('')
  const [authType, setAuthType] = useState<'ssh' | 'pat'>('ssh')
  const [authValue, setAuthValue] = useState('~/.ssh/id_ed25519')
  const [passwordVerified, setPasswordVerified] = useState<boolean | null>(null)

  useEffect(() => {
    syncApi.status().then(setStatus).catch(() => {})
    const unlisten = syncApi.onProgress((p) => setProgress(p))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const handleInit = async () => {
    try {
      setSyncing(true)
      setError(null)
      await syncApi.init(repoUrl, password, authType, authValue)
      setStatus(await syncApi.status())
    } catch (e: any) {
      setError(e.toString())
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }

  const handlePush = async () => {
    try {
      setSyncing(true)
      setError(null)
      await syncApi.push(password)
      setStatus(await syncApi.status())
    } catch (e: any) {
      setError(e.toString())
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }

  const handlePull = async () => {
    try {
      setSyncing(true)
      setError(null)
      await syncApi.pull(password)
      setStatus(await syncApi.status())
    } catch (e: any) {
      setError(e.toString())
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }

  const handleVerify = async () => {
    try {
      const ok = await syncApi.verifyPassword(password)
      setPasswordVerified(ok)
    } catch {
      setPasswordVerified(false)
    }
  }

  // 渲染 — 适配现有 Settings 页面样式
  // 具体 JSX 需要参考现有 Settings 组件的 CSS 类名和布局模式
  return (
    <div className="sync-settings">
      {/* 具体 UI 实现参考现有 Settings 页面样式 */}
    </div>
  )
}
```

注意：具体 JSX/CSS 需要在实现时参考现有 Settings 页面的样式体系。

- [ ] **Step 2: 嵌入现有 Settings 页面**

在现有 Settings 路由/组件中 import 并渲染 `<SyncSettings />`。

- [ ] **Step 3: Commit**

```bash
git add tauri/src/features/admin/pages/settings/SyncSettings.tsx
git commit -m "feat(sync): add SyncSettings panel in admin settings"
```

---

## Task 14: 前端 — Sessions 页面融合

**Files:**
- Modify: Sessions 页面组件

- [ ] **Step 1: 读取现有 Sessions 页面代码**

确认当前数据获取方式（WS / HTTP），确定融合注入点。

- [ ] **Step 2: 添加 synced 数据查询**

通过 Tauri `plugin-sql` 查询 `tc_sync.db` 的 `synced_sessions` 表，转为 `UnifiedSession[]`。

- [ ] **Step 3: 合并实时 + 历史数据**

```typescript
function mergeSessionSources(
  liveSessions: UnifiedSession[],
  syncedSessions: UnifiedSession[]
): UnifiedSession[] {
  const map = new Map<string, UnifiedSession>()

  // synced 先放入
  for (const s of syncedSessions) {
    map.set(s.sessionId, s)
  }
  // live 覆盖（优先级高）
  for (const s of liveSessions) {
    map.set(s.sessionId, s)
  }

  return Array.from(map.values())
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
}
```

- [ ] **Step 4: 添加来源筛选 tab**

在会话列表顶部添加筛选：全部 | 实时 | 历史归档

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sync): integrate synced sessions into admin Sessions page"
```

---

## Task 15: 集成测试 + 端到端验证

- [ ] **Step 1: Rust 全模块测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo test -p task-conductor-tauri --lib 2>&1`
Expected: 全部 PASS

- [ ] **Step 2: 编译 release 二进制**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && cargo build --release --bin tc-sync 2>&1 | tail -10`

- [ ] **Step 3: 手动端到端验证**

```bash
# 1. 在 GitHub 创建空私有仓库
# 2. 在 Tauri Settings 中配置 repo URL + 密码
# 3. 点击 "立即同步" → 验证 GitHub 上出现 encrypted/ 目录
# 4. 点击 "拉取最新" → 验证 Sessions 页面显示历史会话
# 5. 关闭一个 Claude 会话 → 验证 hook 自动触发同步
```

- [ ] **Step 4: 安装 hook**

Run: `bash scripts/install-sync-hook.sh`

- [ ] **Step 5: Final commit**

```bash
git commit -m "feat(sync): encrypted chat sync — complete implementation"
```

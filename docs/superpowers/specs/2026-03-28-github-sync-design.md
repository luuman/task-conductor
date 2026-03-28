# GitHub 会话备份同步设计

**日期：** 2026-03-28
**范围：** MVP 第一阶段，仅实现"可备份、可恢复"核心能力

---

## 目标

本地 Claude 会话历史清除后，仍能从 GitHub 私有仓库恢复并在 Chat 页面全量展示。

**第一阶段范围：**
- 服务端每日凌晨自动加密备份到 GitHub
- 桌面端从服务端获取解密参数，拉取 GitHub 备份并解密
- Chat 页面展示 live + archived 全量会话列表
- 支持收藏、软删除归档会话

**不做：**
- 多机多分支同步
- Git LFS
- 自动 Hook 触发（仅定时任务）
- 复杂 manifest diff（文件级增量即可）

---

## 架构概览

```
服务器 (Python)                           GitHub 私有仓库
┌───────────────────────────────┐         claude-chat-backup/
│ APScheduler（每日 00:00）      │         ├── meta.json
│   sync/job.py                 │  push   ├── manifest.json.enc
│   ├── exporter.py             │ ──────→ └── encrypted/
│   ├── crypto.py               │             └── {session_id}.jsonl.enc
│   └── git_ops.py              │
│                               │
│ 新增 API                       │
│  GET  /api/sync/crypto-params │
│  GET  /api/sync/status        │
│  PUT  /api/sync/config        │
│  POST /api/sync/push          │
└───────────────────────────────┘
            ↑ Bearer token
桌面端 (Tauri/Rust)
┌───────────────────────────────┐
│ sync/puller.rs                │  GitHub REST API
│   1. GET /api/sync/crypto-params │ ←── pull ──→ GitHub
│   2. 拉取加密文件               │
│   3. HKDF + AES-GCM 解密       │
│   4. 写入 tc_sync.db           │
│                               │
│ 触发时机：                     │
│   • 应用启动时检查今日是否已 Pull│
│   • Settings 页"立即同步"按钮  │
└───────────────────────────────┘

Chat 页面（SessionChat 组件）
├── live sessions   ← GET /api/sessions
└── archived        ← Tauri IPC → tc_sync.db
```

---

## 数据模型

### 服务端新增表

```python
class SyncConfig(Base):
    """单行配置表"""
    __tablename__ = "sync_config"
    id: Mapped[int] = mapped_column(primary_key=True)
    github_repo: Mapped[str]           # "owner/repo"
    github_pat: Mapped[str]            # 明文存储
    encrypt_password: Mapped[str]      # 明文存储
    salt: Mapped[str]                  # hex，首次生成后固定不变
    argon2_time_cost: Mapped[int] = mapped_column(default=3)
    argon2_memory_kb: Mapped[int] = mapped_column(default=65536)
    argon2_parallelism: Mapped[int] = mapped_column(default=4)
    last_push_at: Mapped[datetime | None]
    enabled: Mapped[bool] = mapped_column(default=False)


class BackupRecord(Base):
    """每个会话的备份记录"""
    __tablename__ = "backup_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(index=True)
    enc_path: Mapped[str]              # GitHub 上的路径
    content_hash: Mapped[str]          # sha256 of plaintext jsonl
    backed_up_at: Mapped[datetime]
    file_size: Mapped[int]
```

### 桌面端 tc_sync.db

```sql
CREATE TABLE archived_sessions (
    session_id    TEXT PRIMARY KEY,
    summary       TEXT,
    cwd           TEXT,
    started_at    TEXT,
    last_event_at TEXT,
    event_count   INTEGER,
    enc_path      TEXT,          -- GitHub 上对应的加密文件路径
    transcript    TEXT,          -- 解密后的 jsonl 内容（JSON 字符串）
    synced_at     TEXT,
    is_favorite   INTEGER DEFAULT 0,
    is_deleted    INTEGER DEFAULT 0   -- 软删除
);

CREATE TABLE pull_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pulled_at   TEXT NOT NULL,
    files_count INTEGER NOT NULL,
    status      TEXT NOT NULL        -- 'ok' | 'error'
);
```

### GitHub 仓库结构

```
claude-chat-backup/
├── meta.json                      ← {version, salt, argon2_params}（明文）
├── manifest.json.enc              ← [{session_id, enc_path, content_hash, backed_up_at}]（AES-GCM 加密）
└── encrypted/
    └── {session_id}.jsonl.enc     ← AES-256-GCM 加密的 jsonl
```

---

## 加密方案

### 密钥派生（服务端执行）

```
password + salt ──→ Argon2id ──→ master_key (32 bytes)
master_key + file_rel_path ──→ HKDF-SHA256 ──→ file_key (32 bytes)
```

### 文件加密（服务端）

```
file_key + random nonce (12B) ──→ AES-256-GCM ──→ ciphertext + tag (16B)
存储格式：[nonce 12B | ciphertext | tag 16B]
```

### 桌面端解密流程

1. `GET /api/sync/crypto-params` → `{master_key_hex, github_repo, github_pat}`
2. 调 GitHub REST API 拉取 `manifest.json.enc` 和加密文件
3. 本地 `HKDF(master_key, file_rel_path) → file_key`
4. `AES-256-GCM decrypt` → 明文 jsonl
5. 解析写入 `tc_sync.db`

**安全说明：** `master_key_hex` 通过现有 Bearer token 鉴权保护，和其他敏感 API 一致。服务端预先派生好 master_key 后返回，桌面端无需运行 Argon2。

---

## 服务端模块拆分

```
backend/app/sync/
├── __init__.py
├── config.py        # SyncConfig CRUD
├── exporter.py      # ClaudeSession/Event → jsonl bytes
├── crypto.py        # Argon2id + HKDF + AES-256-GCM
├── git_ops.py       # subprocess git: clone/add/commit/push
├── manifest.py      # 读写 manifest.json.enc
└── job.py           # APScheduler job，串联全流程

backend/app/routers/sync.py
# GET  /api/sync/crypto-params  → {master_key_hex, github_repo, github_pat}
# GET  /api/sync/status         → {last_push_at, total_backed_up, enabled}
# PUT  /api/sync/config         → 更新 repo/PAT/密码/开关
# POST /api/sync/push           → 手动立即触发一次 Push
```

**Python 新增依赖：**
```
cryptography    # AES-256-GCM + HKDF
argon2-cffi     # Argon2id
gitpython       # git 操作（或直接 subprocess）
```

**APScheduler 注册（main.py lifespan）：**
```python
scheduler.add_job(sync_job, "cron", hour=0, minute=0, id="github_sync")
```

---

## 桌面端模块拆分

```
src-tauri/src/sync/
├── mod.rs
├── puller.rs    # 调 GitHub REST API 拉取文件（reqwest）
├── crypto.rs    # HKDF + AES-256-GCM 解密
├── importer.rs  # 解密后写入 tc_sync.db
└── scheduler.rs # 启动时检查今日是否已 Pull

Tauri 命令：
  sync_pull()             → 触发完整 Pull 流程
  get_archived_sessions() → 查询 tc_sync.db archived_sessions
  toggle_favorite(id)     → 更新 is_favorite
  delete_archived(id)     → 软删除 is_deleted=1
```

**Cargo.toml 新增依赖：**
```toml
reqwest  = { version = "0.12", features = ["json", "rustls-tls"] }
aes-gcm  = "0.10"
hkdf     = "0.12"
sha2     = "0.10"
rusqlite = { version = "0.31", features = ["bundled"] }
hex      = "0.4"
```

---

## Chat 页面展示

### 数据合并规则

```
live_sessions    ← GET /api/sessions
archived_sessions← Tauri IPC → tc_sync.db（is_deleted=0）

合并（按 session_id 去重）：
  live + archived → 用 live 数据，显示 ☁ 标签
  仅 live         → 正常展示
  仅 archived     → 用 archived 数据，显示 ☁ 标签
```

### UI 变化（SessionChat 组件）

- Session 列表每项新增：`☁` 标签（archived）、`★` 收藏按钮、`🗑` 删除按钮
- 顶部筛选器新增：全部 / 仅本地 / 仅归档 / 仅收藏
- 点击 archived 会话：从 `tc_sync.db` 读取 transcript，复用现有 `TranscriptViewer`

### useSessionData 改动

```typescript
// 新增：合并 archived 数据
const archivedSessions = useArchivedSessions()  // Tauri IPC hook

const mergedSessions = useMemo(() => {
  const liveIds = new Set(liveSessions.map(s => s.session_id))
  const archivedOnly = archivedSessions
    .filter(s => !liveIds.has(s.session_id))
    .map(s => ({ ...s, source: 'archived' as const }))
  return [
    ...liveSessions.map(s => ({ ...s, source: liveIds.has(s.session_id) ? 'live' : 'live' as const })),
    ...archivedOnly,
  ].sort(byStatusThenTime)
}, [liveSessions, archivedSessions])
```

---

## 开发顺序

1. **服务端 sync 模块**：`crypto.py` → `exporter.py` → `git_ops.py` → `job.py` → `routers/sync.py`
2. **服务端 DB 迁移**：新增 `sync_config` + `backup_records` 表
3. **桌面端 Rust**：`crypto.rs` → `puller.rs` → `importer.rs` → `scheduler.rs` → Tauri 命令注册
4. **前端 Chat 页面**：`useArchivedSessions` hook → `SessionList` 新增标签/按钮 → 筛选器

---

## 未做（后续迭代）

- 自动 Hook 触发（会话结束即备份）
- Git LFS 支持大文件
- 多机合并（同一 GitHub 仓库多台机器 Pull）
- 备份仓库加密 manifest 的完整性校验

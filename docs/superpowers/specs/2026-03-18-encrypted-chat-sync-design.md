# 加密对话同步设计文档

> 将 Claude Code 本地对话数据加密后同步到 GitHub 私有仓库，Tauri 桌面端可拉取解密并在 Sessions 页面展示。

## 需求摘要

| 决策项 | 选择 |
|--------|------|
| 同步范围 | 全部 `~/.claude/` 对话（~1.1GB） |
| 加密方案 | Argon2id 密码派生 + AES-256-GCM |
| 触发方式 | Claude Code SessionEnd Hook |
| GitHub 仓库 | 独立私有仓库，多机独立 branch |
| 数据呈现 | 融入 Tauri `/admin/sessions` 页面 |

## §1 数据流与加密架构

```
┌─────────────────────────────────────────────────────────────┐
│                     加密同步数据流                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ① SessionEnd Hook 触发                                     │
│     ~/.claude/hooks/sync-hook.sh                            │
│         → 调用 tc-sync push（Rust 二进制）                   │
│                                                             │
│  ② tc-sync push                                             │
│     a. 扫描 ~/.claude/projects/**/*.jsonl                   │
│     b. 对比 manifest.json（上次同步快照）→ 只处理增量          │
│     c. 每个文件：Argon2id 派生密钥 → AES-256-GCM 加密        │
│        明文 JSONL → 密文 .enc 文件                           │
│     d. 更新 manifest.json（文件哈希 + 时间戳）               │
│     e. git2: add → commit → push 到 GitHub                  │
│                                                             │
│  ③ GitHub 仓库 (私有)                                       │
│     encrypted/                                              │
│       ├── {project-hash}/                                   │
│       │   ├── {session-id}.jsonl.enc                        │
│       │   └── sessions-index.enc                            │
│       └── manifest.json（明文，无敏感内容）                   │
│                                                             │
│  ④ Tauri 拉取 + 解密                                        │
│     Rust command: sync_pull                                 │
│     a. git2: fetch + fast-forward                           │
│     b. 对比本地 manifest → 只解密变更文件                     │
│     c. AES-256-GCM 解密 → 解析 JSONL                        │
│     d. 写入 tc_cache.db 的 synced_sessions/synced_events 表  │
│                                                             │
│  ⑤ 前端 Sessions 页面                                       │
│     现有 API + SQLite 缓存 → 渲染（无感知加密层存在）         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 关键设计点

- **增量同步**：`manifest.json` 记录每个文件的 SHA-256 哈希，只加密/传输变更文件
- **项目路径哈希化**：目录名用 `SHA-256(项目绝对路径)[:16]`，避免泄露本地路径
- **加密粒度**：每个 JSONL 文件单独加密，增量同步友好
- **密钥派生参数**：Argon2id, m=64MB, t=3, p=1 → 256-bit key。salt 随机生成，每仓库一个，存于 manifest

## §2 Rust 模块 & Tauri Commands

### 目录结构

```
src-tauri/src/
├── lib.rs            # 现有 + 注册新 commands
├── main.rs           # 不动
└── sync/             # 新模块
    ├── mod.rs        # 模块入口
    ├── crypto.rs     # Argon2id 派生 + AES-256-GCM 加密/解密
    ├── manifest.rs   # manifest.json 读写 + 增量 diff
    ├── scanner.rs    # 扫描 ~/.claude/ 目录，收集 JSONL 文件
    ├── git.rs        # git2 操作（clone/pull/commit/push）
    └── importer.rs   # 解密 JSONL → 解析 → 写入 SQLite
```

### Tauri Commands

```rust
#[tauri::command]
async fn sync_init(repo_url: String, password: String) → Result<()>
// 首次设置：clone 空仓库 + 生成 salt + 存密码验证 blob

#[tauri::command]
async fn sync_push(password: String) → Result<SyncResult>
// 扫描 → 增量加密 → git push。返回 {added, updated, total_size}

#[tauri::command]
async fn sync_pull(password: String) → Result<SyncResult>
// git pull → 增量解密 → 导入 SQLite。返回 {imported, skipped}

#[tauri::command]
async fn sync_status() → Result<SyncStatus>
// 返回 {last_sync_time, file_count, repo_url, is_configured}

#[tauri::command]
async fn sync_verify_password(password: String) → Result<bool>
// 验证密码（用 manifest 中的 salt 派生密钥，解密 verify_blob）
```

### Cargo.toml 新增依赖

```toml
aes-gcm = "0.10"        # AES-256-GCM 加密
argon2 = "0.5"           # 密钥派生
git2 = "0.19"            # Git 操作（libgit2 绑定）
sha2 = "0.10"            # 文件哈希 + 路径哈希
walkdir = "2"            # 递归目录扫描
```

### 密码管理

- 密码不持久化到磁盘
- 调用时传入，Tauri 进程内存缓存至应用关闭
- 运行时通过 `$XDG_RUNTIME_DIR/tc-sync.key`（tmpfs）传递给 Hook 脚本

## §3 Hook 集成 & GitHub 仓库结构

### SessionEnd Hook

```bash
#!/bin/bash
# ~/.claude/hooks/sync-hook.sh
TC_SYNC_BIN="$HOME/.local/bin/tc-sync"
TC_SYNC_REPO="$HOME/.claude-sync"

PASSWORD=$(cat "$XDG_RUNTIME_DIR/tc-sync.key" 2>/dev/null)
[ -z "$PASSWORD" ] && exit 0  # 未解锁则静默跳过

$TC_SYNC_BIN push --repo "$TC_SYNC_REPO" --password "$PASSWORD" &
# 后台执行，不阻塞 Claude Code
```

Hook 注册追加到 `~/.claude/settings.json`：

```json
"SessionEnd": [{
  "matcher": "",
  "hooks": [{
    "type": "command",
    "command": "~/.claude/hooks/sync-hook.sh",
    "timeout": 5
  }]
}]
```

### GitHub 仓库结构

```
claude-chat-encrypted/           # 独立私有仓库
├── manifest.json                # 明文索引
├── encrypted/
│   ├── a3f8b2c1d4e5f6a7/       # SHA-256(项目路径)[:16]
│   │   ├── 1e7e3459.jsonl.enc   # session-id[:8].jsonl.enc
│   │   ├── sessions-index.enc
│   │   └── subagents/
│   │       └── agent-a886.jsonl.enc
│   ├── b7c9d0e1f2a3b4c5/
│   │   └── ...
│   └── ...
├── history.enc                  # 全局 history.jsonl 加密
└── .gitattributes               # *.enc binary
```

### manifest.json 格式

```json
{
  "version": 1,
  "salt": "base64-encoded-32-bytes",
  "argon2_params": {"m": 65536, "t": 3, "p": 1},
  "verify_blob": "base64-加密后的固定字符串，用于验证密码",
  "files": {
    "encrypted/a3f8b2c1d4e5f6a7/1e7e3459.jsonl.enc": {
      "source_hash": "sha256-of-plaintext",
      "size": 284567,
      "modified": "2026-03-18T10:30:00Z"
    }
  }
}
```

## §4 前端集成

### 新增文件

```
tauri/src/
├── lib/
│   ├── store/sync-store.ts      # Zustand store（同步状态/密码内存缓存）
│   └── api/sync.ts              # 封装 5 个 Tauri invoke 调用
├── features/admin/pages/settings/
│   └── SyncSettings.tsx         # 同步配置面板（嵌入现有 Settings 页）
```

### 改造文件

```
tauri/src/features/admin/pages/sessions/
└── SessionList.tsx              # 数据源扩展：WS + SQLite 缓存
```

### SyncSettings 面板

嵌入现有设置页，包含：仓库地址输入、密码输入+验证、同步状态显示（上次同步时间/文件数/仓库大小）、手动同步/拉取按钮。

### Sessions 页面数据融合

```typescript
// 合并策略：
// 1. 实时会话优先（有 WS 连接的 session 用实时数据）
// 2. 历史会话补充（无实时连接的用 SQLite 缓存）
// 3. 按 modified 时间倒序排列
// 4. 顶部 "来源" 筛选：全部 | 实时 | 历史归档
```

### SQLite 新增表（tc_cache.db）

```sql
CREATE TABLE IF NOT EXISTS synced_sessions (
  session_id TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
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
  type TEXT,
  timestamp TEXT,
  content TEXT,
  FOREIGN KEY (session_id) REFERENCES synced_sessions(session_id)
);

CREATE INDEX idx_synced_events_session ON synced_events(session_id);
CREATE INDEX idx_synced_sessions_modified ON synced_sessions(modified_at);
```

解密数据只走 Tauri 本地 SQLite，不经过 FastAPI 后端。

## §5 错误处理 & 边界情况

| 场景 | 处理方式 |
|------|---------|
| 密码错误 | `sync_verify_password` 用 manifest 中 `verify_blob` 校验，失败则提示 |
| 网络断开 | push 失败静默记录，下次 SessionEnd 重试（manifest 标记 dirty files） |
| Git 冲突 | 不会发生 —— 每台机器独立 branch（`sync/{hostname}`） |
| 大文件（>25MB） | 分片加密，每片 10MB，`xxx.jsonl.enc.001/.002` |
| 首次全量同步 | 后台线程，前端显示进度条（通过 Tauri event 推送进度） |
| Tauri 未运行 | `tc-sync.key` 不存在 → hook 静默退出 |
| 换机器恢复 | clone 仓库 → 输入密码 → `sync_pull` 全量解密 |
| 多机同时使用 | 各机器独立 branch，pull 时合并所有 `sync/*` 分支的 manifest |

### 多机 branch 策略

```
claude-chat-encrypted/
├── main                    # 空，仅 README
├── sync/desktop-home       # 家里电脑
├── sync/laptop-work        # 工作笔记本
└── sync/server-gpu         # GPU 服务器
```

Tauri pull 时 fetch 所有 `sync/*` 分支，合并解密，实现多机对话历史统一查看。

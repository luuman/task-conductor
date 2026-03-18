# 加密对话同步设计文档

> 将 Claude Code 本地对话数据加密后同步到 GitHub 私有仓库，Tauri 桌面端可拉取解密并在 Sessions 页面展示。

## 需求摘要

| 决策项 | 选择 |
|--------|------|
| 同步范围 | 全部 `~/.claude/` 对话（~1.1GB） |
| 加密方案 | Argon2id 密码派生 + HKDF 子密钥 + AES-256-GCM |
| 触发方式 | Claude Code SessionEnd Hook（5 分钟防抖） |
| GitHub 仓库 | 独立私有仓库，多机独立 branch，Git LFS |
| 数据呈现 | 融入 Tauri `/admin/sessions` 页面 |

## §1 数据流与加密架构

```
┌─────────────────────────────────────────────────────────────┐
│                     加密同步数据流                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ① SessionEnd Hook 触发（5min 防抖）                         │
│     ~/.claude/hooks/sync-hook.sh                            │
│         → flock 串行化 → tc-sync push（从 stdin 读密码）     │
│                                                             │
│  ② tc-sync push                                             │
│     a. 扫描 ~/.claude/projects/**/*.jsonl                   │
│     b. 对比 local-state.json → 只处理增量                    │
│     c. Argon2id → master key → HKDF(file_path) → 子密钥     │
│     d. 每个文件：随机 96-bit nonce + AES-256-GCM 加密        │
│        明文 JSONL → [nonce(12B) || ciphertext || tag(16B)]   │
│     e. 更新 manifest.json.enc（加密索引）                    │
│     f. git2: add → commit → push（SSH key / PAT 认证）      │
│                                                             │
│  ③ GitHub 仓库 (私有, Git LFS for *.enc)                    │
│     encrypted/                                              │
│       ├── {project-hash}/                                   │
│       │   ├── {session-id}.jsonl.enc                        │
│       │   └── subagents/                                    │
│       └── ...                                               │
│     meta.json          （明文：salt, argon2 params, verify） │
│     manifest.json.enc  （加密：文件列表 + HMAC 哈希）        │
│                                                             │
│  ④ Tauri 拉取 + 解密                                        │
│     Rust command: sync_pull                                 │
│     a. git2: fetch 所有 sync/* 分支                         │
│     b. 解密 manifest → 对比本地 → 只解密变更文件              │
│     c. AES-256-GCM 解密 → 解析 JSONL                        │
│     d. 写入 tc_sync.db（独立 SQLite）                        │
│                                                             │
│  ⑤ 前端 Sessions 页面                                       │
│     合并实时 WS + tc_sync.db → 统一渲染                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 加密细节

- **密钥派生**：Argon2id (m=64MB, t=3, p=1) 从密码 + salt 派生 256-bit master key。**密钥派生只在每次同步操作开始时执行一次**
- **子密钥派生**：HKDF-SHA256(master_key, info=file_path) → 每文件独立子密钥，防御 nonce 重用
- **Nonce**：每次加密生成随机 96-bit nonce，前置于密文：`[nonce(12B) || ciphertext || auth_tag(16B)]`
- **加密格式版本**：每个 `.enc` 文件前 5 字节为 header：`[magic(4B): "TCSN"] [version(1B): 0x01]`
- **变更检测**：使用 HMAC-SHA256(master_key, plaintext) 代替裸 SHA-256，不泄露明文指纹
- **压缩**：加密前用 zstd 压缩（JSONL 压缩率约 80%），减小仓库体积

### 增量同步

- `local-state.json`（`~/.claude-sync/` 下，不进 git）记录：每文件 HMAC + 上次同步时间 + dirty 标记
- push 时：扫描 → 对比 HMAC → 只加密变更文件 → 写 `.enc` → 更新 manifest → commit + push
- push 失败：`local-state.json` 保留 dirty 标记，下次重试

## §2 Rust 模块 & Tauri Commands

### 目录结构

```
src-tauri/src/
├── lib.rs            # 现有 + 注册新 commands
├── main.rs           # 不动
└── sync/             # 新模块
    ├── mod.rs        # 模块入口 + 内部 Mutex 锁（防并发）
    ├── crypto.rs     # Argon2id + HKDF + AES-256-GCM + zeroize
    ├── manifest.rs   # manifest 加密/解密 + 增量 diff
    ├── scanner.rs    # 扫描 ~/.claude/，收集 JSONL + subagents
    ├── git.rs        # git2（clone/fetch/commit/push）+ SSH/PAT 认证
    ├── importer.rs   # 解密 JSONL → 解析 → 写入 tc_sync.db
    └── compress.rs   # zstd 压缩/解压
```

`tc-sync` CLI 二进制与 Tauri 共享同一 crate：

```toml
# src-tauri/Cargo.toml
[[bin]]
name = "tc-sync"
path = "src/sync/cli.rs"   # 复用 sync/ 模块，仅加 CLI 入口
```

### Tauri Commands

```rust
#[tauri::command]
async fn sync_init(repo_url: String, password: String, auth_method: AuthMethod) → Result<()>
// 首次设置：clone 空仓库 + 生成 salt + 存 verify_blob + 配置 Git 认证
// AuthMethod: Ssh { key_path } | Pat { token }

#[tauri::command]
async fn sync_push(password: String) → Result<SyncResult>
// 扫描 → 增量加密 → git push
// 通过 Tauri event "sync:progress" 推送进度 { current, total, file_name }

#[tauri::command]
async fn sync_pull(password: String) → Result<SyncResult>
// fetch 所有 sync/* 分支 → 增量解密 → 导入 tc_sync.db
// 多分支合并策略：按 session_id 去重，modified_at 最新者优先

#[tauri::command]
async fn sync_status() → Result<SyncStatus>
// 返回 { last_sync_time, file_count, repo_url, is_configured, branches[] }

#[tauri::command]
async fn sync_verify_password(password: String) → Result<bool>
// 用 meta.json 中的 salt 派生密钥，解密 verify_blob 校验

#[tauri::command]
async fn sync_repair() → Result<RepairResult>
// 对比 manifest 与实际 .enc 文件，修复不一致（orphan 文件/缺失文件）
```

### Cargo.toml 新增依赖

```toml
aes-gcm = "0.10"        # AES-256-GCM
argon2 = "0.5"           # 密钥派生
hkdf = "0.12"            # 子密钥派生
git2 = "0.19"            # Git 操作（libgit2）
sha2 = "0.10"            # HMAC 基础
hmac = "0.12"            # HMAC-SHA256
walkdir = "2"            # 目录扫描
zeroize = "1"            # 内存安全清除密钥
zstd = "0.13"            # 压缩
```

### 密码管理

- 密码不持久化到磁盘
- Tauri 进程内存缓存，使用 `zeroize` crate 确保释放时安全清零
- **30 分钟空闲自动清除**，需重新输入
- Hook 脚本通过 **stdin pipe** 读取密码（非命令行参数，避免 `/proc/PID/cmdline` 泄露）
- Tauri 将密码写入 `$XDG_RUNTIME_DIR/tc-sync.key`（权限 `0600`），fallback 到 `/tmp/tc-sync-$UID/`
- Tauri 退出/崩溃时通过 drop guard 删除该文件

## §3 Hook 集成 & GitHub 仓库结构

### SessionEnd Hook

```bash
#!/bin/bash
# ~/.claude/hooks/sync-hook.sh

TC_SYNC_BIN="$HOME/.local/bin/tc-sync"
TC_SYNC_REPO="$HOME/.claude-sync"
LOCK_FILE="/tmp/tc-sync.lock"
COOLDOWN_FILE="/tmp/tc-sync-last-push"

# 5 分钟防抖：上次 push 不到 300 秒则跳过
if [ -f "$COOLDOWN_FILE" ]; then
  LAST=$(cat "$COOLDOWN_FILE")
  NOW=$(date +%s)
  [ $((NOW - LAST)) -lt 300 ] && exit 0
fi

# 密码文件
KEY_DIR="${XDG_RUNTIME_DIR:-/tmp/tc-sync-$(id -u)}"
KEY_FILE="$KEY_DIR/tc-sync.key"
[ ! -f "$KEY_FILE" ] && exit 0  # 未解锁则静默跳过

# flock 串行化，避免并发 push
(
  flock -n 200 || exit 0
  cat "$KEY_FILE" | $TC_SYNC_BIN push --repo "$TC_SYNC_REPO" --password-stdin
  date +%s > "$COOLDOWN_FILE"
) 200>"$LOCK_FILE" &
# 后台执行，不阻塞 Claude Code
```

### GitHub 仓库结构

```
claude-chat-encrypted/           # 独立私有仓库
├── meta.json                    # 明文：salt, argon2_params, verify_blob
├── manifest.json.enc            # 加密索引（文件列表 + HMAC 哈希）
├── encrypted/
│   ├── a3f8b2c1d4e5f6a7/       # HMAC-SHA256(master_key, 项目路径)[:16]
│   │   ├── 1e7e3459.jsonl.enc   # session-id[:8].jsonl.enc
│   │   └── subagents/
│   │       └── agent-a886.jsonl.enc
│   ├── b7c9d0e1f2a3b4c5/
│   │   └── ...
│   └── ...
├── history.enc                  # 全局 history.jsonl 加密
├── .gitattributes               # *.enc filter=lfs diff=lfs merge=lfs -text
└── .gitignore                   # local-state.json, *.key
```

### meta.json 格式（明文，仅含加密参数）

```json
{
  "version": 1,
  "enc_version": 1,
  "salt": "base64-encoded-32-bytes",
  "argon2_params": {"m": 65536, "t": 3, "p": 1},
  "verify_blob": "base64-加密后的固定字符串",
  "created_at": "2026-03-18T10:00:00Z",
  "hostname": "desktop-home"
}
```

> **安全说明**：`verify_blob` 允许离线密码验证。Argon2id (m=64MB, t=3) 使暴力破解不可行，但仍建议使用强密码（12+ 字符）。

### manifest.json.enc 解密后格式

```json
{
  "files": {
    "encrypted/a3f8b2c1d4e5f6a7/1e7e3459.jsonl.enc": {
      "hmac": "HMAC-SHA256-of-plaintext",
      "size": 284567,
      "compressed_size": 57000,
      "modified": "2026-03-18T10:30:00Z",
      "source_path_hint": "~/.claude/projects/-home-user-myproject/1e7e3459.jsonl"
    }
  }
}
```

### Git 认证

`git2` 通过 credential callback 支持两种方式：
- **SSH key**：默认读 `~/.ssh/id_ed25519`，可在 `sync_init` 时指定路径
- **PAT (Personal Access Token)**：存于 `$XDG_RUNTIME_DIR/tc-sync-git-pat`（同 tmpfs 策略）

### Salt 备份

首次 `sync_init` 时，在终端打印 recovery key（`base64(salt + master_key_verify)`），提示用户离线保存。manifest 丢失时可用 recovery key 重建。

## §4 前端集成

### 新增文件

```
tauri/src/
├── lib/
│   ├── store/sync-store.ts      # Zustand store（同步状态/密码内存缓存）
│   ├── api/sync.ts              # 封装 Tauri invoke 调用 + event 监听
│   └── types/session.ts         # UnifiedSession 统一类型
├── features/admin/pages/settings/
│   └── SyncSettings.tsx         # 同步配置面板（嵌入现有 Settings 页）
```

### 改造文件

```
tauri/src/features/admin/pages/sessions/
└── SessionList.tsx              # 数据源扩展：WS + tc_sync.db
```

### 统一会话类型

```typescript
interface UnifiedSession {
  sessionId: string
  source: 'live' | 'synced'       // 区分来源
  sourceBranch?: string            // synced 时标记来源机器
  projectPath?: string
  firstPrompt?: string
  summary?: string
  messageCount: number
  createdAt: string
  modifiedAt: string
  gitBranch?: string
}
```

### Sessions 页面数据融合

```typescript
// 合并策略：
// 1. 实时会话优先（有 WS 连接的 session 用实时数据）
// 2. 历史会话补充（无实时连接的用 tc_sync.db）
// 3. 按 modifiedAt 时间倒序排列
// 4. 顶部筛选：全部 | 实时 | 历史归档 | 按机器筛选
// 5. 同一 session_id 出现在多个来源时，modifiedAt 最新者优先
```

### 进度事件

```typescript
// 监听 Tauri event
listen('sync:progress', (event) => {
  // { phase: 'scanning' | 'encrypting' | 'pushing' | 'pulling' | 'decrypting',
  //   current: number, total: number, fileName?: string }
})
```

### SQLite（独立 tc_sync.db）

使用独立数据库文件 `tc_sync.db`（非 `tc_cache.db`），避免与 TTL 缓存层耦合。

```sql
CREATE TABLE IF NOT EXISTS synced_sessions (
  session_id TEXT PRIMARY KEY,
  source_branch TEXT NOT NULL,     -- sync/desktop-home
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
  event_type TEXT,                  -- message/tool_use/tool_result/thinking...
  timestamp TEXT,
  content TEXT,                     -- JSON blob
  FOREIGN KEY (session_id) REFERENCES synced_sessions(session_id)
);

CREATE INDEX idx_synced_events_session ON synced_events(session_id);
CREATE INDEX idx_synced_sessions_modified ON synced_sessions(modified_at);
CREATE INDEX idx_synced_sessions_branch ON synced_sessions(source_branch);
```

### JSONL → SQLite 字段映射（importer.rs）

| JSONL 字段 | synced_sessions 列 | 说明 |
|------------|-------------------|------|
| `sessionId` | `session_id` | 主键 |
| `cwd` | `project_path` | 工作目录 |
| 首条 `type: "user"` 的 `message` | `first_prompt` | 截取前 200 字符 |
| 末条 `type: "assistant"` 的 `message` | `summary` | 截取前 200 字符 |
| `type: "message"` 的计数 | `message_count` | 统计 |
| 首条 `timestamp` | `created_at` | |
| 末条 `timestamp` | `modified_at` | |
| `gitBranch` | `git_branch` | |

每条 JSONL 行 → `synced_events` 的一行（`type` + `timestamp` + 原始 JSON 作为 `content`）。

## §5 错误处理 & 边界情况

| 场景 | 处理方式 |
|------|---------|
| 密码错误 | `sync_verify_password` 用 `verify_blob` 校验，3 次失败锁定 5 分钟 |
| 网络断开 | `local-state.json` 标记 dirty，下次 Hook 重试 |
| Git 冲突 | 不会发生 —— 每台机器独立 branch（`sync/{hostname}`） |
| 大文件（>25MB） | zstd 压缩后通常 <5MB，如仍超大则 Git LFS 处理 |
| 首次全量同步 | 后台线程 + `sync:progress` event 推送进度 |
| Tauri 未运行 | `tc-sync.key` 不存在 → hook 静默退出 |
| 换机器恢复 | clone 仓库 → 输入密码 → `sync_pull` 全量解密 |
| 多机同时使用 | 各机器独立 branch，pull 遍历所有 `sync/*` 分支，session_id 去重 |
| 并发 push | `flock` 文件锁串行化 |
| 5 分钟内频繁 SessionEnd | 防抖：cooldown 文件记录上次时间，未到间隔则跳过 |
| manifest 丢失 | 用 recovery key 重建 salt，重新解密 |
| Tauri 并发操作 | `sync/mod.rs` 内部 `Mutex` 锁，同一时刻只有一个 sync 操作 |
| 加密格式升级 | `.enc` 文件 header 含 `enc_version`，新版本可识别并迁移旧文件 |
| 会话被本地删除 | 已知限制：GitHub 上对应 `.enc` 不自动删除，可手动 `sync_repair` 清理 |

### 多机 branch 策略

```
claude-chat-encrypted/
├── main                    # 仅 README + meta.json
├── sync/desktop-home       # 家里电脑
├── sync/laptop-work        # 工作笔记本
└── sync/server-gpu         # GPU 服务器
```

**Pull 语义**：遍历每个 `sync/*` 远程分支，各自解密 manifest → 合并到本地 `tc_sync.db`。同一 `session_id` 出现在多个分支时，取 `modified_at` 最新的版本。每条记录附 `source_branch` 标记来源。

### GitHub 仓库大小管理

- Git LFS 托管 `.enc` 文件，避免 git 历史膨胀
- 仓库增长超过 1GB 时，Tauri 界面提示用户执行 `git lfs prune` 或清理旧归档

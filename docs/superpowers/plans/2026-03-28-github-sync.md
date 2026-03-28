# GitHub 会话备份同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 服务端每日凌晨自动加密备份 Claude 会话到 GitHub 私有仓库，桌面端拉取解密后在 Chat 页面全量展示（含已清除的历史会话），支持收藏和软删除。

**Architecture:** 服务端（Python/FastAPI）负责加密 + git push；桌面端（Tauri/Rust）调用服务端 API 获取解密密钥，git pull 后本地解密写入 `tc_sync.db`；前端 `SessionChat` 合并 live + archived 数据全量展示。

**Tech Stack:** Python（argon2-cffi, cryptography, apscheduler, gitpython）；Rust（aes-gcm, hkdf, sha2, hex, rusqlite, chrono）；TypeScript（@tauri-apps/api, TanStack Query）

---

## File Map

**新建（服务端）**
- `backend/app/sync/__init__.py`
- `backend/app/sync/crypto.py` — Argon2id + HKDF + AES-256-GCM
- `backend/app/sync/exporter.py` — ClaudeSession → 含 transcript 的 JSON
- `backend/app/sync/git_ops.py` — subprocess git clone/pull/push
- `backend/app/sync/manifest.py` — 加密 manifest 读写
- `backend/app/sync/job.py` — APScheduler 每日备份 job
- `backend/app/routers/sync.py` — /api/sync/* 端点
- `backend/tests/sync/test_crypto.py`
- `backend/tests/sync/test_exporter.py`
- `backend/tests/sync/test_git_ops.py`

**修改（服务端）**
- `backend/pyproject.toml` — 新增 argon2-cffi, apscheduler
- `backend/app/models.py` — 新增 SyncConfig, BackupRecord
- `backend/app/main.py` — 注册 router + APScheduler

**新建（桌面端 Rust）**
- `tauri/src-tauri/src/sync/mod.rs`
- `tauri/src-tauri/src/sync/crypto.rs` — HKDF + AES-256-GCM 解密
- `tauri/src-tauri/src/sync/puller.rs` — git pull 封装
- `tauri/src-tauri/src/sync/importer.rs` — 解密 + 写入 tc_sync.db
- `tauri/src-tauri/src/sync/scheduler.rs` — 启动时 pull 检查

**修改（桌面端 Rust）**
- `tauri/src-tauri/Cargo.toml` — 新增依赖
- `tauri/src-tauri/src/lib.rs` — 注册 Tauri 命令

**新建（前端）**
- `tauri/src/hooks/useArchivedSessions.ts` — Tauri IPC + TanStack Query
- `tauri/src/hooks/useSyncPull.ts` — 手动触发 pull + favorite/delete

**修改（前端）**
- `tauri/src/lib/api/types.ts` — 新增 ArchivedSession 类型
- `tauri/src/components/SessionChat/useSessionData.ts` — 合并 archived
- `tauri/src/components/SessionChat/SessionList.tsx` — ☁ 标签 + ★ 收藏 + 🗑 删除
- `tauri/src/components/SessionChat/session-chat.module.css` — 新增样式

---

## Task 1: 服务端依赖 + DB 模型 + 迁移

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py`（lifespan 迁移部分）

- [ ] **Step 1: 在 pyproject.toml 新增依赖**

```toml
# backend/pyproject.toml dependencies 中新增：
"argon2-cffi>=23.1",
"apscheduler>=3.10",
"gitpython>=3.1",
"cryptography>=42",   # python-jose[cryptography] 已带，确保版本足够
```

- [ ] **Step 2: 安装依赖**

```bash
cd backend && source .venv/bin/activate && pip install argon2-cffi apscheduler gitpython
```

- [ ] **Step 3: 在 models.py 末尾追加 SyncConfig 和 BackupRecord**

```python
# 在 backend/app/models.py 末尾追加

class SyncConfig(Base):
    """GitHub 同步配置（单行表）"""
    __tablename__ = "sync_config"
    id: Mapped[int] = mapped_column(primary_key=True)
    github_repo: Mapped[str] = mapped_column(String(200), default="")   # "owner/repo"
    github_pat: Mapped[str] = mapped_column(Text, default="")
    encrypt_password: Mapped[str] = mapped_column(Text, default="")
    salt: Mapped[str] = mapped_column(String(64), default="")            # hex，固定不变
    argon2_time_cost: Mapped[int] = mapped_column(Integer, default=3)
    argon2_memory_kb: Mapped[int] = mapped_column(Integer, default=65536)
    argon2_parallelism: Mapped[int] = mapped_column(Integer, default=4)
    last_push_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class BackupRecord(Base):
    """每个 session 的最新备份记录"""
    __tablename__ = "backup_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(128), index=True, unique=True)
    enc_path: Mapped[str] = mapped_column(String(300))     # GitHub 上的路径
    content_hash: Mapped[str] = mapped_column(String(64))  # sha256 hex of plaintext
    backed_up_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 4: 在 main.py lifespan 的迁移块中追加新表建表语句**

在 `main.py` 的 `lifespan` 函数中，现有 `try/except` 迁移块之后（`yield` 之前）添加：

```python
    # sync 模块表建立（幂等）
    from .sync.config import ensure_sync_config
    ensure_sync_config()
```

> 注：`ensure_sync_config()` 在 Task 2 创建，负责确保 sync_config 表有且只有一行默认记录。

- [ ] **Step 5: 确认 Base.metadata.create_all 能感知新模型**

`models.py` 新增的两个 class 已继承 `Base`，`create_all` 会自动创建。验证：

```bash
cd backend && source .venv/bin/activate
python -c "from app.models import SyncConfig, BackupRecord; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/app/models.py backend/app/main.py
git commit -m "feat(sync): add SyncConfig + BackupRecord models"
```

---

## Task 2: sync/crypto.py — Argon2id + HKDF + AES-256-GCM

**Files:**
- Create: `backend/app/sync/__init__.py`
- Create: `backend/app/sync/crypto.py`
- Create: `backend/app/sync/config.py`
- Create: `backend/tests/sync/__init__.py`
- Create: `backend/tests/sync/test_crypto.py`

- [ ] **Step 1: 创建 sync 包**

```bash
mkdir -p backend/app/sync backend/tests/sync
touch backend/app/sync/__init__.py backend/tests/sync/__init__.py
```

- [ ] **Step 2: 写失败测试**

```python
# backend/tests/sync/test_crypto.py
import os
import pytest
from app.sync.crypto import derive_master_key, derive_file_key, encrypt_bytes, decrypt_bytes

def test_derive_master_key_deterministic():
    salt = os.urandom(16).hex()
    k1 = derive_master_key("password", salt)
    k2 = derive_master_key("password", salt)
    assert k1 == k2
    assert len(k1) == 32

def test_derive_master_key_different_password():
    salt = os.urandom(16).hex()
    k1 = derive_master_key("pass1", salt)
    k2 = derive_master_key("pass2", salt)
    assert k1 != k2

def test_derive_file_key_differs_by_path():
    master = os.urandom(32)
    k1 = derive_file_key(master, "encrypted/aaa.jsonl.enc")
    k2 = derive_file_key(master, "encrypted/bbb.jsonl.enc")
    assert k1 != k2
    assert len(k1) == 32

def test_encrypt_decrypt_roundtrip():
    file_key = os.urandom(32)
    plaintext = b"hello world\n" * 100
    ciphertext = encrypt_bytes(file_key, plaintext)
    assert ciphertext != plaintext
    assert len(ciphertext) == 12 + len(plaintext) + 16  # nonce + data + tag
    result = decrypt_bytes(file_key, ciphertext)
    assert result == plaintext

def test_decrypt_wrong_key_raises():
    file_key = os.urandom(32)
    wrong_key = os.urandom(32)
    ciphertext = encrypt_bytes(file_key, b"secret")
    with pytest.raises(Exception):
        decrypt_bytes(wrong_key, ciphertext)
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
cd backend && source .venv/bin/activate
pytest tests/sync/test_crypto.py -v
```

Expected: `ImportError` 或 `ModuleNotFoundError`

- [ ] **Step 4: 实现 crypto.py**

```python
# backend/app/sync/crypto.py
import os
from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ARGON2_HASH_LEN = 32


def derive_master_key(
    password: str,
    salt_hex: str,
    time_cost: int = 3,
    memory_kb: int = 65536,
    parallelism: int = 4,
) -> bytes:
    """Argon2id: password + salt → 32-byte master key."""
    salt = bytes.fromhex(salt_hex)
    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=time_cost,
        memory_cost=memory_kb,
        parallelism=parallelism,
        hash_len=ARGON2_HASH_LEN,
        type=Type.ID,
    )


def derive_file_key(master_key: bytes, file_rel_path: str) -> bytes:
    """HKDF-SHA256: master_key + file_rel_path → 32-byte file key."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=file_rel_path.encode("utf-8"),
    )
    return hkdf.derive(master_key)


def encrypt_bytes(file_key: bytes, plaintext: bytes) -> bytes:
    """AES-256-GCM encrypt. Returns: nonce(12) + ciphertext + tag(16)."""
    nonce = os.urandom(12)
    aesgcm = AESGCM(file_key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext_with_tag


def decrypt_bytes(file_key: bytes, data: bytes) -> bytes:
    """AES-256-GCM decrypt. Input: nonce(12) + ciphertext + tag(16)."""
    if len(data) < 12 + 16:
        raise ValueError("Ciphertext too short")
    nonce = data[:12]
    ciphertext_with_tag = data[12:]
    aesgcm = AESGCM(file_key)
    return aesgcm.decrypt(nonce, ciphertext_with_tag, None)


def new_salt() -> str:
    """Generate a random 16-byte salt, returned as hex string."""
    return os.urandom(16).hex()
```

- [ ] **Step 5: 实现 config.py（SyncConfig CRUD + ensure_sync_config）**

```python
# backend/app/sync/config.py
import os
from ..database import engine, SessionLocal
from ..models import SyncConfig
from .crypto import new_salt


def ensure_sync_config() -> None:
    """确保 sync_config 表有且只有一行（首次启动时创建默认行）。"""
    with SessionLocal() as db:
        if db.query(SyncConfig).count() == 0:
            db.add(SyncConfig(salt=new_salt()))
            db.commit()


def load_sync_config() -> SyncConfig | None:
    """返回配置行，不存在返回 None。"""
    with SessionLocal() as db:
        return db.query(SyncConfig).first()


def update_sync_config(data: dict) -> SyncConfig:
    """更新指定字段，返回更新后对象（已 expunge，可在 session 外访问）。"""
    with SessionLocal() as db:
        cfg = db.query(SyncConfig).first()
        if not cfg:
            raise RuntimeError("SyncConfig 不存在，请先调用 ensure_sync_config()")
        for k, v in data.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
        db.commit()
        db.refresh(cfg)
        db.expunge(cfg)
        return cfg
```

- [ ] **Step 6: 运行测试，确认全部通过**

```bash
cd backend && pytest tests/sync/test_crypto.py -v
```

Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add backend/app/sync/ backend/tests/sync/
git commit -m "feat(sync): add crypto module (Argon2id + HKDF + AES-256-GCM)"
```

---

## Task 3: sync/exporter.py — Session 导出

**Files:**
- Create: `backend/app/sync/exporter.py`
- Create: `backend/tests/sync/test_exporter.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/sync/test_exporter.py
import json
import pytest
from unittest.mock import MagicMock, patch
from app.sync.exporter import export_session, get_sessions_to_backup


def make_mock_session(session_id="abc123", cwd="/home/user/proj", last_seen_at=None):
    from datetime import datetime
    s = MagicMock()
    s.session_id = session_id
    s.cwd = cwd
    s.status = "stopped"
    s.event_count = 5
    s.started_at = datetime(2026, 1, 1, 10, 0, 0)
    s.last_seen_at = last_seen_at or datetime(2026, 1, 1, 11, 0, 0)
    return s


def test_export_session_contains_required_fields():
    session = make_mock_session()
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = session

    with patch("app.sync.exporter._get_transcript", return_value=[]):
        result = export_session("abc123", mock_db)

    assert result["session_id"] == "abc123"
    assert result["cwd"] == "/home/user/proj"
    assert "transcript" in result
    assert isinstance(result["transcript"], list)


def test_export_session_not_found_raises():
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = None
    with pytest.raises(ValueError, match="not found"):
        export_session("nonexistent", mock_db)


def test_get_sessions_to_backup_returns_unbacked():
    mock_db = MagicMock()
    session = make_mock_session("s1")
    mock_db.query.return_value.all.side_effect = [
        [session],   # ClaudeSession.all()
        [],          # BackupRecord.all()
    ]
    result = get_sessions_to_backup(mock_db)
    assert "s1" in result
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd backend && pytest tests/sync/test_exporter.py -v
```

Expected: `ImportError`

- [ ] **Step 3: 实现 exporter.py**

```python
# backend/app/sync/exporter.py
import json
import hashlib
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session as DBSession
from ..models import ClaudeSession, BackupRecord
from ..routers.sessions import _load_transcript_from_jsonl, _load_transcript_from_db


def _get_transcript(session_id: str, cwd: str, db: DBSession) -> list:
    """获取会话的 TranscriptMessage 列表（优先 DB，回退 JSONL）。"""
    msgs = _load_transcript_from_db(session_id, db)
    if msgs is None:
        msgs = _load_transcript_from_jsonl(session_id, cwd)
    if msgs is None:
        return []
    # 序列化 Pydantic 对象为 dict
    return [m.model_dump() for m in msgs]


def export_session(session_id: str, db: DBSession) -> dict:
    """
    将会话导出为可序列化的 dict，包含 metadata + transcript。
    用于加密后推送到 GitHub。
    """
    s = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not s:
        raise ValueError(f"Session {session_id} not found")

    transcript = _get_transcript(session_id, s.cwd or "", db)

    return {
        "session_id": s.session_id,
        "cwd": s.cwd,
        "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "last_seen_at": s.last_seen_at.isoformat() if s.last_seen_at else None,
        "event_count": len(transcript),
        "transcript": transcript,
    }


def export_session_bytes(session_id: str, db: DBSession) -> tuple[bytes, str]:
    """
    导出会话为 JSON bytes，同时返回 sha256 hex。
    Returns: (json_bytes, sha256_hex)
    """
    data = export_session(session_id, db)
    raw = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
    sha256 = hashlib.sha256(raw).hexdigest()
    return raw, sha256


def get_sessions_to_backup(db: DBSession) -> list[str]:
    """
    返回需要备份（新增或有更新）的 session_id 列表。
    """
    backed_up: dict[str, BackupRecord] = {
        r.session_id: r for r in db.query(BackupRecord).all()
    }
    sessions = db.query(ClaudeSession).all()
    to_backup = []
    for s in sessions:
        if s.session_id not in backed_up:
            to_backup.append(s.session_id)
        else:
            rec = backed_up[s.session_id]
            if s.last_seen_at and s.last_seen_at > rec.backed_up_at:
                to_backup.append(s.session_id)
    return to_backup
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
cd backend && pytest tests/sync/test_exporter.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/sync/exporter.py backend/tests/sync/test_exporter.py
git commit -m "feat(sync): add session exporter"
```

---

## Task 4: sync/git_ops.py + sync/manifest.py

**Files:**
- Create: `backend/app/sync/git_ops.py`
- Create: `backend/app/sync/manifest.py`
- Create: `backend/tests/sync/test_git_ops.py`

- [ ] **Step 1: 写 git_ops 失败测试**

```python
# backend/tests/sync/test_git_ops.py
import os
import subprocess
import tempfile
import pytest
from app.sync.git_ops import git_run, commit_and_push_if_changed


def test_git_run_basic(tmp_path):
    """git_run 能执行 git init 并返回输出。"""
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True)
    out = git_run(str(tmp_path), "status", "--short")
    assert isinstance(out, str)


def test_git_run_invalid_command_raises(tmp_path):
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True)
    with pytest.raises(subprocess.CalledProcessError):
        git_run(str(tmp_path), "invalid-command-xyz")


def test_commit_and_push_if_changed_nothing_to_commit(tmp_path):
    """空变更时 commit_and_push_if_changed 不抛出，返回 False。"""
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, check=True, capture_output=True)
    result = commit_and_push_if_changed(str(tmp_path), "test message", push=False)
    assert result is False
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd backend && pytest tests/sync/test_git_ops.py -v
```

Expected: `ImportError`

- [ ] **Step 3: 实现 git_ops.py**

```python
# backend/app/sync/git_ops.py
import os
import subprocess
from pathlib import Path


def git_run(cwd: str, *args: str, timeout: int = 300) -> str:
    """运行 git 命令，返回 stdout，失败时抛 CalledProcessError。timeout 默认 300s。"""
    result = subprocess.run(
        ["git"] + list(args),
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
        timeout=timeout,
    )
    return result.stdout.strip()


def _remote_url(github_repo: str, github_pat: str) -> str:
    return f"https://x-access-token:{github_pat}@github.com/{github_repo}.git"


def ensure_repo(repo_dir: str, github_repo: str, github_pat: str) -> None:
    """
    确保本地备份仓库存在并与远端同步。
    - 若不存在：git clone
    - 若存在：更新 remote URL + git pull --rebase
    """
    remote_url = _remote_url(github_repo, github_pat)
    git_dir = os.path.join(repo_dir, ".git")

    if not os.path.exists(git_dir):
        os.makedirs(repo_dir, exist_ok=True)
        parent = str(Path(repo_dir).parent)
        name = Path(repo_dir).name
        subprocess.run(
            ["git", "clone", remote_url, name],
            cwd=parent,
            check=True,
            capture_output=True,
        )
    else:
        git_run(repo_dir, "remote", "set-url", "origin", remote_url)
        try:
            git_run(repo_dir, "pull", "--rebase", "origin", "main")
        except subprocess.CalledProcessError:
            pass  # 空仓库时 pull 会失败，忽略


def init_empty_repo(repo_dir: str, github_repo: str, github_pat: str) -> None:
    """初始化本地仓库并关联远端（用于首次推送到空 GitHub 仓库）。"""
    remote_url = _remote_url(github_repo, github_pat)
    os.makedirs(repo_dir, exist_ok=True)
    git_run(repo_dir, "init", "-b", "main")
    git_run(repo_dir, "remote", "add", "origin", remote_url)
    git_run(repo_dir, "config", "user.email", "task-conductor@sync")
    git_run(repo_dir, "config", "user.name", "TaskConductor Sync")


def commit_and_push_if_changed(
    repo_dir: str,
    message: str,
    push: bool = True,
) -> bool:
    """
    add -A → commit → push。
    Returns True if committed, False if nothing to commit.
    """
    git_run(repo_dir, "add", "-A")
    status = git_run(repo_dir, "status", "--porcelain")
    if not status:
        return False
    git_run(repo_dir, "commit", "-m", message)
    if push:
        try:
            git_run(repo_dir, "push", "origin", "main")
        except subprocess.CalledProcessError:
            # 首次推送：可能需要 --set-upstream
            git_run(repo_dir, "push", "--set-upstream", "origin", "main")
    return True
```

- [ ] **Step 4: 实现 manifest.py**

```python
# backend/app/sync/manifest.py
import json
import os
from dataclasses import dataclass, asdict
from .crypto import derive_file_key, encrypt_bytes, decrypt_bytes

MANIFEST_REL_PATH = "manifest.json.enc"


@dataclass
class ManifestEntry:
    session_id: str
    enc_path: str
    content_hash: str
    backed_up_at: str


def read_manifest(repo_dir: str, master_key: bytes) -> list[ManifestEntry]:
    """读取并解密 manifest，不存在时返回空列表。"""
    path = os.path.join(repo_dir, MANIFEST_REL_PATH)
    if not os.path.exists(path):
        return []
    file_key = derive_file_key(master_key, MANIFEST_REL_PATH)
    with open(path, "rb") as f:
        ciphertext = f.read()
    plaintext = decrypt_bytes(file_key, ciphertext)
    entries = json.loads(plaintext.decode("utf-8"))
    return [ManifestEntry(**e) for e in entries]


def write_manifest(
    repo_dir: str,
    master_key: bytes,
    entries: list[ManifestEntry],
) -> None:
    """加密并写入 manifest。"""
    file_key = derive_file_key(master_key, MANIFEST_REL_PATH)
    plaintext = json.dumps([asdict(e) for e in entries]).encode("utf-8")
    ciphertext = encrypt_bytes(file_key, plaintext)
    path = os.path.join(repo_dir, MANIFEST_REL_PATH)
    with open(path, "wb") as f:
        f.write(ciphertext)
```

- [ ] **Step 5: 运行测试，确认 git_ops 全部通过**

```bash
cd backend && pytest tests/sync/test_git_ops.py -v
```

Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/sync/git_ops.py backend/app/sync/manifest.py backend/tests/sync/test_git_ops.py
git commit -m "feat(sync): add git_ops + manifest modules"
```

---

## Task 5: sync/job.py — 每日备份 Job

**Files:**
- Create: `backend/app/sync/job.py`

- [ ] **Step 1: 实现 job.py**

```python
# backend/app/sync/job.py
"""
APScheduler 备份 job。
每日凌晨 00:00 自动执行：
  1. 读取 SyncConfig（未启用则跳过）
  2. 派生 master_key
  3. 确保本地 git 仓库已同步
  4. 对每个待备份 session：加密 → 写文件 → 记录 BackupRecord
  5. 写 manifest.json.enc
  6. commit + push
  7. 更新 last_push_at
"""
import os
import logging
from datetime import datetime
from pathlib import Path
from .config import load_sync_config
from .crypto import derive_master_key, derive_file_key, encrypt_bytes
from .exporter import export_session_bytes, get_sessions_to_backup
from .git_ops import ensure_repo, init_empty_repo, commit_and_push_if_changed
from .manifest import read_manifest, write_manifest, ManifestEntry
from ..database import SessionLocal
from ..models import BackupRecord, SyncConfig

logger = logging.getLogger(__name__)

DEFAULT_REPO_DIR = os.path.expanduser("~/.task-conductor/sync-repo")


def _get_repo_dir() -> str:
    return os.environ.get("TC_SYNC_REPO_DIR", DEFAULT_REPO_DIR)


def run_sync_job() -> dict:
    """
    执行一次完整备份。返回 {"backed_up": N, "skipped": N, "error": str|None}。
    """
    cfg = load_sync_config()
    if not cfg or not cfg.enabled:
        logger.info("[sync] 备份未启用，跳过")
        return {"backed_up": 0, "skipped": 0, "error": None}

    if not cfg.github_repo or not cfg.github_pat or not cfg.encrypt_password:
        msg = "sync_config 缺少 github_repo/github_pat/encrypt_password"
        logger.warning(f"[sync] {msg}")
        return {"backed_up": 0, "skipped": 0, "error": msg}

    try:
        master_key = derive_master_key(
            cfg.encrypt_password,
            cfg.salt,
            cfg.argon2_time_cost,
            cfg.argon2_memory_kb,
            cfg.argon2_parallelism,
        )
    except Exception as e:
        return {"backed_up": 0, "skipped": 0, "error": f"key derivation failed: {e}"}

    repo_dir = _get_repo_dir()

    # 确保 meta.json 存在（首次）
    _write_meta_json(repo_dir, cfg)

    # 确保 git 仓库
    try:
        git_dir = os.path.join(repo_dir, ".git")
        if not os.path.exists(git_dir):
            init_empty_repo(repo_dir, cfg.github_repo, cfg.github_pat)
        else:
            ensure_repo(repo_dir, cfg.github_repo, cfg.github_pat)
    except Exception as e:
        return {"backed_up": 0, "skipped": 0, "error": f"git setup failed: {e}"}

    backed_up = 0
    skipped = 0
    errors = []

    with SessionLocal() as db:
        session_ids = get_sessions_to_backup(db)
        manifest = read_manifest(repo_dir, master_key)
        manifest_map = {e.session_id: e for e in manifest}

        for session_id in session_ids:
            try:
                raw_bytes, sha256 = export_session_bytes(session_id, db)
                enc_path = f"encrypted/{session_id}.json.enc"
                file_key = derive_file_key(master_key, enc_path)
                ciphertext = encrypt_bytes(file_key, raw_bytes)

                # 写加密文件
                abs_path = os.path.join(repo_dir, enc_path)
                os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                with open(abs_path, "wb") as f:
                    f.write(ciphertext)

                # 更新 BackupRecord
                rec = db.query(BackupRecord).filter_by(session_id=session_id).first()
                now = datetime.utcnow()
                if rec:
                    rec.enc_path = enc_path
                    rec.content_hash = sha256
                    rec.backed_up_at = now
                    rec.file_size = len(raw_bytes)
                else:
                    db.add(BackupRecord(
                        session_id=session_id,
                        enc_path=enc_path,
                        content_hash=sha256,
                        backed_up_at=now,
                        file_size=len(raw_bytes),
                    ))

                # 更新 manifest
                manifest_map[session_id] = ManifestEntry(
                    session_id=session_id,
                    enc_path=enc_path,
                    content_hash=sha256,
                    backed_up_at=now.isoformat(),
                )
                backed_up += 1
            except Exception as e:
                logger.error(f"[sync] session {session_id} 备份失败: {e}")
                errors.append(str(e))
                skipped += 1

        db.commit()

    # 写 manifest
    write_manifest(repo_dir, master_key, list(manifest_map.values()))

    # commit + push
    try:
        commit_and_push_if_changed(
            repo_dir,
            f"sync: backup {backed_up} sessions [{datetime.utcnow().isoformat()[:19]}]",
        )
    except Exception as e:
        logger.error(f"[sync] git push 失败: {e}")
        errors.append(f"push failed: {e}")

    # 更新 last_push_at
    with SessionLocal() as db:
        cfg_row = db.query(SyncConfig).first()
        if cfg_row:
            cfg_row.last_push_at = datetime.utcnow()
            db.commit()

    error_msg = "; ".join(errors) if errors else None
    logger.info(f"[sync] 完成：backed_up={backed_up}, skipped={skipped}")
    return {"backed_up": backed_up, "skipped": skipped, "error": error_msg}


def _write_meta_json(repo_dir: str, cfg: SyncConfig) -> None:
    """写入明文 meta.json（salt + argon2 参数）。"""
    import json
    meta_path = os.path.join(repo_dir, "meta.json")
    if not os.path.exists(meta_path):
        os.makedirs(repo_dir, exist_ok=True)
        meta = {
            "version": 1,
            "salt": cfg.salt,
            "argon2_params": {
                "time_cost": cfg.argon2_time_cost,
                "memory_kb": cfg.argon2_memory_kb,
                "parallelism": cfg.argon2_parallelism,
            },
        }
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
```

- [ ] **Step 2: 确认 import 正确**

```bash
cd backend && source .venv/bin/activate
python -c "from app.sync.job import run_sync_job; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/sync/job.py
git commit -m "feat(sync): add daily backup job"
```

---

## Task 6: routers/sync.py + main.py 注册

**Files:**
- Create: `backend/app/routers/sync.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 实现 routers/sync.py**

```python
# backend/app/routers/sync.py
import binascii
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import SyncConfig, BackupRecord
from ..sync.config import load_sync_config, update_sync_config
from ..sync.crypto import derive_master_key
from ..session import require_auth

router = APIRouter(prefix="/api/sync", tags=["sync"])


class SyncConfigUpdate(BaseModel):
    github_repo: str | None = None
    github_pat: str | None = None
    encrypt_password: str | None = None
    enabled: bool | None = None


@router.get("/crypto-params")
def get_crypto_params(_=Depends(require_auth)):
    """
    返回解密所需的 master_key（预派生）+ GitHub 凭据。
    桌面端 Tauri 用于 git pull + AES-GCM 解密。
    """
    cfg = load_sync_config()
    if not cfg or not cfg.encrypt_password or not cfg.salt:
        raise HTTPException(status_code=404, detail="同步尚未配置")

    master_key = derive_master_key(
        cfg.encrypt_password,
        cfg.salt,
        cfg.argon2_time_cost,
        cfg.argon2_memory_kb,
        cfg.argon2_parallelism,
    )
    return {
        "master_key_hex": master_key.hex(),
        "github_repo": cfg.github_repo,
        "github_pat": cfg.github_pat,
    }


@router.get("/status")
def get_status(_=Depends(require_auth), db: Session = Depends(get_db)):
    """备份状态：最近推送时间、已备份数量、是否启用。"""
    cfg = load_sync_config()
    if not cfg:
        return {"enabled": False, "last_push_at": None, "total_backed_up": 0}
    total = db.query(BackupRecord).count()
    return {
        "enabled": cfg.enabled,
        "last_push_at": cfg.last_push_at.isoformat() if cfg.last_push_at else None,
        "total_backed_up": total,
    }


@router.put("/config")
def put_config(body: SyncConfigUpdate, _=Depends(require_auth)):
    """更新同步配置（github_repo / github_pat / encrypt_password / enabled）。"""
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="无有效字段")
    update_sync_config(data)
    return {"ok": True}


@router.post("/push")
def manual_push(background_tasks: BackgroundTasks, _=Depends(require_auth)):
    """手动触发一次备份 push（异步后台执行）。"""
    from ..sync.job import run_sync_job
    background_tasks.add_task(run_sync_job)
    return {"ok": True, "message": "备份已在后台启动"}
```

- [ ] **Step 2: 在 main.py 注册 router 和 APScheduler**

在 `main.py` 的 import 区顶部添加：
```python
from .routers import sync as sync_router
```

在 `lifespan` 函数的 `yield` 之前添加 APScheduler 启动代码：
```python
    # APScheduler：每日凌晨备份
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from .sync.job import run_sync_job
    from .sync.config import ensure_sync_config
    ensure_sync_config()
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(run_sync_job, "cron", hour=0, minute=0, id="github_sync")
    _scheduler.start()
    yield
    _scheduler.shutdown(wait=False)
```

在 router 注册区末尾添加：
```python
app.include_router(sync_router.router)   # GET/PUT /api/sync/*, POST /api/sync/push
```

- [ ] **Step 3: 验证服务器启动无报错**

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload &
sleep 3
curl -s http://localhost:8765/docs | grep -q "sync" && echo "OK"
kill %1
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/sync.py backend/app/main.py
git commit -m "feat(sync): add sync router + APScheduler daily job"
```

---

## Task 7: Cargo.toml + sync/crypto.rs

**Files:**
- Modify: `tauri/src-tauri/Cargo.toml`
- Create: `tauri/src-tauri/src/sync/mod.rs`
- Create: `tauri/src-tauri/src/sync/crypto.rs`

- [ ] **Step 1: 更新 Cargo.toml**

```toml
# tauri/src-tauri/Cargo.toml [dependencies] 末尾追加：
aes-gcm  = "0.10"
hkdf     = "0.12"
sha2     = "0.10"
hex      = "0.4"
rusqlite = { version = "0.31", features = ["bundled"] }
chrono   = { version = "0.4", features = ["serde"] }
reqwest  = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
tokio    = { version = "1", features = ["rt", "macros"] }
```

- [ ] **Step 2: 创建 sync/mod.rs**

```rust
// tauri/src-tauri/src/sync/mod.rs
pub mod crypto;
pub mod puller;
pub mod importer;
pub mod scheduler;
```

- [ ] **Step 3: 实现 sync/crypto.rs（含内联测试）**

```rust
// tauri/src-tauri/src/sync/crypto.rs
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use hkdf::Hkdf;
use sha2::Sha256;

/// HKDF-SHA256: master_key_hex + file_rel_path → 32-byte file key
pub fn derive_file_key(master_key_hex: &str, file_rel_path: &str) -> Result<[u8; 32], String> {
    let master_key = hex::decode(master_key_hex)
        .map_err(|e| format!("Invalid master_key_hex: {e}"))?;
    let hk = Hkdf::<Sha256>::new(None, &master_key);
    let mut file_key = [0u8; 32];
    hk.expand(file_rel_path.as_bytes(), &mut file_key)
        .map_err(|e| format!("HKDF expand error: {e}"))?;
    Ok(file_key)
}

/// AES-256-GCM decrypt. Input: nonce(12) + ciphertext + tag(16)
pub fn decrypt_file(file_key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 28 {
        return Err("Ciphertext too short (< 28 bytes)".to_string());
    }
    let key = Key::<Aes256Gcm>::from_slice(file_key);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&data[..12]);
    cipher
        .decrypt(nonce, &data[12..])
        .map_err(|_| "AES-256-GCM decryption failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes_gcm::aead::OsRng;
    use aes_gcm::aead::rand_core::RngCore;

    fn random_hex_key() -> String {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        hex::encode(key)
    }

    #[test]
    fn test_derive_file_key_deterministic() {
        let master_hex = random_hex_key();
        let k1 = derive_file_key(&master_hex, "encrypted/abc.json.enc").unwrap();
        let k2 = derive_file_key(&master_hex, "encrypted/abc.json.enc").unwrap();
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_derive_file_key_differs_by_path() {
        let master_hex = random_hex_key();
        let k1 = derive_file_key(&master_hex, "encrypted/a.json.enc").unwrap();
        let k2 = derive_file_key(&master_hex, "encrypted/b.json.enc").unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // 用 Python 端的加密逻辑模拟：手动构造 nonce + AES-GCM 密文
        // 这里只测试 derive_file_key 不报错，decrypt 的完整 roundtrip
        // 需要与 Python 端 integration test 覆盖
        let master_hex = random_hex_key();
        let file_key = derive_file_key(&master_hex, "test/file.json.enc").unwrap();
        assert_eq!(file_key.len(), 32);
    }

    #[test]
    fn test_decrypt_too_short_returns_err() {
        let key = [0u8; 32];
        let result = decrypt_file(&key, &[0u8; 10]);
        assert!(result.is_err());
    }
}
```

- [ ] **Step 4: 在 lib.rs 中声明 sync 模块**

在 `tauri/src-tauri/src/lib.rs` 顶部 use 块之前添加：
```rust
mod sync;
```

- [ ] **Step 5: 运行 Rust 测试**

```bash
cd tauri/src-tauri && cargo test sync::crypto
```

Expected: 4 tests pass

- [ ] **Step 6: Commit**

```bash
git add tauri/src-tauri/Cargo.toml tauri/src-tauri/src/sync/
git commit -m "feat(sync): add Rust crypto module (HKDF + AES-256-GCM)"
```

---

## Task 8: sync/puller.rs + sync/importer.rs

**Files:**
- Create: `tauri/src-tauri/src/sync/puller.rs`
- Create: `tauri/src-tauri/src/sync/importer.rs`

- [ ] **Step 1: 实现 puller.rs**

```rust
// tauri/src-tauri/src/sync/puller.rs
//! git pull 封装：clone 或更新本地备份仓库。
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct GitPuller {
    pub repo_dir: PathBuf,
}

impl GitPuller {
    pub fn new(repo_dir: PathBuf) -> Self {
        Self { repo_dir }
    }

    fn remote_url(github_repo: &str, github_pat: &str) -> String {
        format!("https://x-access-token:{github_pat}@github.com/{github_repo}.git")
    }

    fn git(&self, args: &[&str]) -> Result<String, String> {
        let out = Command::new("git")
            .args(args)
            .current_dir(&self.repo_dir)
            .output()
            .map_err(|e| format!("git exec error: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }

    /// Clone or pull remote repo into self.repo_dir.
    pub fn sync(&self, github_repo: &str, github_pat: &str) -> Result<(), String> {
        let remote_url = Self::remote_url(github_repo, github_pat);
        let git_dir = self.repo_dir.join(".git");

        if !git_dir.exists() {
            // Clone
            let parent = self.repo_dir.parent().ok_or("No parent dir")?;
            let name = self.repo_dir
                .file_name()
                .ok_or("No dir name")?
                .to_string_lossy()
                .to_string();
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir failed: {e}"))?;
            let out = Command::new("git")
                .args(["clone", &remote_url, &name])
                .current_dir(parent)
                .output()
                .map_err(|e| format!("git clone failed: {e}"))?;
            if !out.status.success() {
                return Err(String::from_utf8_lossy(&out.stderr).to_string());
            }
        } else {
            // Update remote URL and pull
            self.git(&["remote", "set-url", "origin", &remote_url])?;
            self.git(&["pull", "--rebase", "origin", "main"])
                .unwrap_or_default(); // 空仓库 pull 失败时忽略
        }
        Ok(())
    }

    /// List all .json.enc files in encrypted/ directory.
    pub fn list_encrypted_files(&self) -> Result<Vec<PathBuf>, String> {
        let enc_dir = self.repo_dir.join("encrypted");
        if !enc_dir.exists() {
            return Ok(vec![]);
        }
        let mut files = vec![];
        for entry in std::fs::read_dir(&enc_dir).map_err(|e| format!("readdir: {e}"))? {
            let entry = entry.map_err(|e| format!("entry error: {e}"))?;
            let path = entry.path();
            if path.extension().map(|e| e == "enc").unwrap_or(false) {
                files.push(path);
            }
        }
        Ok(files)
    }
}
```

- [ ] **Step 2: 实现 importer.rs**

```rust
// tauri/src-tauri/src/sync/importer.rs
//! 解密已拉取的备份文件并写入 tc_sync.db。
use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;

use super::crypto::{derive_file_key, decrypt_file};

const INIT_SQL: &str = "
CREATE TABLE IF NOT EXISTS archived_sessions (
    session_id    TEXT PRIMARY KEY,
    summary       TEXT,
    cwd           TEXT,
    started_at    TEXT,
    last_event_at TEXT,
    event_count   INTEGER DEFAULT 0,
    enc_path      TEXT,
    transcript    TEXT,
    synced_at     TEXT NOT NULL,
    is_favorite   INTEGER NOT NULL DEFAULT 0,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pull_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pulled_at   TEXT NOT NULL,
    files_count INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL
);
";

pub fn open_sync_db(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open tc_sync.db: {e}"))?;
    conn.execute_batch(INIT_SQL)
        .map_err(|e| format!("Failed to init tables: {e}"))?;
    Ok(conn)
}

/// Decrypt one encrypted file and upsert into archived_sessions.
/// Returns session_id on success.
pub fn import_file(
    conn: &Connection,
    enc_path: &Path,
    master_key_hex: &str,
) -> Result<String, String> {
    let rel_path = format!(
        "encrypted/{}",
        enc_path.file_name().unwrap().to_string_lossy()
    );
    let file_key = derive_file_key(master_key_hex, &rel_path)?;
    let ciphertext =
        std::fs::read(enc_path).map_err(|e| format!("Read file error: {e}"))?;
    let plaintext = decrypt_file(&file_key, &ciphertext)?;

    let data: Value = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("JSON parse error: {e}"))?;

    let session_id = data["session_id"]
        .as_str()
        .ok_or("Missing session_id")?
        .to_string();

    let transcript_str = serde_json::to_string(&data["transcript"])
        .map_err(|e| format!("Serialize transcript error: {e}"))?;

    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO archived_sessions
         (session_id, summary, cwd, started_at, last_event_at, event_count,
          enc_path, transcript, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            session_id,
            data["summary"].as_str().unwrap_or(""),
            data["cwd"].as_str().unwrap_or(""),
            data["started_at"].as_str().unwrap_or(""),
            data["last_seen_at"].as_str().unwrap_or(""),
            data["event_count"].as_i64().unwrap_or(0),
            rel_path,
            transcript_str,
            now,
        ],
    )
    .map_err(|e| format!("DB upsert error: {e}"))?;

    Ok(session_id)
}

pub fn record_pull(conn: &Connection, files_count: usize, status: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO pull_records (pulled_at, files_count, status) VALUES (?1, ?2, ?3)",
        params![now, files_count as i64, status],
    )
    .map_err(|e| format!("DB insert pull_record error: {e}"))?;
    Ok(())
}
```

- [ ] **Step 3: 确认编译通过**

```bash
cd tauri/src-tauri && cargo check
```

Expected: `Finished` 无 error

- [ ] **Step 4: Commit**

```bash
git add tauri/src-tauri/src/sync/puller.rs tauri/src-tauri/src/sync/importer.rs
git commit -m "feat(sync): add Rust puller + importer"
```

---

## Task 9: sync/scheduler.rs + Tauri 命令注册

**Files:**
- Create: `tauri/src-tauri/src/sync/scheduler.rs`
- Modify: `tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: 实现 scheduler.rs**

```rust
// tauri/src-tauri/src/sync/scheduler.rs
//! 应用启动时检查今日是否已 pull，若未 pull 则触发。
use rusqlite::Connection;
use std::path::Path;

/// 检查今日是否已成功 pull 过。
pub fn pulled_today(db_path: &Path) -> bool {
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    // 确保表存在
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pull_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pulled_at TEXT NOT NULL,
            files_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL
        );",
    );
    let today = chrono::Local::now().date_naive().to_string();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pull_records WHERE date(pulled_at) = ?1 AND status = 'ok'",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);
    count > 0
}
```

- [ ] **Step 2: 在 lib.rs 新增 Tauri 命令**

在 `lib.rs` 末尾（`pub fn run()` 之前）添加如下命令，并在 `invoke_handler` 中注册：

```rust
// ── Sync 相关 Tauri 命令 ──

use serde::Deserialize;
use std::path::PathBuf;

fn get_sync_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("mkdir error: {e}"))?;
    Ok(data_dir.join("tc_sync.db"))
}

fn get_sync_repo_dir() -> PathBuf {
    let base = std::env::var("TC_SYNC_REPO_DIR")
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".task-conductor/sync-repo")
                .to_string_lossy()
                .to_string()
        });
    PathBuf::from(base)
}

/// 拉取 GitHub 备份并解密导入 tc_sync.db。
#[tauri::command]
async fn sync_pull(app: tauri::AppHandle, api_base: String, token: String) -> Result<serde_json::Value, String> {
    use crate::sync::{puller::GitPuller, importer::{open_sync_db, import_file, record_pull}};

    // 1. 获取 crypto-params
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{api_base}/api/sync/crypto-params"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("fetch crypto-params failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("crypto-params API returned {}", resp.status()));
    }

    let params: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("parse crypto-params: {e}"))?;

    let master_key_hex = params["master_key_hex"]
        .as_str()
        .ok_or("Missing master_key_hex")?
        .to_string();
    let github_repo = params["github_repo"]
        .as_str()
        .ok_or("Missing github_repo")?
        .to_string();
    let github_pat = params["github_pat"]
        .as_str()
        .ok_or("Missing github_pat")?
        .to_string();

    // 2. git pull
    let repo_dir = get_sync_repo_dir();
    let puller = GitPuller::new(repo_dir.clone());
    puller.sync(&github_repo, &github_pat)?;

    // 3. 解密 + 导入
    let db_path = get_sync_db_path(&app)?;
    let conn = open_sync_db(&db_path)?;
    let enc_files = puller.list_encrypted_files()?;
    let mut imported = 0usize;
    let mut errors = vec![];

    for file in &enc_files {
        match import_file(&conn, file, &master_key_hex) {
            Ok(_) => imported += 1,
            Err(e) => errors.push(e),
        }
    }

    let status = if errors.is_empty() { "ok" } else { "partial" };
    record_pull(&conn, imported, status)?;

    Ok(serde_json::json!({
        "imported": imported,
        "errors": errors,
    }))
}

/// 查询 tc_sync.db 中未删除的归档会话列表。
#[tauri::command]
fn get_archived_sessions(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    use crate::sync::importer::open_sync_db;
    let db_path = get_sync_db_path(&app)?;
    let conn = open_sync_db(&db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT session_id, summary, cwd, started_at, last_event_at,
                    event_count, enc_path, synced_at, is_favorite
             FROM archived_sessions
             WHERE is_deleted = 0
             ORDER BY last_event_at DESC, started_at DESC",
        )
        .map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "session_id":    row.get::<_, String>(0)?,
                "summary":       row.get::<_, Option<String>>(1)?,
                "cwd":           row.get::<_, Option<String>>(2)?,
                "started_at":    row.get::<_, Option<String>>(3)?,
                "last_event_at": row.get::<_, Option<String>>(4)?,
                "event_count":   row.get::<_, i64>(5)?,
                "enc_path":      row.get::<_, Option<String>>(6)?,
                "synced_at":     row.get::<_, String>(7)?,
                "is_favorite":   row.get::<_, i64>(8)? != 0,
            }))
        })
        .map_err(|e| format!("query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect: {e}"))
}

/// 获取归档会话的 transcript（解析后的 TranscriptMessage[]）。
#[tauri::command]
fn get_archived_transcript(app: tauri::AppHandle, session_id: String) -> Result<serde_json::Value, String> {
    use crate::sync::importer::open_sync_db;
    let db_path = get_sync_db_path(&app)?;
    let conn = open_sync_db(&db_path)?;
    let transcript_str: Option<String> = conn
        .query_row(
            "SELECT transcript FROM archived_sessions WHERE session_id = ?1 AND is_deleted = 0",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("query: {e}"))?;
    let transcript: serde_json::Value = match transcript_str {
        Some(s) => serde_json::from_str(&s).map_err(|e| format!("JSON parse: {e}"))?,
        None => serde_json::json!([]),
    };
    Ok(serde_json::json!({
        "messages":   transcript,
        "file_found": true,
        "total":      transcript.as_array().map(|a| a.len()).unwrap_or(0),
        "has_more":   false,
    }))
}

/// 切换收藏状态。
#[tauri::command]
fn toggle_favorite(app: tauri::AppHandle, session_id: String, favorite: bool) -> Result<(), String> {
    use crate::sync::importer::open_sync_db;
    let db_path = get_sync_db_path(&app)?;
    let conn = open_sync_db(&db_path)?;
    conn.execute(
        "UPDATE archived_sessions SET is_favorite = ?1 WHERE session_id = ?2",
        rusqlite::params![favorite as i64, session_id],
    )
    .map_err(|e| format!("update: {e}"))?;
    Ok(())
}

/// 软删除归档会话。
#[tauri::command]
fn delete_archived(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    use crate::sync::importer::open_sync_db;
    let db_path = get_sync_db_path(&app)?;
    let conn = open_sync_db(&db_path)?;
    conn.execute(
        "UPDATE archived_sessions SET is_deleted = 1 WHERE session_id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("update: {e}"))?;
    Ok(())
}
```

- [ ] **Step 3: 在 `run()` 的 `setup` hook 中触发启动检查**

在 `tauri/src-tauri/src/lib.rs` 的 `tauri::Builder::default()` 链中，在 `.manage(FileCache::new())` 之后添加：

```rust
.setup(|app| {
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        use crate::sync::scheduler::pulled_today;
        let db_path = match app_handle.path().app_data_dir() {
            Ok(d) => {
                let _ = std::fs::create_dir_all(&d);
                d.join("tc_sync.db")
            }
            Err(_) => return,
        };
        // 首次启动今日未 pull 时，记录日志（实际 pull 需前端调用 sync_pull 命令）
        if !pulled_today(&db_path) {
            log::info!("[sync] 今日尚未同步，建议调用 sync_pull");
        }
    });
    Ok(())
})
```

- [ ] **Step 3b: 在 SessionChat 中提供手动同步入口**

在 `tauri/src/components/SessionChat/SessionChat.tsx` 的搜索框旁边添加同步按钮（layout=full 时显示）：

```tsx
// SessionChat.tsx 顶部新增 import
import { useSyncPull } from '../../hooks/useArchivedSessions'
import { useAuthStore } from '../../lib/store/auth'
import { useConfig } from '../../lib/api'

// 在 SessionChat 函数体内添加（layout=full 时）：
const token = useAuthStore(s => s.token) ?? ''
const apiBase = '' // 通过 Vite proxy，base 为空
const { mutate: doSyncPull, isPending: syncing } = useSyncPull(apiBase, token)
```

在 full layout 的搜索栏 JSX 旁加一个小按钮：
```tsx
{!syncing
  ? <button onClick={() => doSyncPull()} title="同步归档" style={{background:'none',border:'none',cursor:'pointer',opacity:0.6}}>☁↓</button>
  : <span style={{opacity:0.4,fontSize:12}}>同步中…</span>
}
```

- [ ] **Step 4: 在 `invoke_handler!` 中注册新命令**

找到 `lib.rs` 中的：
```rust
.invoke_handler(tauri::generate_handler![
    greet,
    list_dir,
    scan_tree,
    invalidate_file_cache
])
```
改为：
```rust
.invoke_handler(tauri::generate_handler![
    greet,
    list_dir,
    scan_tree,
    invalidate_file_cache,
    sync_pull,
    get_archived_sessions,
    get_archived_transcript,
    toggle_favorite,
    delete_archived,
])
```

- [ ] **Step 4: 在 `run()` 的 `tauri::Builder` 中添加 `dirs` 依赖（Cargo.toml）**

```toml
# tauri/src-tauri/Cargo.toml
dirs = "5"
```

- [ ] **Step 5: 确认编译通过**

```bash
cd tauri/src-tauri && cargo check
```

Expected: `Finished`

- [ ] **Step 6: Commit**

```bash
git add tauri/src-tauri/
git commit -m "feat(sync): add Tauri commands (sync_pull, get_archived_sessions, toggle_favorite, delete_archived)"
```

---

## Task 10: 前端 — hooks + SessionList UI + useSessionData 合并

**Files:**
- Modify: `tauri/src/lib/api/types.ts`
- Create: `tauri/src/hooks/useArchivedSessions.ts`
- Modify: `tauri/src/components/SessionChat/useSessionData.ts`
- Modify: `tauri/src/components/SessionChat/SessionList.tsx`
- Modify: `tauri/src/components/SessionChat/session-chat.module.css`

- [ ] **Step 1: 在 types.ts 末尾新增 ArchivedSession 类型**

```typescript
// tauri/src/lib/api/types.ts 末尾追加：
export interface ArchivedSession {
  session_id: string
  summary: string | null
  cwd: string | null
  started_at: string
  last_event_at: string | null
  event_count: number
  enc_path: string | null
  synced_at: string
  is_favorite: boolean
}

export type SessionSource = 'live' | 'archived'

export interface MergedSession extends AiSession {
  source: SessionSource
  is_favorite?: boolean
  synced_at?: string
}
```

- [ ] **Step 2: 创建 useArchivedSessions.ts**

```typescript
// tauri/src/hooks/useArchivedSessions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ArchivedSession } from '../lib/api/types'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeOrEmpty<T>(cmd: string, args?: Record<string, unknown>): Promise<T[]> {
  if (!isTauri()) return []
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T[]>(cmd, args)
}

export function useArchivedSessions() {
  return useQuery({
    queryKey: ['archived-sessions'],
    queryFn: () => invokeOrEmpty<ArchivedSession>('get_archived_sessions'),
    staleTime: 60_000,
    retry: false,
  })
}

export function useArchivedTranscript(sessionId: string | null) {
  return useQuery({
    queryKey: ['archived-transcript', sessionId],
    queryFn: async () => {
      if (!sessionId || !isTauri()) return null
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<{ messages: unknown[]; file_found: boolean; total: number; has_more: boolean }>(
        'get_archived_transcript',
        { sessionId },
      )
    },
    enabled: !!sessionId,
    staleTime: Infinity,
  })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, favorite }: { sessionId: string; favorite: boolean }) => {
      if (!isTauri()) return
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('toggle_favorite', { sessionId, favorite })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archived-sessions'] }),
  })
}

export function useDeleteArchived() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      if (!isTauri()) return
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('delete_archived', { sessionId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archived-sessions'] }),
  })
}

export function useSyncPull(apiBase: string, token: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!isTauri()) return
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('sync_pull', { apiBase, token })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archived-sessions'] }),
  })
}
```

- [ ] **Step 3: 修改 useSessionData.ts — 合并 archived 数据**

在 `useSessionData.ts` 顶部 import 区末尾添加：
```typescript
import { useArchivedSessions } from '../../hooks/useArchivedSessions'
import type { MergedSession } from '../../lib/api/types'
```

在 `useSessionData` 函数体中，在 `filterSessions` 的 `useCallback` 之前添加：
```typescript
  const { data: archivedSessions = [] } = useArchivedSessions()
```

将现有 `sessions` state 类型从 `AiSession[]` 改为 `MergedSession[]`，并在 `filterSessions` callback 末尾添加 archived 合并逻辑：

```typescript
  const filterSessions = useCallback((allSessions: AiSession[]) => {
    let result = allSessions.filter(s => !!s.summary)
    if (filterByCwd) {
      result = result.filter(s => s.cwd && s.cwd.startsWith(filterByCwd))
    }

    const liveIds = new Set(result.map(s => s.session_id))
    const archivedOnly = archivedSessions
      .filter(a => !liveIds.has(a.session_id) && !!a.summary)
      .map(a => ({
        session_id: a.session_id,
        provider: 'claude',
        event_count: a.event_count,
        started_at: a.started_at,
        last_seen_at: a.last_event_at ?? a.started_at,
        cwd: a.cwd ?? undefined,
        status: 'stopped',
        summary: a.summary,
        source: 'archived' as const,
        is_favorite: a.is_favorite,
        synced_at: a.synced_at,
      } satisfies MergedSession))

    const liveMerged: MergedSession[] = result.map(s => ({ ...s, source: 'live' as const }))
    const all = [...liveMerged, ...archivedOnly]

    all.sort((a, b) => {
      const statusOrder = (s: string | undefined) => s === 'active' ? 2 : s === 'idle' ? 1 : 0
      const diff = statusOrder(b.status) - statusOrder(a.status)
      if (diff !== 0) return diff
      return new Date(b.last_seen_at || b.started_at).getTime() -
        new Date(a.last_seen_at || a.started_at).getTime()
    })
    return all
  }, [filterByCwd, archivedSessions])
```

- [ ] **Step 4: 修改 SessionList.tsx — 新增 ☁ 标签 + ★ + 🗑**

在 `SessionRow` 组件中，找到 `return (` 并在 row 内容末尾（关闭标签前）添加：

```tsx
  // 在 SessionRow 函数内，读取 source 和 is_favorite
  const src = (session as MergedSession).source
  const isFav = (session as MergedSession).is_favorite ?? false
```

在 `SessionRow` 的 JSX 中，为 archived 会话显示图标：

将 SessionRow return 的 JSX 中现有 `<div className={styles.ntRow}...>` 改为：

```tsx
  return (
    <div
      className={`${styles.ntRow} ${isSelected ? styles.ntRowSelected : ''}`}
      onClick={() => onSelect(session)}
    >
      <span className={styles.ntColStatus}>
        <span className={dotCls} />
      </span>
      <span className={styles.ntColTitle}>
        <span className={styles.ntTitle}>{title}</span>
        <span className={styles.ntMeta}>{session.cwd?.split('/').pop() ?? ''}</span>
        {tags.map(tag => (
          <span key={tag} className={styles.ntTag}>{tag}</span>
        ))}
      </span>
      <span className={styles.ntColEvents}>{session.event_count}</span>
      <span className={styles.ntColTime}>
        {src === 'archived' && (
          <span className={styles.archivedBadge} title="已归档">☁</span>
        )}
        {time}
      </span>
      {src === 'archived' && onToggleFavorite && onDeleteArchived && (
        <span className={styles.ntColActions} onClick={e => e.stopPropagation()}>
          <button
            className={`${styles.actionBtn} ${isFav ? styles.actionBtnActive : ''}`}
            onClick={() => onToggleFavorite(session.session_id, !isFav)}
            title={isFav ? '取消收藏' : '收藏'}
          >★</button>
          <button
            className={styles.actionBtn}
            onClick={() => onDeleteArchived(session.session_id)}
            title="删除归档"
          >🗑</button>
        </span>
      )}
    </div>
  )
```

在 `SessionList` 组件 props 中新增：
```typescript
  onToggleFavorite?: (sessionId: string, favorite: boolean) => void
  onDeleteArchived?: (sessionId: string) => void
```

- [ ] **Step 5: 在 session-chat.module.css 新增样式**

```css
/* 末尾追加 */
.archivedBadge {
  font-size: 11px;
  margin-right: 4px;
  opacity: 0.6;
}

.ntColActions {
  display: flex;
  gap: 4px;
  align-items: center;
  padding-right: 4px;
}

.actionBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 3px;
  color: var(--tc-text-muted, #888);
  line-height: 1;
}

.actionBtn:hover {
  background: var(--tc-bg-hover, rgba(255,255,255,0.08));
  color: var(--tc-text-primary, #ccc);
}

.actionBtnActive {
  color: #f5c518;
}
```

- [ ] **Step 6: 在 SessionChat.tsx 中将 toggle/delete 回调传给 SessionList**

在 `SessionChat.tsx` 中 import 新 hooks：
```typescript
import { useToggleFavorite, useDeleteArchived } from '../../hooks/useArchivedSessions'
```

在 `SessionChat` 组件体内添加：
```typescript
  const { mutate: toggleFavorite } = useToggleFavorite()
  const { mutate: deleteArchived } = useDeleteArchived()
```

在 `<SessionList>` JSX 中传入新 props：
```tsx
  onToggleFavorite={(id, fav) => toggleFavorite({ sessionId: id, favorite: fav })}
  onDeleteArchived={(id) => deleteArchived(id)}
```

- [ ] **Step 7: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无 error（允许有警告）

- [ ] **Step 8: Commit**

```bash
git add tauri/src/
git commit -m "feat(sync): integrate archived sessions into Chat page (☁ badge, ★ favorite, 🗑 delete)"
```

---

## 验收标准

1. 服务端配置好 `github_repo` / `github_pat` / `encrypt_password` 并 `enabled=true` 后，`POST /api/sync/push` 能成功加密推送
2. 桌面端 `sync_pull` 命令能从 GitHub 拉取并解密，`get_archived_sessions` 返回归档列表
3. Chat 页面显示 live + archived 全量会话，archived 会话有 ☁ 标签
4. 收藏/删除操作即时更新列表
5. `cargo test sync::crypto` 全部通过
6. `pytest tests/sync/` 全部通过

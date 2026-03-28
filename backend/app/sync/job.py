"""
每日备份 Job。

由 APScheduler 以 cron 触发（hour=0, minute=0），
也可通过 POST /api/sync/push 手动触发。
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from ..database import engine
from ..models import ClaudeSession, BackupRecord
from .config import load_sync_config
from .crypto import derive_master_key, derive_file_key, encrypt_bytes
from .exporter import export_session_jsonl
from .git_ops import ensure_repo, commit_and_push
from .manifest import load_manifest, save_manifest

logger = logging.getLogger(__name__)

# 本地 clone 放在系统临时目录
import tempfile
_WORK_DIR = Path(tempfile.gettempdir()) / "tc_sync_repos"


def _query_sessions(db: Session) -> list[ClaudeSession]:
    """查询所有 ClaudeSession，按 started_at 升序。"""
    return db.query(ClaudeSession).order_by(ClaudeSession.started_at).all()


def _load_session_transcript(db: Session, session: ClaudeSession) -> list[dict]:
    """加载会话的 transcript（优先从 jsonl 文件，其次从 DB events）。"""
    from ..routers.sessions import _load_transcript_from_jsonl, _load_transcript_from_db
    transcript = _load_transcript_from_jsonl(session.session_id, session.cwd or "")
    if transcript is not None:
        return [msg.dict() if hasattr(msg, "dict") else msg for msg in transcript]
    transcript = _load_transcript_from_db(session.session_id, db)
    if transcript is not None:
        return [msg.dict() if hasattr(msg, "dict") else msg for msg in transcript]
    return []


def _upsert_backup_record(
    db: Session,
    session_id: str,
    enc_path: str,
    content_hash: str,
    file_size: int,
) -> None:
    """插入或更新 BackupRecord。"""
    record = db.query(BackupRecord).filter(BackupRecord.session_id == session_id).first()
    if record is None:
        record = BackupRecord(session_id=session_id)
        db.add(record)
    record.enc_path = enc_path
    record.content_hash = content_hash
    record.backed_up_at = datetime.now(timezone.utc)
    record.file_size = file_size
    db.commit()


def _update_last_push_at(db: Session) -> None:
    """更新 SyncConfig.last_push_at。"""
    from ..models import SyncConfig
    cfg = db.get(SyncConfig, 1)
    if cfg:
        cfg.last_push_at = datetime.now(timezone.utc)
        db.commit()


def run_sync_job() -> None:
    """
    执行一次完整的备份流程：
    1. 检查配置
    2. 派生 master_key
    3. ensure_repo / load_manifest
    4. 逐个会话检查并备份
    5. save_manifest / commit_and_push
    """
    cfg = load_sync_config()
    if cfg is None or not cfg.enabled:
        logger.info("sync: disabled or not configured, skipping")
        return

    logger.info("sync: starting backup job")
    _WORK_DIR.mkdir(parents=True, exist_ok=True)

    master_key = derive_master_key(
        cfg.encrypt_password,
        cfg.salt,
        cfg.argon2_time_cost,
        cfg.argon2_memory_kb,
        cfg.argon2_parallelism,
    )

    repo_path = ensure_repo(cfg.github_repo, cfg.github_pat, _WORK_DIR)

    # 加密文件目录
    encrypted_dir = repo_path / "encrypted"
    encrypted_dir.mkdir(exist_ok=True)

    manifest = load_manifest(repo_path, master_key)
    manifest_index: dict[str, dict] = {e["session_id"]: e for e in manifest}

    with Session(engine) as db:
        sessions = _query_sessions(db)
        updated = False

        for session in sessions:
            transcript = _load_session_transcript(db, session)
            jsonl_bytes = export_session_jsonl(session, transcript)
            content_hash = hashlib.sha256(jsonl_bytes).hexdigest()

            existing = manifest_index.get(session.session_id)
            if existing and existing.get("content_hash") == content_hash:
                continue  # 未变化，跳过

            # 加密并写入文件
            enc_rel_path = f"encrypted/{session.session_id}.jsonl.enc"
            file_key = derive_file_key(master_key, enc_rel_path)
            ciphertext = encrypt_bytes(file_key, jsonl_bytes)
            (repo_path / enc_rel_path).write_bytes(ciphertext)

            # 更新 manifest
            entry = {
                "session_id": session.session_id,
                "enc_path": enc_rel_path,
                "content_hash": content_hash,
                "backed_up_at": datetime.now(timezone.utc).isoformat(),
            }
            manifest_index[session.session_id] = entry

            _upsert_backup_record(db, session.session_id, enc_rel_path, content_hash, len(ciphertext))
            updated = True
            logger.info("sync: backed up session %s", session.session_id)

        save_manifest(repo_path, master_key, list(manifest_index.values()))
        commit_and_push(repo_path, f"chore: daily backup {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
        _update_last_push_at(db)

    logger.info("sync: backup job complete, %d sessions processed", len(sessions))

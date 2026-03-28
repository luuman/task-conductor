"""Tests for backend/app/sync/job.py"""
import pytest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch, call

from app.sync.job import run_sync_job


def _make_config(**kwargs):
    defaults = dict(
        enabled=True,
        github_repo="owner/backup-repo",
        github_pat="ghp_token123",
        encrypt_password="secret",
        salt="a" * 64,
        argon2_time_cost=1,
        argon2_memory_kb=8192,
        argon2_parallelism=1,
    )
    defaults.update(kwargs)
    return MagicMock(**defaults)


def test_run_sync_job_skips_when_disabled():
    """enabled=False 时跳过备份。"""
    cfg = _make_config(enabled=False)
    with patch("app.sync.job.load_sync_config", return_value=cfg):
        with patch("app.sync.job.derive_master_key") as mock_key:
            run_sync_job()
    mock_key.assert_not_called()


def test_run_sync_job_skips_when_no_config():
    """未配置时（load_sync_config 返回 None）跳过备份。"""
    with patch("app.sync.job.load_sync_config", return_value=None):
        with patch("app.sync.job.derive_master_key") as mock_key:
            run_sync_job()
    mock_key.assert_not_called()


def test_run_sync_job_calls_git_push(tmp_path):
    """配置正常时调用 commit_and_push。"""
    cfg = _make_config()
    mock_session = MagicMock(
        session_id="s1",
        summary="test",
        cwd="/tmp",
        started_at=datetime(2026, 1, 1),
        last_event_at=datetime(2026, 1, 1),
        event_count=2,
        transcript_path=None,
    )

    with patch("app.sync.job.load_sync_config", return_value=cfg), \
         patch("app.sync.job.derive_master_key", return_value=b"\x00" * 32), \
         patch("app.sync.job.ensure_repo", return_value=tmp_path), \
         patch("app.sync.job.load_manifest", return_value=[]), \
         patch("app.sync.job._query_sessions", return_value=[mock_session]), \
         patch("app.sync.job._load_session_transcript", return_value=[]), \
         patch("app.sync.job.save_manifest"), \
         patch("app.sync.job.commit_and_push") as mock_push, \
         patch("app.sync.job._upsert_backup_record"), \
         patch("app.sync.job._update_last_push_at"):
        run_sync_job()

    mock_push.assert_called_once()


def test_run_sync_job_skips_unchanged_sessions(tmp_path):
    """content_hash 未变化的会话不重复备份。"""
    cfg = _make_config()
    import hashlib
    from app.sync.exporter import export_session_jsonl

    mock_session = MagicMock(
        session_id="s1",
        summary="test",
        cwd="/tmp",
        started_at=datetime(2026, 1, 1),
        last_event_at=datetime(2026, 1, 1),
        event_count=0,
        transcript_path=None,
    )

    # 预先计算 content_hash（空 transcript 的 jsonl hash）
    jsonl_bytes = export_session_jsonl(mock_session, transcript=[])
    content_hash = hashlib.sha256(jsonl_bytes).hexdigest()

    existing_manifest = [{"session_id": "s1", "content_hash": content_hash, "enc_path": "encrypted/s1.jsonl.enc"}]

    with patch("app.sync.job.load_sync_config", return_value=cfg), \
         patch("app.sync.job.derive_master_key", return_value=b"\x00" * 32), \
         patch("app.sync.job.ensure_repo", return_value=tmp_path), \
         patch("app.sync.job.load_manifest", return_value=existing_manifest), \
         patch("app.sync.job._query_sessions", return_value=[mock_session]), \
         patch("app.sync.job._load_session_transcript", return_value=[]), \
         patch("app.sync.job.save_manifest"), \
         patch("app.sync.job.commit_and_push"), \
         patch("app.sync.job._upsert_backup_record") as mock_upsert, \
         patch("app.sync.job._update_last_push_at"):
        run_sync_job()

    # hash 未变化，不应 upsert backup record
    mock_upsert.assert_not_called()

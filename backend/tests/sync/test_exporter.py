"""Tests for backend/app/sync/exporter.py"""
import json
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch

from app.sync.exporter import export_session_jsonl, SessionMeta


def _make_session(**kwargs):
    """创建 mock ClaudeSession 对象。"""
    defaults = dict(
        session_id="sess-abc",
        summary="Test session",
        cwd="/home/user/project",
        started_at=datetime(2026, 1, 1, 12, 0, 0),
        last_event_at=datetime(2026, 1, 1, 12, 30, 0),
        event_count=5,
        transcript_path=None,
    )
    defaults.update(kwargs)
    return MagicMock(**defaults)


def test_export_session_meta_fields():
    """导出的第一行包含 session 元数据。"""
    session = _make_session()
    result = export_session_jsonl(session, transcript=[])
    lines = result.decode().strip().splitlines()
    assert len(lines) >= 1
    meta = json.loads(lines[0])
    assert meta["type"] == "session_meta"
    assert meta["session_id"] == "sess-abc"
    assert meta["summary"] == "Test session"
    assert meta["cwd"] == "/home/user/project"
    assert "started_at" in meta
    assert "last_event_at" in meta
    assert meta["event_count"] == 5


def test_export_with_transcript():
    """transcript 内容正确序列化为后续行。"""
    session = _make_session()
    transcript = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there"},
    ]
    result = export_session_jsonl(session, transcript=transcript)
    lines = result.decode().strip().splitlines()
    # 第一行 meta，后续是 transcript 行
    assert len(lines) == 3
    msg1 = json.loads(lines[1])
    assert msg1["role"] == "user"
    assert msg1["content"] == "Hello"


def test_export_empty_transcript():
    """空 transcript 只输出一行 meta。"""
    session = _make_session()
    result = export_session_jsonl(session, transcript=[])
    lines = result.decode().strip().splitlines()
    assert len(lines) == 1


def test_session_meta_dataclass():
    """SessionMeta 可正确序列化为字典。"""
    meta = SessionMeta(
        type="session_meta",
        session_id="s1",
        summary="sum",
        cwd="/tmp",
        started_at="2026-01-01T00:00:00",
        last_event_at="2026-01-01T01:00:00",
        event_count=3,
    )
    d = meta.__dict__
    assert d["type"] == "session_meta"
    assert d["session_id"] == "s1"

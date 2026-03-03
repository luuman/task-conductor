from fastapi.testclient import TestClient
from app.main import app
from app.database import engine
from app.models import Base, ClaudeSession
from sqlalchemy.orm import Session as DBSession
from datetime import datetime

client = TestClient(app)


def _create_session(session_id: str = "test-session-abc") -> int:
    """在 DB 中直接插入一条测试 ClaudeSession，返回其 id"""
    with DBSession(engine) as db:
        # 避免重复插入（测试可能多次运行）
        existing = db.query(ClaudeSession).filter_by(session_id=session_id).first()
        if existing:
            return existing.id
        s = ClaudeSession(
            session_id=session_id,
            cwd="/tmp/test",
            status="stopped",
            started_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow(),
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        return s.id


def test_get_note_not_found_returns_empty():
    _create_session("note-test-1")
    resp = client.get("/api/sessions/note-test-1/note")
    assert resp.status_code == 200
    data = resp.json()
    assert data["alias"] is None
    assert data["notes"] is None
    assert data["tags"] == []
    assert data["linked_task_id"] is None


def test_put_note_creates_and_returns():
    _create_session("note-test-2")
    resp = client.put("/api/sessions/note-test-2/note", json={
        "alias": "我的测试会话",
        "tags": ["bug", "重要"],
        "notes": "这是一条备注",
        "linked_task_id": None,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["alias"] == "我的测试会话"
    assert data["tags"] == ["bug", "重要"]
    assert data["notes"] == "这是一条备注"


def test_put_note_updates_existing():
    _create_session("note-test-3")
    client.put("/api/sessions/note-test-3/note", json={"alias": "旧名字"})
    resp = client.put("/api/sessions/note-test-3/note", json={"alias": "新名字"})
    assert resp.status_code == 200
    assert resp.json()["alias"] == "新名字"


def test_sessions_list_includes_note_field():
    _create_session("note-test-4")
    client.put("/api/sessions/note-test-4/note", json={"alias": "列表中的别名"})
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    target = next((s for s in sessions if s["session_id"] == "note-test-4"), None)
    assert target is not None
    assert target["note"]["alias"] == "列表中的别名"

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _create_project(name="test-settings"):
    resp = client.post("/api/projects", json={"name": name, "repo_url": ""})
    return resp.json()["id"]


def test_patch_settings_automation():
    pid = _create_project("patch-test")
    import json
    config = json.dumps({"enabled": True, "weekdays": [1, 2, 3, 4, 5], "max_concurrent": 2,
                         "time_from": "09:00", "time_to": "22:00"})
    resp = client.patch(f"/api/projects/{pid}/settings",
                        json={"automation_config": config})
    assert resp.status_code == 200
    assert resp.json()["automation_config"] == config


def test_patch_settings_runtime():
    pid = _create_project("runtime-test")
    import json
    config = json.dumps({"timeout_seconds": 240, "max_retries": 2,
                         "model": "claude-sonnet-4-6", "region": "cn"})
    resp = client.patch(f"/api/projects/{pid}/settings",
                        json={"claude_runtime_config": config})
    assert resp.status_code == 200
    data = resp.json()
    assert data["claude_runtime_config"] == config


def test_patch_settings_404():
    resp = client.patch("/api/projects/99999/settings", json={"docs_config": "{}"})
    assert resp.status_code == 404


def test_claude_config_no_path():
    """无 repo_url 的项目应返回 404"""
    pid = _create_project("no-path-test")
    # 强制清空 repo_url
    from sqlalchemy.orm import Session as DbSession
    from app.database import engine as db_engine
    from app.models import Project as ProjectModel
    with DbSession(db_engine) as db:
        p = db.get(ProjectModel, pid)
        p.repo_url = None
        db.commit()
    resp = client.get(f"/api/projects/{pid}/claude-config")
    assert resp.status_code == 404


def test_hooks_status_returns_9_events():
    """hooks-status 必须包含 9 种事件"""
    pid = _create_project("hooks-test")
    resp = client.get(f"/api/projects/{pid}/hooks-status")
    assert resp.status_code == 200
    hooks = resp.json()["hooks"]
    assert len(hooks) == 9
    for h in hooks:
        assert "event" in h
        assert "global" in h
        assert "project" in h


def test_memory_returns_categories():
    """memory 端点应返回 4 个分类键"""
    pid = _create_project("memory-test")
    resp = client.get(f"/api/projects/{pid}/memory")
    assert resp.status_code == 200
    data = resp.json()
    for key in ["user", "feedback", "project", "reference"]:
        assert key in data
        assert isinstance(data[key], list)


def test_mcp_servers_no_file():
    pid = _create_project("mcp-test")
    resp = client.get(f"/api/projects/{pid}/mcp-servers")
    assert resp.status_code == 200
    assert resp.json() == {"servers": []}


def test_permissions_empty():
    pid = _create_project("perm-test")
    resp = client.get(f"/api/projects/{pid}/permissions")
    assert resp.status_code == 200
    assert resp.json() == {"allow": [], "deny": []}


def test_settings_local_not_exists():
    pid = _create_project("local-test")
    resp = client.get(f"/api/projects/{pid}/settings-local")
    assert resp.status_code == 200
    assert resp.json()["exists"] == False


def test_hooks_toggle():
    """hooks-toggle 应能正确启用/禁用 hook，且读回状态一致"""
    pid = _create_project("toggle-test")
    # 启用项目级 PreToolUse hook
    resp = client.post(f"/api/projects/{pid}/hooks-toggle",
                       json={"event": "PreToolUse", "scope": "project", "enabled": True})
    assert resp.status_code == 200
    assert resp.json()["ok"] == True

    # 读回 hooks-status，PreToolUse 项目级应为 enabled
    resp2 = client.get(f"/api/projects/{pid}/hooks-status")
    assert resp2.status_code == 200
    hooks = {h["event"]: h for h in resp2.json()["hooks"]}
    assert hooks["PreToolUse"]["project"]["enabled"] == True

    # 禁用
    resp3 = client.post(f"/api/projects/{pid}/hooks-toggle",
                        json={"event": "PreToolUse", "scope": "project", "enabled": False})
    assert resp3.status_code == 200

    # 无效 event 应返回 400
    resp4 = client.post(f"/api/projects/{pid}/hooks-toggle",
                        json={"event": "InvalidEvent", "scope": "project", "enabled": True})
    assert resp4.status_code == 400

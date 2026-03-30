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

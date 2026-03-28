"""Tests for routers/sync.py"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.session import create_token

client = TestClient(app)


@pytest.fixture
def auth_headers():
    token = create_token({"sub": "agent"})
    return {"Authorization": f"Bearer {token}"}


def _make_config(**kwargs):
    defaults = dict(
        enabled=False,
        github_repo="owner/repo",
        github_pat="ghp_token",
        encrypt_password="secret",
        salt="a" * 64,
        argon2_time_cost=3,
        argon2_memory_kb=65536,
        argon2_parallelism=4,
        last_push_at=None,
    )
    defaults.update(kwargs)
    return MagicMock(**defaults)


def test_get_status_returns_fields(auth_headers):
    """GET /api/sync/status 返回正确字段。"""
    cfg = _make_config(enabled=True, github_repo="owner/repo", last_push_at=None)
    with patch("app.routers.sync.load_sync_config", return_value=cfg), \
         patch("app.routers.sync._count_backup_records", return_value=5):
        resp = client.get("/api/sync/status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "enabled" in data
    assert "total_backed_up" in data
    assert data["total_backed_up"] == 5


def test_get_status_requires_auth():
    """未提供 token 时返回 401。"""
    resp = client.get("/api/sync/status")
    assert resp.status_code == 401


def test_put_config_updates_fields(auth_headers):
    """PUT /api/sync/config 正确调用 update_sync_config。"""
    updated_cfg = _make_config(enabled=True, github_repo="owner/new-repo")
    with patch("app.routers.sync.update_sync_config", return_value=updated_cfg) as mock_update:
        resp = client.put(
            "/api/sync/config",
            json={"enabled": True, "github_repo": "owner/new-repo"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    mock_update.assert_called_once_with({"enabled": True, "github_repo": "owner/new-repo"})


def test_get_crypto_params_returns_master_key(auth_headers):
    """GET /api/sync/crypto-params 返回 master_key_hex。"""
    cfg = _make_config(
        enabled=True,
        github_repo="owner/repo",
        github_pat="ghp_token",
        encrypt_password="secret",
        salt="a" * 64,
        argon2_time_cost=1,
        argon2_memory_kb=8192,
        argon2_parallelism=1,
    )
    with patch("app.routers.sync.load_sync_config", return_value=cfg):
        resp = client.get("/api/sync/crypto-params", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "master_key_hex" in data
    assert len(data["master_key_hex"]) == 64  # 32 bytes hex = 64 chars
    assert data["github_repo"] == "owner/repo"
    assert data["github_pat"] == "ghp_token"


def test_post_push_triggers_job(auth_headers):
    """POST /api/sync/push 启动后台任务。"""
    with patch("app.routers.sync.run_sync_job") as mock_job:
        resp = client.post("/api/sync/push", headers=auth_headers)
    assert resp.status_code == 200
    # 后台任务异步执行，run_sync_job 会被调用（TestClient 同步执行 BackgroundTasks）
    mock_job.assert_called_once()

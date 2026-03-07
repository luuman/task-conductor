# /api/metrics 端点测试
# 用 TestClient 测试 metrics 相关的三个 HTTP 端点

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


# ── GET /api/metrics ─────────────────────────────────────────────

def test_metrics_returns_200():
    resp = client.get("/api/metrics")
    assert resp.status_code == 200


def test_metrics_has_required_keys():
    data = client.get("/api/metrics").json()
    for key in ("tasks", "claude", "kpi", "gauge", "weekly"):
        assert key in data, f"缺少字段: {key}"


def test_metrics_tasks_structure():
    data = client.get("/api/metrics").json()
    tasks = data["tasks"]
    assert "total" in tasks
    assert "by_status" in tasks
    assert isinstance(tasks["total"], int)


def test_metrics_weekly_is_7_days():
    data = client.get("/api/metrics").json()
    assert len(data["weekly"]) == 7


# ── GET /api/metrics/system ──────────────────────────────────────

def test_system_metrics_returns_200():
    resp = client.get("/api/metrics/system")
    assert resp.status_code == 200


def test_system_metrics_has_cpu_memory_disk():
    data = client.get("/api/metrics/system").json()
    for key in ("cpu", "memory", "disk_space"):
        assert key in data, f"缺少字段: {key}"


def test_system_metrics_cpu_has_percent():
    data = client.get("/api/metrics/system").json()
    assert "percent" in data["cpu"]
    assert isinstance(data["cpu"]["percent"], (int, float))


def test_system_metrics_memory_has_total():
    data = client.get("/api/metrics/system").json()
    assert "total_gb" in data["memory"]


# ── GET /api/metrics/processes ───────────────────────────────────

def test_processes_returns_200():
    resp = client.get("/api/metrics/processes")
    assert resp.status_code == 200


def test_processes_has_by_cpu_and_by_mem():
    data = client.get("/api/metrics/processes").json()
    assert "by_cpu" in data
    assert "by_mem" in data
    assert isinstance(data["by_cpu"], list)
    assert isinstance(data["by_mem"], list)

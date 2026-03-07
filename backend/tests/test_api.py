from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200

def test_create_project():
    resp = client.post("/api/projects", json={"name": "my-app", "repo_url": ""})
    assert resp.status_code == 200
    assert resp.json()["name"] == "my-app"

def test_list_projects():
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_create_task():
    proj = client.post("/api/projects", json={"name": "proj2", "repo_url": ""}).json()
    resp = client.post(f"/api/projects/{proj['id']}/tasks",
                       json={"title": "实现登录", "description": "用 JWT"})
    assert resp.status_code == 200
    assert resp.json()["stage"] == "input"
    assert resp.json()["status"] == "pending"

def test_get_task():
    proj = client.post("/api/projects", json={"name": "proj3", "repo_url": ""}).json()
    task = client.post(f"/api/projects/{proj['id']}/tasks",
                       json={"title": "t", "description": "d"}).json()
    resp = client.get(f"/api/tasks/{task['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == task["id"]

def test_get_task_artifacts():
    proj = client.post("/api/projects", json={"name": "proj4", "repo_url": ""}).json()
    task = client.post(f"/api/projects/{proj['id']}/tasks",
                       json={"title": "t2", "description": "d2"}).json()
    resp = client.get(f"/api/tasks/{task['id']}/artifacts")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_approve_and_advance_task():
    proj = client.post("/api/projects", json={"name": "pipeline-test", "repo_url": ""}).json()
    task = client.post(f"/api/projects/{proj['id']}/tasks",
                       json={"title": "流水线测试", "description": "测试审批推进"}).json()
    # 先设置状态为 approved（模拟 analysis 阶段完成）
    # 修改 stage 为 analysis，status 为 waiting_review
    # 然后审批，再推进
    # 这里直接测试 approve endpoint
    approved = client.post(f"/api/tasks/{task['id']}/approve",
                           json={"action": "approve"}).json()
    assert approved["status"] == "approved"

def test_reject_task():
    proj = client.post("/api/projects", json={"name": "reject-test", "repo_url": ""}).json()
    task = client.post(f"/api/projects/{proj['id']}/tasks",
                       json={"title": "驳回测试", "description": "测试驳回"}).json()
    rejected = client.post(f"/api/tasks/{task['id']}/approve",
                           json={"action": "reject", "reason": "方向不对"}).json()
    assert rejected["status"] == "rejected"

def test_run_analysis_returns_started():
    proj = client.post("/api/projects", json={"name": "analysis-test", "repo_url": ""}).json()
    task = client.post(f"/api/projects/{proj['id']}/tasks",
                       json={"title": "实现 OAuth2 登录", "description": "支持 Google 登录"}).json()
    resp = client.post(f"/api/pipeline/{task['id']}/run-analysis")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("started", "queued")

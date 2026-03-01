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

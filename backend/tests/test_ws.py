from app.ws.manager import ConnectionManager

def test_manager_init():
    mgr = ConnectionManager()
    assert isinstance(mgr.active_connections, dict)
    assert len(mgr.active_connections) == 0

def test_build_message():
    mgr = ConnectionManager()
    msg = mgr.build_message("task_update", {"task_id": 1, "stage": "dev"})
    assert msg["type"] == "task_update"
    assert msg["data"]["task_id"] == 1
    assert "ts" in msg

def test_build_message_type_log():
    mgr = ConnectionManager()
    msg = mgr.build_message("log", {"content": "hello"})
    assert msg["type"] == "log"
    assert msg["data"]["content"] == "hello"

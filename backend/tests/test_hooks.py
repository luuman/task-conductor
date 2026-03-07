# backend/tests/test_hooks.py
from app.hooks import parse_hook_event

def test_parse_pre_tool_use():
    payload = {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": "ls -la"},
        "session_id": "abc123"
    }
    event = parse_hook_event(payload)
    assert event["type"] == "PreToolUse"
    assert event["tool_name"] == "Bash"
    assert event["session_id"] == "abc123"

def test_parse_stop_event():
    payload = {
        "hook_event_name": "Stop",
        "session_id": "abc123"
    }
    event = parse_hook_event(payload)
    assert event["type"] == "Stop"

def test_parse_unknown_event():
    event = parse_hook_event({"hook_event_name": "Unknown"})
    assert event["type"] == "Unknown"

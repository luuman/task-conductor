# backend/app/hooks.py
from typing import Any

def parse_hook_event(payload: dict) -> dict:
    """解析 Claude Code hook payload 为标准事件格式"""
    return {
        "type": payload.get("hook_event_name", "Unknown"),
        "tool": payload.get("tool_name"),
        "tool_input": payload.get("tool_input"),
        "session_id": payload.get("session_id"),
        "raw": payload,
    }

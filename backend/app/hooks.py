# backend/app/hooks.py
import json
from datetime import datetime


def parse_hook_event(payload: dict) -> dict:
    """将 Claude Code hook payload 解析为标准化事件字典"""
    event_type = payload.get("hook_event_name", "Unknown")

    tool_input  = payload.get("tool_input")
    tool_result = payload.get("tool_response") or payload.get("tool_result")

    extra: dict = {}
    if payload.get("message"):
        extra["message"] = payload["message"]
    if payload.get("prompt"):
        extra["prompt"] = payload["prompt"]
    if payload.get("source"):
        extra["source"] = payload["source"]
    if payload.get("stop_hook_active") is not None:
        extra["stop_hook_active"] = payload["stop_hook_active"]

    # Stop 事件：提取 token 用量和模型信息
    if event_type == "Stop":
        usage = payload.get("usage")
        if usage:
            extra["usage"] = usage
        model = payload.get("model") or payload.get("model_id")
        if model:
            extra["model"] = model

    return {
        "type": event_type,
        "session_id": payload.get("session_id"),
        "cwd": payload.get("cwd"),
        "tool_name": payload.get("tool_name"),
        "tool_input": tool_input,
        "tool_result": tool_result,
        "extra": extra if extra else None,
        "ts": datetime.utcnow().isoformat(),
    }


def serialize_json_field(value) -> str | None:
    """将 dict/list 转为 JSON string，用于存入 Text 列"""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)

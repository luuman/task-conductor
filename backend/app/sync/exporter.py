"""
会话 JSONL 导出模块。

导出格式：每行一个 JSON 对象
- 第一行：session_meta（会话元数据）
- 后续行：transcript 中的每条消息
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class SessionMeta:
    type: str
    session_id: str
    summary: str
    cwd: str
    started_at: str
    last_event_at: str
    event_count: int


def _dt_str(dt: datetime | None) -> str:
    """将 datetime 转为 ISO 格式字符串，None 返回空字符串。"""
    if dt is None:
        return ""
    return dt.isoformat()


def export_session_jsonl(session: Any, transcript: list[dict]) -> bytes:
    """
    将 ClaudeSession + transcript 序列化为 JSONL bytes。

    :param session: ClaudeSession ORM 对象（或有相同字段的 mock）
    :param transcript: TranscriptMessage 列表（dict），已解析好的会话内容
    :return: UTF-8 编码的 JSONL bytes
    """
    lines: list[str] = []

    meta = SessionMeta(
        type="session_meta",
        session_id=session.session_id,
        summary=session.summary or "",
        cwd=session.cwd or "",
        started_at=_dt_str(session.started_at),
        last_event_at=_dt_str(session.last_event_at),
        event_count=session.event_count or 0,
    )
    lines.append(json.dumps(meta.__dict__, ensure_ascii=False))

    for msg in transcript:
        lines.append(json.dumps(msg, ensure_ascii=False))

    return ("\n".join(lines) + "\n").encode("utf-8")

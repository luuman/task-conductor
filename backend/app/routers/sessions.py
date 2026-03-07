# backend/app/routers/sessions.py
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import engine
from ..models import ClaudeSession, ClaudeEvent, ConversationNote

router = APIRouter(prefix="/api/sessions", tags=["会话"])


def get_db():
    with Session(engine) as session:
        yield session


@router.get("", summary="Claude 会话列表")
def list_sessions(db: Session = Depends(get_db)):
    """
    获取最近 50 个 Claude Code 会话，按最后活跃时间倒序排列。

    每条记录包含：会话 ID、工作目录、状态（active/idle/stopped）、事件总数。
    """
    # 一次查询拿到事件数（避免 N+1）
    event_count_sq = (
        db.query(
            ClaudeEvent.claude_session_id,
            func.count(ClaudeEvent.id).label("event_count"),
        )
        .group_by(ClaudeEvent.claude_session_id)
        .subquery()
    )

    rows = (
        db.query(ClaudeSession, event_count_sq.c.event_count, ConversationNote)
        .outerjoin(event_count_sq, ClaudeSession.id == event_count_sq.c.claude_session_id)
        .outerjoin(ConversationNote, ClaudeSession.id == ConversationNote.claude_session_id)
        .order_by(ClaudeSession.last_seen_at.desc())
        .limit(50)
        .all()
    )

    return [
        {
            "id": s.id,
            "session_id": s.session_id,
            "cwd": s.cwd,
            "status": s.status,
            "linked_task_id": s.linked_task_id,
            "started_at": s.started_at.isoformat(),
            "last_seen_at": s.last_seen_at.isoformat(),
            "event_count": event_count or 0,
            "note": _note_to_dict(note),
        }
        for s, event_count, note in rows
    ]


@router.get("/{session_id}/events", summary="获取会话事件历史")
def get_session_events(session_id: str, limit: int = 200, db: Session = Depends(get_db)):
    """
    获取指定 Claude Code 会话的历史事件列表。

    - 默认返回最近 200 条，按时间升序排列
    - 事件类型包括 PreToolUse / PostToolUse / Stop / Notification 等
    - `tool_input` / `tool_result` 字段为 JSON 对象
    """
    session = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not session:
        return []

    events = (
        db.query(ClaudeEvent)
        .filter(ClaudeEvent.claude_session_id == session.id)
        .order_by(ClaudeEvent.created_at.desc())
        .limit(limit)
        .all()
    )

    def parse_json_field(raw: str | None):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return raw

    return [
        {
            "id": e.id,
            "session_id": session_id,
            "event_type": e.event_type,
            "tool_name": e.tool_name,
            "tool_input": parse_json_field(e.tool_input),
            "tool_result": parse_json_field(e.tool_result),
            "extra": parse_json_field(e.extra),
            "created_at": e.created_at.isoformat(),
        }
        for e in reversed(events)  # 返回时间升序
    ]


# ── ConversationNote 接口 ─────────────────────────────────────

class NoteIn(BaseModel):
    alias: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    linked_task_id: Optional[int] = None


def _note_to_dict(note) -> dict:
    if note is None:
        return {"alias": None, "notes": None, "tags": [], "linked_task_id": None}
    tags = []
    if note.tags:
        try:
            tags = json.loads(note.tags)
        except Exception:
            pass
    return {
        "alias": note.alias,
        "notes": note.notes,
        "tags": tags,
        "linked_task_id": note.linked_task_id,
    }


@router.get("/{session_id}/note", summary="获取会话备注")
def get_session_note(session_id: str, db: Session = Depends(get_db)):
    """获取会话的用户备注。若尚未创建，返回空结构；会话不存在则返回 404。"""
    s = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not s:
        raise HTTPException(404, "会话不存在")
    note = db.query(ConversationNote).filter_by(claude_session_id=s.id).first()
    return _note_to_dict(note)


@router.patch("/{session_id}/note", summary="创建或更新会话备注")
def upsert_session_note(session_id: str, body: NoteIn, db: Session = Depends(get_db)):
    """Upsert 会话备注。不存在则创建，存在则更新。"""
    s = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not s:
        raise HTTPException(404, "会话不存在")

    note = db.query(ConversationNote).filter_by(claude_session_id=s.id).first()
    tags_json = json.dumps(body.tags, ensure_ascii=False) if body.tags is not None else None

    if note is None:
        note = ConversationNote(
            claude_session_id=s.id,
            alias=body.alias,
            notes=body.notes,
            tags=tags_json,
            linked_task_id=body.linked_task_id,
        )
        db.add(note)
    else:
        if body.alias is not None:
            note.alias = body.alias
        if body.notes is not None:
            note.notes = body.notes
        if body.tags is not None:
            note.tags = tags_json
        if body.linked_task_id is not None:
            note.linked_task_id = body.linked_task_id

    db.commit()
    db.refresh(note)
    return _note_to_dict(note)


# ── Transcript 接口 ───────────────────────────────────────────

import os as _os
import json as _json_mod


class TranscriptBlock(BaseModel):
    type: str
    text: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = None
    tool_use_id: Optional[str] = None
    tool_result: Optional[str] = None
    tool_error: Optional[bool] = None


class TranscriptMessage(BaseModel):
    role: str
    ts: Optional[str] = None
    blocks: list[TranscriptBlock] = []
    model: Optional[str] = None


class TranscriptResponse(BaseModel):
    messages: list[TranscriptMessage] = []
    file_found: bool = True


@router.get("/{session_id}/transcript", response_model=TranscriptResponse, summary="读取会话对话记录")
def get_transcript(session_id: str, db: Session = Depends(get_db)):
    """
    从本地 ~/.claude/projects/{project_path}/{session_id}.jsonl 读取完整对话记录。
    返回 user/assistant 消息列表，过滤掉纯 tool_result 的用户消息（自动生成的）。
    """
    s = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 构建文件路径
    cwd = s.cwd or ""
    project_path = cwd.replace("/", "-")
    home = _os.path.expanduser("~")
    transcript_path = _os.path.join(home, ".claude", "projects", project_path, f"{session_id}.jsonl")

    if not _os.path.exists(transcript_path):
        return TranscriptResponse(messages=[], file_found=False)

    messages: list[TranscriptMessage] = []

    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = _json_mod.loads(line)
            except Exception:
                continue

            entry_type = entry.get("type", "")
            msg = entry.get("message", {})
            role = msg.get("role", "")
            content = msg.get("content", [])
            ts = entry.get("timestamp")

            # ── 用户消息 ──
            if entry_type == "user" or role == "user":
                if isinstance(content, str):
                    if content.strip():
                        messages.append(TranscriptMessage(
                            role="user",
                            ts=ts,
                            blocks=[TranscriptBlock(type="text", text=content)],
                        ))
                elif isinstance(content, list):
                    text_blocks = [c for c in content if c.get("type") == "text" and c.get("text", "").strip()]
                    if text_blocks:
                        messages.append(TranscriptMessage(
                            role="user",
                            ts=ts,
                            blocks=[TranscriptBlock(type="text", text=b["text"]) for b in text_blocks],
                        ))
                continue

            # ── 助手消息 ──
            if role == "assistant" or entry_type == "assistant":
                if not isinstance(content, list):
                    continue
                blocks: list[TranscriptBlock] = []
                for block in content:
                    btype = block.get("type")
                    if btype == "text":
                        text = block.get("text", "").strip()
                        if text:
                            blocks.append(TranscriptBlock(type="text", text=text))
                    elif btype == "tool_use":
                        blocks.append(TranscriptBlock(
                            type="tool_use",
                            tool_name=block.get("name"),
                            tool_input=block.get("input") or {},
                        ))
                    # 忽略 thinking 块
                if blocks:
                    messages.append(TranscriptMessage(
                        role="assistant",
                        ts=ts,
                        blocks=blocks,
                        model=msg.get("model"),
                    ))

    return TranscriptResponse(messages=messages)

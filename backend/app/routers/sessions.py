# backend/app/routers/sessions.py
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import engine
from ..models import ClaudeSession, ClaudeEvent, ConversationNote
from .settings_router import _load as _load_settings

router = APIRouter(prefix="/api/sessions", tags=["会话"])


def get_db():
    with Session(engine) as session:
        yield session


import re as _re

_SYSTEM_XML_PATTERNS = [
    _re.compile(r'<local-command-caveat>[\s\S]*?</local-command-caveat>'),
    _re.compile(r'<system-reminder>[\s\S]*?</system-reminder>'),
    _re.compile(r'<task-notification>[\s\S]*?</task-notification>'),
    _re.compile(r'<command-name>[\s\S]*?</command-name>'),
    _re.compile(r'<command-message>[\s\S]*?</command-message>'),
    _re.compile(r'<command-args>[\s\S]*?</command-args>'),
    _re.compile(r'<local-command-stdout>[\s\S]*?</local-command-stdout>'),
    _re.compile(r'Read the output file to retrieve the result:\s*\S+'),
    _re.compile(r'<[^>]+>'),
]


def _clean_system_xml(text: str) -> str:
    """清理 Claude Code 注入的系统 XML 标签，返回纯用户文本。"""
    for pat in _SYSTEM_XML_PATTERNS:
        text = pat.sub('', text)
    return text.strip()


def _get_session_summary(session_id: str, cwd: str, db=None) -> Optional[str]:
    """提取会话摘要（第一条有实际内容的用户消息，最多 120 字符）。优先 JSONL，回退 DB。"""
    # 先尝试从 JSONL 读取
    project_path = (cwd or "").replace("/", "-")
    home = _os.path.expanduser("~")
    path = _os.path.join(home, ".claude", "projects", project_path, f"{session_id}.jsonl")
    if _os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
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
                    if entry_type == "user" or role == "user":
                        raw_text = ""
                        if isinstance(content, str) and content.strip():
                            raw_text = content.strip()
                        elif isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text = (block.get("text") or "").strip()
                                    if text:
                                        raw_text = text
                                        break
                        if raw_text:
                            cleaned = _clean_system_xml(raw_text)
                            if cleaned:
                                return cleaned[:120]
        except Exception:
            pass

    # JSONL 不存在或无内容，从 DB 读取第一条 user 消息
    if db is not None:
        try:
            from ..models import SessionMessage
            user_rows = (
                db.query(SessionMessage)
                .filter_by(session_id=session_id, role="user")
                .order_by(SessionMessage.created_at)
                .limit(10)
                .all()
            )
            for row in user_rows:
                blocks = _json_mod.loads(row.blocks_json)
                for b in blocks:
                    if b.get("type") == "text" and b.get("text", "").strip():
                        cleaned = _clean_system_xml(b["text"].strip())
                        if cleaned:
                            return cleaned[:120]
        except Exception:
            pass

    return None


@router.get("", summary="Claude 会话列表")
def list_sessions(db: Session = Depends(get_db)):
    """
    获取最近 50 个 Claude Code 会话，按最后活跃时间倒序排列。

    每条记录包含：会话 ID、工作目录、状态、事件总数、首条用户消息摘要。
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
        .limit(_load_settings().get("observe_session_limit", 50))
        .all()
    )

    results = []
    for s, event_count, note in rows:
        summary = _get_session_summary(s.session_id, s.cwd or "", db=db)
        results.append({
            "id": s.id,
            "session_id": s.session_id,
            "cwd": s.cwd,
            "status": s.status,
            "linked_task_id": s.linked_task_id,
            "started_at": s.started_at.isoformat(),
            "last_seen_at": s.last_seen_at.isoformat(),
            "event_count": event_count or 0,
            "note": _note_to_dict(note),
            "summary": summary,
        })
    return results


@router.get("/{session_id}/events", summary="获取会话事件历史")
def get_session_events(session_id: str, limit: Optional[int] = None, db: Session = Depends(get_db)):
    """
    获取指定 Claude Code 会话的历史事件列表。

    - 默认返回最近 200 条，按时间升序排列
    - 事件类型包括 PreToolUse / PostToolUse / Stop / Notification 等
    - `tool_input` / `tool_result` 字段为 JSON 对象
    """
    if limit is None:
        limit = _load_settings().get("observe_event_limit", 200)

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
    total: int = 0
    has_more: bool = False


def _extract_tool_result_text(content) -> str:
    """从 tool_result 的 content 字段提取文本，截断到 5000 字符。"""
    MAX_LEN = 5000
    if isinstance(content, str):
        return content[:MAX_LEN]
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                return (item.get("text") or "")[:MAX_LEN]
    return ""


def _load_transcript_from_db(session_id: str, db: Session) -> list[TranscriptMessage] | None:
    """从 session_messages 表读取对话记录，返回 None 表示无数据"""
    from ..models import SessionMessage
    rows = (
        db.query(SessionMessage)
        .filter_by(session_id=session_id)
        .order_by(SessionMessage.created_at)
        .all()
    )
    if not rows:
        return None
    messages: list[TranscriptMessage] = []
    for row in rows:
        try:
            raw_blocks = _json_mod.loads(row.blocks_json)
        except Exception:
            continue
        blocks = [
            TranscriptBlock(
                type=b.get("type", "text"),
                text=b.get("text"),
                tool_name=b.get("tool_name"),
                tool_input=b.get("tool_input"),
                tool_use_id=b.get("tool_use_id"),
                tool_result=b.get("tool_result"),
                tool_error=b.get("tool_error"),
            )
            for b in raw_blocks
        ]
        messages.append(TranscriptMessage(
            role=row.role,
            ts=row.created_at.isoformat() if row.created_at else None,
            blocks=blocks,
            model=row.model,
        ))
    return messages


def _load_transcript_from_jsonl(session_id: str, cwd: str) -> list[TranscriptMessage] | None:
    """从 JSONL 文件读取对话记录，返回 None 表示文件不存在"""
    project_path = cwd.replace("/", "-")
    home = _os.path.expanduser("~")
    transcript_path = _os.path.join(home, ".claude", "projects", project_path, f"{session_id}.jsonl")

    if not _os.path.exists(transcript_path):
        return None

    messages: list[TranscriptMessage] = []
    tool_results: dict[str, tuple[str, bool]] = {}

    entries: list[dict] = []
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(_json_mod.loads(line))
            except Exception:
                continue

    for entry in entries:
        entry_type = entry.get("type", "")
        msg = entry.get("message", {})
        role = msg.get("role", "")
        content = msg.get("content", [])
        ts = entry.get("timestamp")

        if entry_type == "user" or role == "user":
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        tuid = block.get("tool_use_id")
                        if tuid:
                            result_text = _extract_tool_result_text(block.get("content", ""))
                            is_error = bool(block.get("is_error", False))
                            tool_results[tuid] = (result_text, is_error)

            if isinstance(content, str):
                if content.strip():
                    messages.append(TranscriptMessage(
                        role="user", ts=ts,
                        blocks=[TranscriptBlock(type="text", text=content)],
                    ))
            elif isinstance(content, list):
                text_blocks = [c for c in content if isinstance(c, dict) and c.get("type") == "text" and c.get("text", "").strip()]
                if text_blocks:
                    messages.append(TranscriptMessage(
                        role="user", ts=ts,
                        blocks=[TranscriptBlock(type="text", text=b["text"]) for b in text_blocks],
                    ))
            continue

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
                        tool_use_id=block.get("id"),
                    ))
            if blocks:
                messages.append(TranscriptMessage(
                    role="assistant", ts=ts, blocks=blocks, model=msg.get("model"),
                ))

    for msg in messages:
        for block in msg.blocks:
            if block.type == "tool_use" and block.tool_use_id and block.tool_use_id in tool_results:
                result_text, is_error = tool_results[block.tool_use_id]
                block.tool_result = result_text
                block.tool_error = is_error if is_error else None

    return messages


@router.get("/{session_id}/transcript", response_model=TranscriptResponse, summary="读取会话对话记录")
def get_transcript(
    session_id: str,
    limit: int = 50,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    读取会话对话记录。优先从 DB（session_messages）读取，
    无数据时回退到 JSONL 文件（~/.claude/projects/.../{session_id}.jsonl）。
    """
    s = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 优先从 DB 读取
    messages = _load_transcript_from_db(session_id, db)

    # DB 无数据，回退到 JSONL
    if messages is None:
        messages = _load_transcript_from_jsonl(session_id, s.cwd or "")

    if messages is None:
        return TranscriptResponse(messages=[], file_found=False, total=0, has_more=False)

    total = len(messages)
    if offset is None:
        start = max(0, total - limit)
    else:
        start = max(0, min(offset, total))
    end = min(start + limit, total)

    return TranscriptResponse(
        messages=messages[start:end],
        file_found=True,
        total=total,
        has_more=start > 0,
    )


@router.get("/{session_id}/questions", summary="获取会话中的用户提问列表")
def get_questions(session_id: str, db: Session = Depends(get_db)):
    """轻量级端点：只返回用户提问的文本和在消息数组中的索引，供 QuestionNav 使用。"""
    s = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 先尝试从 DB 读取
    from ..models import SessionMessage
    db_rows = (
        db.query(SessionMessage)
        .filter_by(session_id=session_id)
        .order_by(SessionMessage.created_at)
        .all()
    )
    if db_rows:
        questions: list[dict] = []
        msg_index = 0
        for row in db_rows:
            try:
                blocks = _json_mod.loads(row.blocks_json)
            except Exception:
                continue
            if row.role == "user":
                text_parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
                text = " ".join(t.strip() for t in text_parts if t.strip())
                if text:
                    questions.append({"index": msg_index, "text": text[:200]})
                    msg_index += 1
            elif row.role == "assistant":
                msg_index += 1
        return {"questions": questions, "total": msg_index}

    # 回退到 JSONL
    cwd = s.cwd or ""
    project_path = cwd.replace("/", "-")
    home = _os.path.expanduser("~")
    transcript_path = _os.path.join(home, ".claude", "projects", project_path, f"{session_id}.jsonl")

    if not _os.path.exists(transcript_path):
        return {"questions": [], "total": 0}

    questions = []
    msg_index = 0

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

            is_user = entry_type == "user" or role == "user"
            is_assistant = role == "assistant" or entry_type == "assistant"

            if is_user:
                text = ""
                if isinstance(content, str):
                    text = content.strip()
                elif isinstance(content, list):
                    text_parts = [c.get("text", "") for c in content
                                  if isinstance(c, dict) and c.get("type") == "text"]
                    text = " ".join(t.strip() for t in text_parts if t.strip())

                if text:
                    questions.append({
                        "index": msg_index,
                        "text": text[:200],
                    })
                    msg_index += 1
            elif is_assistant:
                has_blocks = isinstance(content, list) and any(
                    isinstance(b, dict) and (b.get("type") == "text" or b.get("type") == "tool_use")
                    for b in content
                )
                if has_blocks:
                    msg_index += 1

    return {"questions": questions, "total": msg_index}

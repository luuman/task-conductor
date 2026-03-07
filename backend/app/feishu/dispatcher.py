"""飞书事件分发路由：接收飞书回调，分发到对话/任务/审批处理器。"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Project, Task
from ..pipeline.engine import PipelineEngine, StageTransitionError
from .cards import build_approved_card
from .client import feishu_client
from .handler import handle_chat, handle_task_create

logger = logging.getLogger(__name__)

router = APIRouter(tags=["飞书"])

# ── 全局状态 ────────────────────────────────────────────────────────

_processed_events: set[str] = set()
_default_chat_id: str = ""

_MAX_EVENT_CACHE = 1000


def set_default_chat_id(chat_id: str) -> None:
    global _default_chat_id
    _default_chat_id = chat_id


def get_default_chat_id() -> str:
    return _default_chat_id


# ── 端点 1: 飞书事件回调 ─────────────────────────────────────────────

@router.post("/hooks/feishu/event", summary="飞书事件回调")
async def feishu_event(request: Request):
    """
    接收飞书事件订阅回调。

    - URL 验证：返回 challenge
    - 消息事件：im.message.receive_v1 → 分发到对话/任务处理器
    """
    body = await request.json()

    # URL 验证（飞书首次配置时发送）
    if "challenge" in body:
        return {"challenge": body["challenge"]}

    # v2.0 事件格式
    header = body.get("header", {})
    event_id = header.get("event_id", "")
    event_type = header.get("event_type", "")

    # 去重
    if event_id:
        if event_id in _processed_events:
            return {"code": 0}
        _processed_events.add(event_id)
        # 防止内存泄漏
        if len(_processed_events) > _MAX_EVENT_CACHE:
            # 清掉一半旧事件
            to_remove = list(_processed_events)[:_MAX_EVENT_CACHE // 2]
            for eid in to_remove:
                _processed_events.discard(eid)

    # 只处理消息事件
    if event_type != "im.message.receive_v1":
        return {"code": 0}

    event = body.get("event", {})
    message = event.get("message", {})
    sender = event.get("sender", {})

    # 忽略机器人自己的消息
    if sender.get("sender_type") == "app":
        return {"code": 0}

    # 提取文本
    msg_type = message.get("message_type", "")
    if msg_type != "text":
        return {"code": 0}

    try:
        content_obj = json.loads(message.get("content", "{}"))
        text = content_obj.get("text", "").strip()
    except (json.JSONDecodeError, AttributeError):
        return {"code": 0}

    if not text:
        return {"code": 0}

    chat_id = message.get("chat_id", "")
    if not chat_id:
        return {"code": 0}

    asyncio.create_task(_dispatch_message(chat_id, text))
    return {"code": 0}


async def _dispatch_message(chat_id: str, text: str) -> None:
    """根据 chat_id 分发消息到不同处理器。"""
    try:
        # 情况 1: 默认对话群
        if chat_id == _default_chat_id:
            from ..routers.settings_router import _load
            settings = _load()
            cwd = settings.get("workspace_root", "/home/sichengli/Documents/code2")
            await handle_chat(text, chat_id, cwd)
            return

        # 情况 2: 项目群
        with Session(engine) as db:
            project = db.query(Project).filter_by(feishu_chat_id=chat_id).first()
            if project:
                project_id = project.id
                project_name = project.name
                project_cwd = project.repo_url or ""

        if project:
            if text.startswith("/task "):
                title = text[6:].strip()
                if title:
                    await handle_task_create(title, chat_id, project_id, project_name)
            else:
                cwd = project_cwd or "/home/sichengli/Documents/code2"
                await handle_chat(text, chat_id, cwd=cwd)
            return

        # 情况 3: 不匹配任何已知群 → 忽略
        logger.debug("飞书消息来自未知群 %s，忽略", chat_id)
    except Exception:
        logger.exception("飞书消息分发失败: chat_id=%s", chat_id)


# ── 端点 2: 卡片按钮回调 ─────────────────────────────────────────────

pipeline_engine = PipelineEngine()


@router.post("/hooks/feishu/card", summary="飞书卡片按钮回调")
async def feishu_card(request: Request):
    """
    接收飞书交互卡片按钮点击回调。

    支持的 action:
    - approve: 审批通过并推进到下一阶段
    - reject: 驳回当前阶段
    """
    body = await request.json()

    action_obj = body.get("action", {})
    value_raw = action_obj.get("value", {})

    # value 可能是 JSON 字符串或 dict
    if isinstance(value_raw, str):
        try:
            value = json.loads(value_raw)
        except json.JSONDecodeError:
            return {"code": 0}
    elif isinstance(value_raw, dict):
        # 卡片按钮 value 里面有个 "value" 字段是 JSON 字符串
        inner = value_raw.get("value", "")
        if isinstance(inner, str):
            try:
                value = json.loads(inner)
            except json.JSONDecodeError:
                value = value_raw
        else:
            value = value_raw
    else:
        return {"code": 0}

    action = value.get("action", "")
    task_id = value.get("task_id")

    if not action or not task_id:
        return {"code": 0}

    try:
        task_id = int(task_id)
    except (ValueError, TypeError):
        return {"code": 0}

    with Session(engine) as db:
        task = db.get(Task, task_id)
        if not task:
            return {"code": 0}

        stage = task.stage

        if action == "approve":
            task.status = "approved"
            db.commit()
            db.refresh(task)

            # 推进到下一阶段
            if pipeline_engine.can_proceed(task.stage, task.status):
                try:
                    next_stage = pipeline_engine.next_stage(task.stage)
                    task.stage = next_stage
                    task.status = "pending" if next_stage != "done" else "done"
                    db.commit()
                    db.refresh(task)

                    if next_stage != "done":
                        from ..scheduler import scheduler
                        asyncio.create_task(scheduler.enqueue(task_id))
                except StageTransitionError as e:
                    logger.warning("飞书审批推进失败: %s", e)

        elif action == "reject":
            task.status = "rejected"
            db.commit()
            db.refresh(task)

    # 返回更新后的卡片
    card = build_approved_card(task_id, stage, action)
    return card


# ── 端点 3: 飞书集成状态 ─────────────────────────────────────────────

@router.get("/api/feishu/status", summary="飞书集成状态")
def feishu_status():
    """返回飞书集成的当前状态。"""
    return {
        "enabled": feishu_client.enabled,
        "default_chat_id": _default_chat_id,
        "app_id": feishu_client.app_id,
    }


# ── 端点 4: 绑定项目群 ──────────────────────────────────────────────

class BindGroupBody(BaseModel):
    project_id: int
    chat_id: str


@router.post("/api/feishu/bind-group", summary="绑定项目群")
def bind_group(body: BindGroupBody):
    """手动绑定飞书群到项目。"""
    with Session(engine) as db:
        project = db.get(Project, body.project_id)
        if not project:
            return {"error": "项目不存在", "code": 1}
        project.feishu_chat_id = body.chat_id
        db.commit()
    return {"code": 0, "project_id": body.project_id, "chat_id": body.chat_id}

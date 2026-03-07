"""飞书事件分发：使用 lark_oapi WebSocket 长连接接收事件。"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Project, Task
from .cards import build_approved_card
from .client import feishu_client
from .handler import handle_chat, handle_task_create

logger = logging.getLogger(__name__)

router = APIRouter(tags=["飞书"])

# ── 全局状态 ────────────────────────────────────────────────────────

_default_chat_id: str = ""
_ws_thread: Optional[threading.Thread] = None
_main_loop: Optional[asyncio.AbstractEventLoop] = None


def set_default_chat_id(chat_id: str) -> None:
    global _default_chat_id
    _default_chat_id = chat_id


def get_default_chat_id() -> str:
    return _default_chat_id


# ── 长连接启动 ──────────────────────────────────────────────────────


def start_ws_client(loop: asyncio.AbstractEventLoop) -> None:
    """在后台线程启动飞书 WebSocket 长连接。"""
    global _ws_thread, _main_loop
    _main_loop = loop

    from lark_oapi import EventDispatcherHandler
    from lark_oapi.ws import Client as WsClient

    handler = (
        EventDispatcherHandler.builder("", "")
        .register_p2_im_message_receive_v1(_on_message)
        .register_p2_card_action_trigger(_on_card_action)
        .build()
    )

    ws_client = WsClient(
        app_id=feishu_client.app_id,
        app_secret=feishu_client.app_secret,
        event_handler=handler,
        auto_reconnect=True,
    )

    def _run():
        try:
            logger.info("[Feishu WS] 长连接启动中...")
            ws_client.start()
        except Exception:
            logger.exception("[Feishu WS] 长连接异常退出")

    _ws_thread = threading.Thread(target=_run, daemon=True, name="feishu-ws")
    _ws_thread.start()
    logger.info("[Feishu WS] 后台线程已启动")


# ── 事件处理器（在 ws 线程中被调用）──────────────────────────────────


def _on_message(data) -> None:
    """处理 im.message.receive_v1 事件。"""
    try:
        event = data.event
        if not event or not event.message:
            return

        message = event.message
        sender = event.sender

        # 忽略机器人自己的消息
        if sender and sender.sender_type == "app":
            return

        # 只处理文本消息
        if message.message_type != "text":
            return

        # 提取文本
        try:
            content_obj = json.loads(message.content or "{}")
            text = content_obj.get("text", "").strip()
        except (json.JSONDecodeError, AttributeError):
            return

        if not text:
            return

        chat_id = message.chat_id or ""
        if not chat_id:
            return

        # 话题模式：提取 message_id 用于回复到同一话题
        msg_id = message.message_id or ""
        root_id = getattr(message, "root_id", "") or ""
        # 有 root_id 说明是话题内回复，用 root_id 所在话题；
        # 没有 root_id 但在话题群里，则 msg_id 本身就是话题的根消息
        reply_to = root_id or msg_id

        # 将异步任务调度到主事件循环
        if _main_loop and _main_loop.is_running():
            asyncio.run_coroutine_threadsafe(
                _dispatch_message(chat_id, text, reply_to), _main_loop
            )
        else:
            logger.warning("[Feishu WS] 主事件循环不可用，跳过消息")
    except Exception:
        logger.exception("[Feishu WS] 处理消息异常")


def _on_card_action(data):
    """处理卡片按钮点击回调。"""
    from lark_oapi.event.callback.model.p2_card_action_trigger import (
        P2CardActionTriggerResponse,
    )

    try:
        event = data.event
        if not event or not event.action:
            return P2CardActionTriggerResponse()

        value_raw = event.action.value
        if isinstance(value_raw, str):
            try:
                value = json.loads(value_raw)
            except json.JSONDecodeError:
                return P2CardActionTriggerResponse()
        elif isinstance(value_raw, dict):
            value = value_raw
        else:
            return P2CardActionTriggerResponse()

        action = value.get("action", "")
        task_id = value.get("task_id")

        if not action or not task_id:
            return P2CardActionTriggerResponse()

        try:
            task_id = int(task_id)
        except (ValueError, TypeError):
            return P2CardActionTriggerResponse()

        # 执行审批（同步 DB 操作）
        _handle_approval(task_id, action)

        # 返回更新后的卡片
        with Session(engine) as db:
            task = db.get(Task, task_id)
            stage = task.stage if task else "unknown"

        resp = P2CardActionTriggerResponse()
        card = build_approved_card(task_id, stage, action)
        # 通过设置 card 属性返回新卡片
        from lark_oapi.event.callback.model.p2_card_action_trigger import CallBackCard
        resp.card = CallBackCard(d=card)
        return resp
    except Exception:
        logger.exception("[Feishu WS] 处理卡片回调异常")
        return P2CardActionTriggerResponse()


def _handle_approval(task_id: int, action: str) -> None:
    """同步处理审批操作。"""
    with Session(engine) as db:
        task = db.get(Task, task_id)
        if not task:
            return

        if action == "approve":
            task.status = "approved"
            db.commit()
            db.refresh(task)

            # 推进到下一阶段
            from ..pipeline.engine import PipelineEngine

            engine_inst = PipelineEngine()
            if engine_inst.can_proceed(task.stage, task.status):
                try:
                    next_stage = engine_inst.next_stage(task.stage)
                    task.stage = next_stage
                    task.status = "pending" if next_stage != "done" else "done"
                    db.commit()

                    if next_stage != "done" and _main_loop and _main_loop.is_running():
                        from ..scheduler import scheduler
                        asyncio.run_coroutine_threadsafe(
                            scheduler.enqueue(task_id), _main_loop
                        )
                except Exception as e:
                    logger.warning("飞书审批推进失败: %s", e)

        elif action == "reject":
            task.status = "rejected"
            db.commit()


# ── 消息分发（在主事件循环中执行）──────────────────────────────────


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
        project_id = project_name = project_cwd = None
        with Session(engine) as db:
            project = db.query(Project).filter_by(feishu_chat_id=chat_id).first()
            if project:
                project_id = project.id
                project_name = project.name
                project_cwd = project.repo_url or ""

        if project_id is not None:
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


# ── HTTP 端点（保留）────────────────────────────────────────────────


@router.get("/api/feishu/status", summary="飞书集成状态")
def feishu_status():
    """返回飞书集成的当前状态。"""
    return {
        "enabled": feishu_client.enabled,
        "mode": "websocket",
        "ws_alive": _ws_thread.is_alive() if _ws_thread else False,
        "default_chat_id": _default_chat_id,
        "app_id": feishu_client.app_id,
    }


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

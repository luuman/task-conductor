"""
聊天路由 - 通过 claude_code_sdk ClaudeSDKClient 持久连接实现多轮对话
特点：
- 单个 WebSocket 连接内保持同一个 Claude 进程（无重复冷启动）
- StreamEvent 逐 token 流式推送
- 自动 resume 多轮对话
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["聊天"])

# 可用模型列表
AVAILABLE_MODELS = [
    {"id": "claude-sonnet-4-20250514", "name": "Sonnet 4", "default": True},
    {"id": "claude-opus-4-20250514", "name": "Opus 4"},
    {"id": "claude-haiku-4-5-20251001", "name": "Haiku 4.5"},
]


@router.get("/models", summary="获取可用模型列表")
def get_models():
    """返回可用的 Claude 模型列表"""
    return AVAILABLE_MODELS


# ── WebSocket 聊天处理（ClaudeSDKClient 持久连接）────────────────


async def handle_chat_ws(ws: WebSocket):
    """
    处理 /ws/chat WebSocket 连接。
    使用 ClaudeSDKClient 保持持久 Claude 进程，消除重复冷启动。
    """
    await ws.accept()

    from claude_code_sdk import (
        ClaudeSDKClient, ClaudeCodeOptions,
        AssistantMessage, ResultMessage, UserMessage,
    )
    from claude_code_sdk.types import StreamEvent

    client: Optional[ClaudeSDKClient] = None
    stream_task: Optional[asyncio.Task] = None
    current_session_id: Optional[str] = None

    def _ts() -> str:
        return datetime.utcnow().isoformat()

    async def _send(msg: dict):
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            pass

    async def _init_client(
        cwd: Optional[str] = None,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> ClaudeSDKClient:
        """初始化或复用 ClaudeSDKClient"""
        nonlocal client
        if client is not None:
            return client

        opts = ClaudeCodeOptions(
            permission_mode="bypassPermissions",
            include_partial_messages=True,
            cwd=cwd or os.path.expanduser("~"),
        )
        if model:
            opts.model = model
        if system_prompt:
            opts.system_prompt = system_prompt

        c = ClaudeSDKClient(opts)
        await c.connect()
        client = c
        logger.info("[Chat] ClaudeSDKClient connected")
        return c

    async def _handle_message(
        message: str,
        session_id: Optional[str] = None,
        model: Optional[str] = None,
        cwd: Optional[str] = None,
        system_prompt: Optional[str] = None,
        **kwargs,
    ):
        """发送消息并流式接收回复"""
        nonlocal current_session_id

        c = await _init_client(cwd=cwd, model=model, system_prompt=system_prompt)

        import re as _re
        full_text = ""
        result_session_id = current_session_id or ""
        _tool_queue: list[tuple[str, dict]] = []  # (name, input) 按顺序
        _cur_tool = ""
        _input_buf = ""

        try:
            await c.query(message)

            async for msg in c.receive_response():
                # ── StreamEvent ──
                if isinstance(msg, StreamEvent):
                    evt = msg.event
                    et = evt.get("type", "")

                    if et == "content_block_delta":
                        d = evt.get("delta", {})
                        dt = d.get("type", "")
                        if dt == "text_delta":
                            t = d.get("text", "")
                            if t:
                                full_text += t
                                await _send({"type": "chat_chunk", "data": {"text": t, "session_id": result_session_id, "done": False}, "ts": _ts()})
                        elif dt == "thinking_delta":
                            t = d.get("thinking", "")
                            if t:
                                await _send({"type": "chat_thinking", "data": {"text": t, "session_id": result_session_id}, "ts": _ts()})
                        elif dt == "input_json_delta":
                            _input_buf += d.get("partial_json", "")

                    elif et == "content_block_start":
                        bl = evt.get("content_block", {})
                        if bl.get("type") == "tool_use":
                            _cur_tool = bl.get("name", "")
                            _input_buf = ""
                            # 立即通知前端（用于显示药丸/卡片）
                            await _send({"type": "chat_tool_use", "data": {"tool": _cur_tool, "session_id": result_session_id}, "ts": _ts()})

                    elif et == "content_block_stop":
                        if _cur_tool:
                            ti = {}
                            try:
                                if _input_buf: ti = json.loads(_input_buf)
                            except Exception:
                                pass
                            _tool_queue.append((_cur_tool, ti))
                            _cur_tool = ""
                            _input_buf = ""

                # ── UserMessage：工具结果 ──
                elif isinstance(msg, UserMessage):
                    for bl in (msg.content or []):
                        content = getattr(bl, "content", "")
                        is_err = getattr(bl, "is_error", False)
                        name, ti = _tool_queue.pop(0) if _tool_queue else ("Tool", {})
                        rs = str(content)[:5000] if content else ""
                        if name == "Read" and rs:
                            rs = _re.sub(r'(?m)^\s*\d+→', '', rs)
                        await _send({"type": "chat_tool_result", "data": {"tool": name, "input": ti, "result": rs, "is_error": is_err, "session_id": result_session_id}, "ts": _ts()})

                # ── ResultMessage：回合结束 ──
                elif isinstance(msg, ResultMessage):
                    result_session_id = getattr(msg, "session_id", "") or result_session_id
                    current_session_id = result_session_id

                    cost = getattr(msg, "total_cost_usd", 0) or 0
                    duration = getattr(msg, "duration_ms", 0) or 0

                    await _send({
                        "type": "chat_done",
                        "data": {
                            "session_id": result_session_id,
                            "full_text": full_text,
                            "cost_usd": round(cost, 4),
                            "duration_ms": duration,
                        },
                        "ts": _ts(),
                    })
                    # receive_response() 在 ResultMessage 后自动停止

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("Chat error")
            await _send({
                "type": "chat_error",
                "data": {"error": str(e)},
                "ts": _ts(),
            })

    try:
        while True:
            raw_msg = await ws.receive_text()
            try:
                msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                await _send({
                    "type": "chat_error",
                    "data": {"error": "无效的 JSON 消息"},
                    "ts": _ts(),
                })
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await _send({"type": "pong", "ts": _ts()})

            elif msg_type == "stop":
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass
                # 中断当前 Claude 执行
                if client:
                    try:
                        await client.interrupt()
                    except Exception:
                        pass
                await _send({
                    "type": "chat_done",
                    "data": {"session_id": current_session_id or "", "full_text": "[已中断]"},
                    "ts": _ts(),
                })

            elif msg_type == "chat":
                message = msg.get("message", "").strip()
                if not message:
                    await _send({
                        "type": "chat_error",
                        "data": {"error": "消息内容不能为空"},
                        "ts": _ts(),
                    })
                    continue

                # 取消进行中的流
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

                stream_task = asyncio.create_task(
                    _handle_message(
                        message=message,
                        session_id=msg.get("session_id"),
                        model=msg.get("model"),
                        cwd=msg.get("cwd"),
                        system_prompt=msg.get("system_prompt"),
                    )
                )

            elif msg_type == "new_session":
                # 断开旧 client，下次 chat 重新建立
                if client:
                    try:
                        await client.disconnect()
                    except Exception:
                        pass
                    client = None
                current_session_id = None
                await _send({
                    "type": "session_reset",
                    "data": {"message": "会话已重置"},
                    "ts": _ts(),
                })

            else:
                await _send({
                    "type": "chat_error",
                    "data": {"error": f"未知消息类型: {msg_type}"},
                    "ts": _ts(),
                })

    except WebSocketDisconnect:
        if stream_task and not stream_task.done():
            stream_task.cancel()
            try:
                await stream_task
            except asyncio.CancelledError:
                pass
    finally:
        # 清理 client
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

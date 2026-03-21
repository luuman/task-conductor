"""
聊天路由 - 通过 Claude Agent SDK ClaudeSDKClient 持久连接实现多轮对话
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

    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
    from claude_agent_sdk.types import (
        AssistantMessage, ResultMessage, StreamEvent, UserMessage,
    )

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

        opts = ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            include_partial_messages=True,
            cwd=cwd or os.path.expanduser("~"),
            cli_path="claude",  # 用系统 CLI，而非 bundled，确保 hooks 生效
        )
        if model:
            opts.model = model
        if system_prompt:
            opts.system_prompt = system_prompt

        c = ClaudeSDKClient(options=opts)
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

        full_text = ""
        result_session_id = current_session_id or ""
        # tool_use_id → {name, input_buf}，用于匹配工具调用和结果
        _pending_tools: dict[str, dict] = {}
        _current_tool_id = ""
        _current_tool_name = ""
        _tool_input_buf = ""

        try:
            await c.query(message)

            async for msg in c.receive_messages():
                # ── StreamEvent：逐 token 推送 ──
                if isinstance(msg, StreamEvent):
                    evt = msg.event
                    evt_type = evt.get("type", "")

                    if evt_type == "content_block_delta":
                        delta = evt.get("delta", {})
                        delta_type = delta.get("type", "")

                        if delta_type == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                full_text += text
                                await _send({
                                    "type": "chat_chunk",
                                    "data": {
                                        "text": text,
                                        "session_id": result_session_id,
                                        "done": False,
                                    },
                                    "ts": _ts(),
                                })
                        elif delta_type == "thinking_delta":
                            text = delta.get("thinking", "")
                            if text:
                                await _send({
                                    "type": "chat_thinking",
                                    "data": {
                                        "text": text,
                                        "session_id": result_session_id,
                                    },
                                    "ts": _ts(),
                                })
                        elif delta_type == "input_json_delta":
                            _tool_input_buf += delta.get("partial_json", "")

                    elif evt_type == "content_block_start":
                        block = evt.get("content_block", {})
                        if block.get("type") == "tool_use":
                            _current_tool_id = block.get("id", "")
                            _current_tool_name = block.get("name", "")
                            _tool_input_buf = ""

                    elif evt_type == "content_block_stop":
                        if _current_tool_id and _current_tool_name:
                            tool_input = {}
                            if _tool_input_buf:
                                try:
                                    tool_input = json.loads(_tool_input_buf)
                                except json.JSONDecodeError:
                                    tool_input = {"raw": _tool_input_buf}
                            _pending_tools[_current_tool_id] = {
                                "name": _current_tool_name,
                                "input": tool_input,
                            }
                            _current_tool_id = ""
                            _current_tool_name = ""
                            _tool_input_buf = ""

                # ── UserMessage：工具结果 → 合并发送 chat_tool_complete ──
                elif isinstance(msg, UserMessage):
                    for block in (msg.content or []):
                        tool_use_id = getattr(block, "tool_use_id", "")
                        content = getattr(block, "content", "")
                        is_error = getattr(block, "is_error", False)
                        # 用 tool_use_id 匹配到对应的工具调用
                        tool_info = _pending_tools.pop(tool_use_id, {})
                        tool_name = tool_info.get("name", "Tool")
                        tool_input = tool_info.get("input", {})
                        result_str = str(content)[:5000] if content else ""
                        # Read 工具结果去掉 cat -n 行号前缀（如 "     1→"）
                        if tool_name == "Read" and result_str:
                            import re
                            lines = result_str.split("\n")
                            cleaned = []
                            for line in lines:
                                cleaned.append(re.sub(r'^\s*\d+→', '', line))
                            result_str = "\n".join(cleaned)
                        payload = {
                            "type": "chat_tool_complete",
                            "data": {
                                "tool": tool_name,
                                "input": tool_input,
                                "result": result_str,
                                "is_error": is_error,
                                "session_id": result_session_id,
                            },
                            "ts": _ts(),
                        }
                        logger.info(f"[Chat] >>> chat_tool_complete: tool={tool_name} input_keys={list(tool_input.keys())} result_len={len(result_str)}")
                        await _send(payload)

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
                    break  # 本轮结束，等待下一条用户消息

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
                        client.interrupt()
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

"""
聊天路由 - 通过 Claude Agent SDK 与 Claude 进行多轮对话
使用持久会话连接，支持 MCP 工具注入（TaskConductor MCP Server）
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


# ── WebSocket 聊天处理（Agent SDK）──────────────────────────────


def _build_mcp_servers() -> dict:
    """构建 MCP 服务器配置，自动注入 TaskConductor MCP Server"""
    from claude_agent_sdk.types import McpHttpServerConfig
    tc_url = os.getenv("TC_AGENT_URL", "http://localhost:8765")
    return {
        "task-conductor": McpHttpServerConfig(url=f"{tc_url}/mcp"),
    }


async def handle_chat_ws(ws: WebSocket):
    """
    处理 /ws/chat WebSocket 连接。
    使用 Claude Agent SDK 实现持久会话 + 流式推送。
    WebSocket 消息格式保持兼容：chat_chunk / chat_done / chat_error
    """
    await ws.accept()

    stream_task: Optional[asyncio.Task] = None
    # 记录当前会话的 session_id，用于多轮对话
    current_session_id: Optional[str] = None

    def _ts() -> str:
        return datetime.utcnow().isoformat()

    async def _send(msg: dict):
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            pass

    async def _run_agent(
        message: str,
        session_id: Optional[str] = None,
        model: Optional[str] = None,
        cwd: Optional[str] = None,
        system_prompt: Optional[str] = None,
        append_system_prompt: Optional[str] = None,
        effort: Optional[str] = None,
        allowed_tools: Optional[list[str]] = None,
        disallowed_tools: Optional[list[str]] = None,
        permission_mode: Optional[str] = None,
        max_budget: Optional[float] = None,
        continue_session: bool = False,
    ):
        """通过 Agent SDK 发送消息并流式接收回复"""
        nonlocal current_session_id

        from claude_agent_sdk import query, ClaudeAgentOptions
        from claude_agent_sdk.types import (
            AssistantMessage, ResultMessage, TextBlock, ThinkingBlock,
            ToolUseBlock,
        )

        # 构建选项
        # MCP 通过 ~/.claude.json 全局配置自动加载
        opts = ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            include_partial_messages=True,  # 流式：每个 token 都推送
        )

        # 使用传入的 session_id 或当前会话的 session_id 实现多轮
        resume_id = session_id or current_session_id
        if resume_id:
            opts.resume = resume_id
        elif continue_session:
            opts.continue_conversation = True

        if model:
            opts.model = model
        if system_prompt:
            opts.system_prompt = system_prompt
        if cwd:
            opts.cwd = cwd
        else:
            opts.cwd = os.path.expanduser("~")
        if effort and effort in ("low", "medium", "high", "max"):
            opts.effort = effort
        if max_budget and max_budget > 0:
            opts.max_budget_usd = max_budget
        if allowed_tools:
            opts.allowed_tools = allowed_tools
        if disallowed_tools:
            opts.disallowed_tools = disallowed_tools
        if append_system_prompt:
            # Agent SDK 没有直接的 append_system_prompt，拼接到 system_prompt
            base = opts.system_prompt or ""
            opts.system_prompt = f"{base}\n\n{append_system_prompt}" if base else append_system_prompt

        result_session_id = resume_id or ""
        full_text = ""
        # 用于增量 diff：记录上次已发送的文本长度
        _last_sent_len = 0
        _last_thinking_len = 0

        try:
            _msg_count = 0
            async for message in query(prompt=message, options=opts):
                _msg_count += 1
                logger.info(f"[AgentSDK] msg#{_msg_count} type={type(message).__name__}")
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            # partial 模式下 text 是累积的，做增量 diff
                            current_text = block.text or ""
                            if len(current_text) > _last_sent_len:
                                delta = current_text[_last_sent_len:]
                                _last_sent_len = len(current_text)
                                full_text = current_text
                                await _send({
                                    "type": "chat_chunk",
                                    "data": {
                                        "text": delta,
                                        "session_id": result_session_id,
                                        "done": False,
                                    },
                                    "ts": _ts(),
                                })
                        elif isinstance(block, ThinkingBlock):
                            thinking = getattr(block, "thinking", "") or ""
                            if len(thinking) > _last_thinking_len:
                                delta = thinking[_last_thinking_len:]
                                _last_thinking_len = len(thinking)
                                await _send({
                                    "type": "chat_thinking",
                                    "data": {
                                        "text": delta,
                                        "session_id": result_session_id,
                                    },
                                    "ts": _ts(),
                                })
                        elif isinstance(block, ToolUseBlock):
                            await _send({
                                "type": "chat_tool_use",
                                "data": {
                                    "tool": block.name,
                                    "input": block.input if hasattr(block, "input") else {},
                                    "session_id": result_session_id,
                                },
                                "ts": _ts(),
                            })

                elif isinstance(message, ResultMessage):
                    # 提取 session_id 和统计信息
                    result_session_id = getattr(message, "session_id", "") or result_session_id
                    current_session_id = result_session_id

                    cost = getattr(message, "total_cost_usd", 0) or 0
                    duration = getattr(message, "duration_ms", 0) or 0

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

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("Agent SDK error")
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

                # 取消正在进行的流
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

                stream_task = asyncio.create_task(
                    _run_agent(
                        message=message,
                        session_id=msg.get("session_id"),
                        model=msg.get("model"),
                        cwd=msg.get("cwd"),
                        system_prompt=msg.get("system_prompt"),
                        append_system_prompt=msg.get("append_system_prompt"),
                        effort=msg.get("effort"),
                        allowed_tools=msg.get("allowed_tools"),
                        disallowed_tools=msg.get("disallowed_tools"),
                        permission_mode=msg.get("permission_mode"),
                        max_budget=msg.get("max_budget"),
                        continue_session=msg.get("continue", False),
                    )
                )

            elif msg_type == "new_session":
                # 重置会话，下次 chat 开启新会话
                current_session_id = None
                await _send({
                    "type": "session_reset",
                    "data": {"message": "会话已重置，下次消息将开启新对话"},
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

"""
聊天路由 - 通过 WebSocket 与 Claude 进行自由对话
使用 Anthropic API 实现真正的 token 级流式输出
"""

import asyncio
import json
import logging
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


def _load_tc_config() -> dict:
    """从 tc_global_config.json 读取配置"""
    from .tc_config import _read
    return _read()


def _get_api_key(config: dict) -> str:
    """从配置中获取 API key，优先级：config.api.apiKey > env ANTHROPIC_API_KEY"""
    import os
    key = config.get("api", {}).get("apiKey", "")
    if not key:
        key = os.environ.get("ANTHROPIC_API_KEY", "")
    return key


@router.get("/models", summary="获取可用模型列表")
def get_models():
    """返回可用的 Claude 模型列表"""
    return AVAILABLE_MODELS


# ── 会话历史管理（内存存储，按 session_id） ──────────────────────────

_session_histories: dict[str, list[dict]] = {}


def _get_history(session_id: str) -> list[dict]:
    return _session_histories.get(session_id, [])


def _append_history(session_id: str, role: str, content: str):
    if session_id not in _session_histories:
        _session_histories[session_id] = []
    _session_histories[session_id].append({"role": role, "content": content})
    # 保留最近 50 轮对话（100 条消息）
    if len(_session_histories[session_id]) > 100:
        _session_histories[session_id] = _session_histories[session_id][-100:]


# ── WebSocket 聊天处理 ──────────────────────────────────────────


async def handle_chat_ws(ws: WebSocket):
    """
    处理 /ws/chat WebSocket 连接。

    前端发送：
      {"type": "chat", "message": "...", "session_id": "可选", "model": "可选"}
      {"type": "stop"}   — 中断当前生成
      {"type": "ping"}   — 心跳

    后端返回：
      {"type": "chat_chunk", "data": {"text": "...", "session_id": "...", "done": false}, "ts": "..."}
      {"type": "chat_done",  "data": {"session_id": "...", "full_text": "..."}, "ts": "..."}
      {"type": "chat_error", "data": {"error": "..."}, "ts": "..."}
      {"type": "pong", "ts": "..."}
    """
    await ws.accept()

    stream_task: Optional[asyncio.Task] = None

    def _ts() -> str:
        return datetime.utcnow().isoformat()

    async def _send(msg: dict):
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            pass

    async def _run_api_stream(
        message: str,
        session_id: Optional[str] = None,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ):
        """使用 Anthropic API 流式生成回复"""
        import anthropic

        config = _load_tc_config()
        api_key = _get_api_key(config)
        if not api_key:
            await _send({
                "type": "chat_error",
                "data": {"error": "未配置 API Key，请在设置中配置 api.apiKey 或设置环境变量 ANTHROPIC_API_KEY"},
                "ts": _ts(),
            })
            return

        # 确定模型
        model_id = model or config.get("model", {}).get("model", "claude-sonnet-4-6")
        max_tokens = config.get("model", {}).get("maxTokens", 4096)
        endpoint = config.get("api", {}).get("endpoint", "https://api.anthropic.com")

        # 生成/复用 session_id
        import uuid
        sid = session_id or str(uuid.uuid4())

        # 构建消息列表（含历史）
        history = _get_history(sid)
        messages = [*history, {"role": "user", "content": message}]

        # 构建 API 参数
        api_kwargs: dict = {
            "model": model_id,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system_prompt:
            api_kwargs["system"] = system_prompt

        client = anthropic.AsyncAnthropic(
            api_key=api_key,
            base_url=endpoint if endpoint != "https://api.anthropic.com" else None,
        )

        full_text = ""

        try:
            async with client.messages.stream(**api_kwargs) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    await _send({
                        "type": "chat_chunk",
                        "data": {
                            "text": text,
                            "session_id": sid,
                            "done": False,
                        },
                        "ts": _ts(),
                    })

            # 保存到历史
            _append_history(sid, "user", message)
            _append_history(sid, "assistant", full_text)

            await _send({
                "type": "chat_done",
                "data": {
                    "session_id": sid,
                    "full_text": full_text,
                },
                "ts": _ts(),
            })

        except asyncio.CancelledError:
            raise
        except anthropic.AuthenticationError:
            await _send({
                "type": "chat_error",
                "data": {"error": "API Key 无效，请检查配置"},
                "ts": _ts(),
            })
        except anthropic.RateLimitError:
            await _send({
                "type": "chat_error",
                "data": {"error": "API 请求频率超限，请稍后再试"},
                "ts": _ts(),
            })
        except Exception as e:
            logger.exception("API stream error")
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
                        "data": {"session_id": "", "full_text": "[已中断]"},
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

                # 如果有正在进行的生成，先取消
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

                stream_task = asyncio.create_task(
                    _run_api_stream(
                        message=message,
                        session_id=msg.get("session_id"),
                        model=msg.get("model"),
                        system_prompt=msg.get("system_prompt"),
                    )
                )

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

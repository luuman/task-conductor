"""
聊天路由 - 通过 WebSocket 与 Claude CLI 进行自由对话
使用 --output-format text 模式实现逐字符流式输出
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


# ── WebSocket 聊天处理 ──────────────────────────────────────────

# 流式读取缓冲：每积攒 N 字节或 T 毫秒发送一次
CHUNK_FLUSH_BYTES = 6       # 几个字符就推一次，体验更流畅
CHUNK_FLUSH_INTERVAL = 0.05  # 50ms 强制 flush


async def handle_chat_ws(ws: WebSocket):
    """
    处理 /ws/chat WebSocket 连接。
    使用 claude CLI text 模式，逐字符流式推送。
    """
    await ws.accept()

    active_proc: Optional[asyncio.subprocess.Process] = None
    stream_task: Optional[asyncio.Task] = None

    def _ts() -> str:
        return datetime.utcnow().isoformat()

    async def _send(msg: dict):
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            pass

    async def _run_claude(
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
        """启动 claude -p 子进程，text 模式流式读取"""
        nonlocal active_proc

        cmd = [
            "claude", "-p", message,
            "--dangerously-skip-permissions",
            "--output-format", "text",
        ]

        if session_id:
            cmd.extend(["--resume", session_id])
        elif continue_session:
            cmd.append("--continue")

        if model:
            cmd.extend(["--model", model])

        if system_prompt:
            cmd.extend(["--system-prompt", system_prompt])

        if append_system_prompt:
            cmd.extend(["--append-system-prompt", append_system_prompt])

        if effort and effort in ("low", "medium", "high"):
            cmd.extend(["--effort", effort])

        if allowed_tools:
            cmd.extend(["--allowed-tools", ",".join(allowed_tools)])

        if disallowed_tools:
            cmd.extend(["--disallowed-tools", ",".join(disallowed_tools)])

        if permission_mode and permission_mode in ("acceptEdits", "bypassPermissions", "default", "plan", "auto"):
            cmd.extend(["--permission-mode", permission_mode])

        if max_budget and max_budget > 0:
            cmd.extend(["--max-budget-usd", str(max_budget)])

        work_dir = cwd or os.path.expanduser("~")

        # 清除 Claude Code 环境变量
        env = {**os.environ}
        for k in list(env):
            if k.startswith("CLAUDE") or k == "CLAUDECODE":
                env.pop(k, None)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=work_dir,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            active_proc = proc

            full_text = ""
            result_session_id = session_id or ""

            # 从 stderr 异步提取 session_id
            async def _read_stderr():
                nonlocal result_session_id
                while True:
                    line = await proc.stderr.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="replace").strip()
                    # Claude CLI 可能在 stderr 输出 session info
                    if "session_id" in text or "Session:" in text:
                        # 尝试提取 UUID 格式的 session_id
                        import re
                        m = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', text)
                        if m:
                            result_session_id = m.group(0)

            stderr_task = asyncio.create_task(_read_stderr())

            # 流式读 stdout：按小块读取，定时 flush
            buf = ""
            while True:
                try:
                    chunk = await asyncio.wait_for(
                        proc.stdout.read(64),  # 每次最多读 64 字节
                        timeout=CHUNK_FLUSH_INTERVAL,
                    )
                except asyncio.TimeoutError:
                    # 超时：如果 buf 有内容就 flush
                    if buf:
                        full_text += buf
                        await _send({
                            "type": "chat_chunk",
                            "data": {"text": buf, "session_id": result_session_id, "done": False},
                            "ts": _ts(),
                        })
                        buf = ""
                    continue

                if not chunk:
                    # EOF
                    break

                text = chunk.decode("utf-8", errors="replace")
                buf += text

                # 达到阈值就推送
                if len(buf) >= CHUNK_FLUSH_BYTES:
                    full_text += buf
                    await _send({
                        "type": "chat_chunk",
                        "data": {"text": buf, "session_id": result_session_id, "done": False},
                        "ts": _ts(),
                    })
                    buf = ""

            # flush 剩余
            if buf:
                full_text += buf
                await _send({
                    "type": "chat_chunk",
                    "data": {"text": buf, "session_id": result_session_id, "done": False},
                    "ts": _ts(),
                })

            await proc.wait()
            await stderr_task

            await _send({
                "type": "chat_done",
                "data": {"session_id": result_session_id, "full_text": full_text},
                "ts": _ts(),
            })

        except asyncio.CancelledError:
            if active_proc and active_proc.returncode is None:
                active_proc.kill()
                await active_proc.wait()
            raise
        except Exception as e:
            logger.exception("Claude CLI error")
            await _send({
                "type": "chat_error",
                "data": {"error": str(e)},
                "ts": _ts(),
            })
        finally:
            active_proc = None

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

                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

                stream_task = asyncio.create_task(
                    _run_claude(
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
        if active_proc and active_proc.returncode is None:
            active_proc.kill()

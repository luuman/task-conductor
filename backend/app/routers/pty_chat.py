"""
PTY 聊天路由 - 长连接 WebSocket + claude -p --resume 多轮对话
WebSocket 保持长连接，每条消息用 claude -p "msg" --resume <session_id> 执行。
兼顾连接稳定性和可靠的输出解析。
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# 流式读取配置
CHUNK_FLUSH_BYTES = 6
CHUNK_FLUSH_INTERVAL = 0.05


async def handle_pty_chat_ws(ws: WebSocket):
    """处理 /ws/pty-chat WebSocket 长连接"""
    await ws.accept()

    session_id: Optional[str] = None  # Claude session ID（跨消息保持）
    active_proc: Optional[asyncio.subprocess.Process] = None
    stream_task: Optional[asyncio.Task] = None
    cwd: str = os.path.expanduser("~")

    def _ts() -> str:
        return datetime.utcnow().isoformat()

    async def _send(msg: dict):
        try:
            await ws.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            pass

    async def _run_claude(message: str):
        """用 claude -p --resume 执行单条消息"""
        nonlocal active_proc, session_id

        cmd = [
            "claude", "-p", message,
            "--dangerously-skip-permissions",
            "--output-format", "text",
        ]

        if session_id:
            cmd.extend(["--resume", session_id])

        env = {**os.environ}
        for k in list(env):
            if k.startswith("CLAUDE") or k == "CLAUDECODE":
                env.pop(k, None)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            active_proc = proc

            full_text = ""

            # 从 stderr 异步提取 session_id
            async def _read_stderr():
                nonlocal session_id
                while True:
                    line = await proc.stderr.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="replace").strip()
                    if "session_id" in text or "Session:" in text:
                        m = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', text)
                        if m:
                            session_id = m.group(0)

            stderr_task = asyncio.create_task(_read_stderr())

            # 流式读 stdout
            buf = ""
            while True:
                try:
                    chunk = await asyncio.wait_for(
                        proc.stdout.read(64),
                        timeout=CHUNK_FLUSH_INTERVAL,
                    )
                except asyncio.TimeoutError:
                    if buf:
                        full_text += buf
                        await _send({
                            "type": "chat_chunk",
                            "data": {"text": buf, "session_id": session_id or "", "done": False},
                            "ts": _ts(),
                        })
                        buf = ""
                    continue

                if not chunk:
                    break

                text = chunk.decode("utf-8", errors="replace")
                buf += text

                if len(buf) >= CHUNK_FLUSH_BYTES:
                    full_text += buf
                    await _send({
                        "type": "chat_chunk",
                        "data": {"text": buf, "session_id": session_id or "", "done": False},
                        "ts": _ts(),
                    })
                    buf = ""

            if buf:
                full_text += buf
                await _send({
                    "type": "chat_chunk",
                    "data": {"text": buf, "session_id": session_id or "", "done": False},
                    "ts": _ts(),
                })

            await proc.wait()
            await stderr_task

            await _send({
                "type": "chat_done",
                "data": {"session_id": session_id or "", "full_text": full_text},
                "ts": _ts(),
            })

        except asyncio.CancelledError:
            if active_proc and active_proc.returncode is None:
                active_proc.kill()
                await active_proc.wait()
            raise
        except Exception as e:
            logger.exception("Claude CLI error in PTY chat")
            await _send({
                "type": "chat_error",
                "data": {"error": str(e)},
                "ts": _ts(),
            })
        finally:
            active_proc = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send({"type": "chat_error", "data": {"error": "无效 JSON"}, "ts": _ts()})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await _send({"type": "pong", "ts": _ts()})

            elif msg_type == "init":
                # 初始化：设置 cwd 和可选的 resume session
                cwd = msg.get("cwd") or os.path.expanduser("~")
                resume_sid = msg.get("resume_session_id")
                if resume_sid:
                    session_id = resume_sid
                await _send({
                    "type": "pty_ready",
                    "data": {"session_id": session_id or "new", "status": "alive"},
                    "ts": _ts(),
                })

            elif msg_type == "chat":
                message = msg.get("message", "").strip()
                if not message:
                    await _send({"type": "chat_error", "data": {"error": "消息不能为空"}, "ts": _ts()})
                    continue

                # 取消上一个正在进行的任务
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

                stream_task = asyncio.create_task(_run_claude(message))

            elif msg_type == "stop":
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass
                    await _send({
                        "type": "chat_done",
                        "data": {"session_id": session_id or "", "full_text": "[已中断]"},
                        "ts": _ts(),
                    })

            elif msg_type == "status":
                await _send({
                    "type": "pty_status",
                    "data": {"alive": True, "session_id": session_id or ""},
                    "ts": _ts(),
                })

            else:
                await _send({
                    "type": "chat_error",
                    "data": {"error": f"未知消息类型: {msg_type}"},
                    "ts": _ts(),
                })

    except WebSocketDisconnect:
        pass
    finally:
        # 清理活跃进程
        if stream_task and not stream_task.done():
            stream_task.cancel()
            try:
                await stream_task
            except asyncio.CancelledError:
                pass
        if active_proc and active_proc.returncode is None:
            active_proc.kill()

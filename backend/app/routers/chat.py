"""
聊天路由 - 通过 WebSocket 与 Claude 进行自由对话
"""

import asyncio
import json
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.claude.stream import parse_line, extract_text, extract_final_text

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


async def handle_chat_ws(ws: WebSocket):
    """
    处理 /ws/chat WebSocket 连接。

    前端发送：
      {"type": "chat", "message": "...", "session_id": "可选", "model": "可选", "cwd": "可选"}
      {"type": "stop"}   — 中断当前生成
      {"type": "ping"}   — 心跳

    后端返回：
      {"type": "chat_chunk", "data": {"text": "...", "session_id": "...", "done": false}, "ts": "..."}
      {"type": "chat_done",  "data": {"session_id": "...", "full_text": "..."}, "ts": "..."}
      {"type": "chat_error", "data": {"error": "..."}, "ts": "..."}
      {"type": "pong", "ts": "..."}
    """
    await ws.accept()

    # 当前活跃的子进程
    active_proc: Optional[asyncio.subprocess.Process] = None
    # 用于取消流式读取任务
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
        """启动 claude -p 子进程并流式返回结果"""
        nonlocal active_proc

        cmd = [
            "claude", "-p", message,
            "--dangerously-skip-permissions",
            "--output-format", "stream-json",
            "--verbose",
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

        # 清除 Claude Code 环境变量，允许从会话内启动子进程
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
                stderr=asyncio.subprocess.STDOUT,
                env=env,
                limit=16 * 1024 * 1024,  # 16MB，避免长 JSON 行超限
            )
            active_proc = proc

            full_text = ""
            final_text = ""
            result_session_id = session_id or ""

            async for line in proc.stdout:
                raw = line.decode("utf-8", errors="replace")
                event = parse_line(raw)
                if not event:
                    continue

                # 尝试从 system 事件中获取 session_id
                if event.get("type") == "system" and event.get("session_id"):
                    result_session_id = event["session_id"]

                # 流式增量文本 → 立即推送
                text = extract_text(event)
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

                # 最终完整文本（兜底，不发 chunk）
                ft = extract_final_text(event)
                if ft:
                    final_text = ft

            await proc.wait()

            await _send({
                "type": "chat_done",
                "data": {
                    "session_id": result_session_id,
                    "full_text": full_text or final_text,
                },
                "ts": _ts(),
            })

        except asyncio.CancelledError:
            # 被 stop 命令取消
            if active_proc and active_proc.returncode is None:
                active_proc.kill()
                await active_proc.wait()
            raise
        except Exception as e:
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
                # 中断当前生成
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

                # 启动新的流式生成任务
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
        # 连接断开，清理子进程
        if stream_task and not stream_task.done():
            stream_task.cancel()
            try:
                await stream_task
            except asyncio.CancelledError:
                pass
        if active_proc and active_proc.returncode is None:
            active_proc.kill()

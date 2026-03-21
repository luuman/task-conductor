"""
PTY 聊天路由 - 通过 pexpect 维护长期运行的 Claude 交互进程
实现真正的多轮对话，无需每次重启进程
"""

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Optional

import pexpect
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# ANSI 转义码正则
ANSI_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[\?]?[0-9;]*[hlm]')
# Claude CLI prompt 检测：等待输入的提示符
PROMPT_RE = re.compile(r'[>❯]\s*$')
# 输出结束检测：超过此时长无新输出视为结束
OUTPUT_IDLE_TIMEOUT = 1.5  # 秒
# 每次读取的字节数
READ_CHUNK = 256


def strip_ansi(text: str) -> str:
    """去除 ANSI 转义码"""
    return ANSI_RE.sub('', text)


class PtySession:
    """管理单个 PTY Claude 进程"""

    def __init__(self, session_id: str, cwd: str, resume_session_id: Optional[str] = None):
        self.session_id = session_id
        self.cwd = cwd
        self.resume_session_id = resume_session_id
        self.child: Optional[pexpect.spawn] = None
        self.created_at = datetime.utcnow()
        self._lock = asyncio.Lock()

    def spawn(self):
        """启动 Claude 交互进程"""
        env = {**os.environ}
        for k in list(env):
            if k.startswith("CLAUDE") or k == "CLAUDECODE":
                env.pop(k, None)
        # 设置 TERM 以获得更干净的输出
        env["TERM"] = "dumb"

        args = ["--dangerously-skip-permissions"]
        if self.resume_session_id:
            args.extend(["--resume", self.resume_session_id])

        self.child = pexpect.spawn(
            "claude",
            args=args,
            cwd=self.cwd,
            env=env,
            encoding="utf-8",
            timeout=300,
            maxread=4096,
            dimensions=(40, 120),
        )
        # 等待初始 prompt
        self.child.setecho(False)
        logger.info(f"PTY session {self.session_id} spawned, cwd={self.cwd}, resume={self.resume_session_id}")

    def is_alive(self) -> bool:
        return self.child is not None and self.child.isalive()

    def kill(self):
        if self.child and self.child.isalive():
            self.child.sendcontrol('c')
            try:
                self.child.terminate(force=True)
            except Exception:
                pass
        self.child = None
        logger.info(f"PTY session {self.session_id} killed")

    async def send_message(self, message: str, on_chunk):
        """
        发送消息到 Claude 并异步回调输出块。
        on_chunk: async callable(text: str)
        """
        if not self.is_alive():
            raise RuntimeError("PTY 进程未运行")

        async with self._lock:
            loop = asyncio.get_event_loop()

            # 先清空残留输出
            await loop.run_in_executor(None, self._drain_buffer)

            # 发送消息
            self.child.sendline(message)

            # 异步读取输出
            full_text = ""
            idle_count = 0
            skip_echo = True  # 跳过输入回显

            while True:
                try:
                    chunk = await asyncio.wait_for(
                        loop.run_in_executor(None, self._read_nonblock),
                        timeout=OUTPUT_IDLE_TIMEOUT,
                    )
                except asyncio.TimeoutError:
                    idle_count += 1
                    # 连续 idle 超过阈值，认为输出结束
                    if idle_count >= 1 and full_text:
                        break
                    if idle_count >= 3:
                        break
                    continue

                if chunk is None:
                    # 进程退出
                    break

                idle_count = 0
                cleaned = strip_ansi(chunk)

                if not cleaned:
                    continue

                # 跳过第一行的输入回显
                if skip_echo:
                    # 检查是否包含用户输入
                    if message[:20] in cleaned:
                        # 去掉回显部分，保留后面的内容
                        idx = cleaned.find(message[:20])
                        after = cleaned[idx + len(message):]
                        cleaned = after.lstrip('\r\n')
                        skip_echo = False
                        if not cleaned:
                            continue
                    elif cleaned.strip() == '':
                        continue
                    else:
                        skip_echo = False

                # 检测是否到达 prompt（说明 Claude 回答完了等待下一次输入）
                if PROMPT_RE.search(cleaned):
                    # 去掉尾部 prompt 符号
                    cleaned = PROMPT_RE.sub('', cleaned).rstrip()
                    if cleaned:
                        full_text += cleaned
                        await on_chunk(cleaned)
                    break

                full_text += cleaned
                await on_chunk(cleaned)

            return full_text

    def _drain_buffer(self):
        """清空缓冲区中的残留数据"""
        try:
            while True:
                self.child.read_nonblocking(1024, timeout=0.1)
        except (pexpect.TIMEOUT, pexpect.EOF):
            pass

    def _read_nonblock(self) -> Optional[str]:
        """阻塞读取一块数据（在线程池中运行）"""
        try:
            return self.child.read_nonblocking(READ_CHUNK, timeout=OUTPUT_IDLE_TIMEOUT)
        except pexpect.TIMEOUT:
            return ""
        except pexpect.EOF:
            return None

    def send_interrupt(self):
        """发送 Ctrl+C 中断当前生成"""
        if self.is_alive():
            self.child.sendcontrol('c')


class PtyManager:
    """PTY 会话管理器（单例）"""

    _instance: Optional["PtyManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._sessions = {}
        return cls._instance

    def create(self, ws_id: str, cwd: str, resume_session_id: Optional[str] = None) -> PtySession:
        self.cleanup(ws_id)
        session = PtySession(session_id=ws_id, cwd=cwd, resume_session_id=resume_session_id)
        session.spawn()
        self._sessions[ws_id] = session
        return session

    def get(self, ws_id: str) -> Optional[PtySession]:
        session = self._sessions.get(ws_id)
        if session and not session.is_alive():
            del self._sessions[ws_id]
            return None
        return session

    def cleanup(self, ws_id: str):
        session = self._sessions.pop(ws_id, None)
        if session:
            session.kill()

    def cleanup_all(self):
        for sid in list(self._sessions):
            self.cleanup(sid)


pty_manager = PtyManager()


async def handle_pty_chat_ws(ws: WebSocket):
    """处理 /ws/pty-chat WebSocket 连接"""
    await ws.accept()

    ws_id = str(uuid.uuid4())[:8]
    session: Optional[PtySession] = None

    def _ts() -> str:
        return datetime.utcnow().isoformat()

    async def _send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    try:
        while True:
            raw = await ws.receive_text()
            import json
            try:
                msg = json.loads(raw)
            except Exception:
                await _send({"type": "chat_error", "data": {"error": "无效 JSON"}, "ts": _ts()})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await _send({"type": "pong", "ts": _ts()})

            elif msg_type == "init":
                # 初始化 PTY 会话
                cwd = msg.get("cwd") or os.path.expanduser("~")
                try:
                    session = pty_manager.create(ws_id, cwd)
                    # 等待 Claude CLI 初始化完成
                    await asyncio.sleep(3)
                    # 清空初始化输出
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, session._drain_buffer)
                    await _send({
                        "type": "pty_ready",
                        "data": {"session_id": ws_id, "status": "alive"},
                        "ts": _ts(),
                    })
                except Exception as e:
                    logger.exception("PTY spawn failed")
                    await _send({
                        "type": "chat_error",
                        "data": {"error": f"PTY 启动失败: {e}"},
                        "ts": _ts(),
                    })

            elif msg_type == "chat":
                message = msg.get("message", "").strip()
                if not message:
                    await _send({"type": "chat_error", "data": {"error": "消息不能为空"}, "ts": _ts()})
                    continue

                if not session or not session.is_alive():
                    await _send({
                        "type": "chat_error",
                        "data": {"error": "PTY 未就绪，请先发送 init"},
                        "ts": _ts(),
                    })
                    continue

                try:
                    async def on_chunk(text: str):
                        await _send({
                            "type": "chat_chunk",
                            "data": {"text": text, "session_id": ws_id, "done": False},
                            "ts": _ts(),
                        })

                    full_text = await session.send_message(message, on_chunk)
                    await _send({
                        "type": "chat_done",
                        "data": {"session_id": ws_id, "full_text": full_text or ""},
                        "ts": _ts(),
                    })
                except Exception as e:
                    logger.exception("PTY chat error")
                    await _send({
                        "type": "chat_error",
                        "data": {"error": str(e)},
                        "ts": _ts(),
                    })

            elif msg_type == "stop":
                if session and session.is_alive():
                    session.send_interrupt()
                    await _send({
                        "type": "chat_done",
                        "data": {"session_id": ws_id, "full_text": "[已中断]"},
                        "ts": _ts(),
                    })

            elif msg_type == "status":
                alive = session.is_alive() if session else False
                await _send({
                    "type": "pty_status",
                    "data": {"alive": alive, "session_id": ws_id},
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
        pty_manager.cleanup(ws_id)

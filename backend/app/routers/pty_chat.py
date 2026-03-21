"""
PTY 聊天路由 - 真 PTY + WebSocket 字节透传
后端用 pty.fork() 启动 Claude CLI，原始字节通过 WebSocket 双向透传。
前端用 xterm.js 渲染，实现完整终端体验。
"""

import asyncio
import fcntl
import logging
import os
import pty
import signal
import struct
import termios
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class PtyProcess:
    """管理一个 PTY 子进程"""

    def __init__(self, cwd: str):
        self.cwd = cwd
        self.pid: Optional[int] = None
        self.fd: Optional[int] = None

    def spawn(self, cols: int = 120, rows: int = 40):
        """fork 一个 PTY 子进程运行 claude"""
        env = {**os.environ}
        for k in list(env):
            if k.startswith("CLAUDE") or k == "CLAUDECODE":
                env.pop(k, None)
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"

        pid, fd = pty.openpty()
        child_pid = os.fork()

        if child_pid == 0:
            # 子进程
            os.close(pid)
            os.setsid()
            fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            # 把 fd 设为 stdin/stdout/stderr
            os.dup2(fd, 0)
            os.dup2(fd, 1)
            os.dup2(fd, 2)
            if fd > 2:
                os.close(fd)
            os.chdir(self.cwd)
            os.execvpe("claude", ["claude", "--dangerously-skip-permissions"], env)
        else:
            # 父进程
            os.close(fd)
            self.pid = child_pid
            self.fd = pid
            # 设置 PTY 尺寸
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            # 设置非阻塞
            flags = fcntl.fcntl(self.fd, fcntl.F_GETFL)
            fcntl.fcntl(self.fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            logger.info(f"PTY spawned: pid={child_pid}, fd={pid}, cwd={self.cwd}")

    def resize(self, cols: int, rows: int):
        if self.fd is not None:
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def write(self, data: bytes):
        if self.fd is not None:
            os.write(self.fd, data)

    def read(self, size: int = 4096) -> Optional[bytes]:
        if self.fd is None:
            return None
        try:
            return os.read(self.fd, size)
        except (OSError, IOError):
            return None

    def is_alive(self) -> bool:
        if self.pid is None:
            return False
        try:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            return pid == 0
        except ChildProcessError:
            return False

    def kill(self):
        if self.pid is not None:
            try:
                os.kill(self.pid, signal.SIGTERM)
                os.waitpid(self.pid, 0)
            except (ProcessLookupError, ChildProcessError):
                pass
        if self.fd is not None:
            try:
                os.close(self.fd)
            except OSError:
                pass
        self.pid = None
        self.fd = None


async def handle_pty_chat_ws(ws: WebSocket):
    """处理 /ws/pty-chat WebSocket 连接，双向透传 PTY 数据"""
    await ws.accept()

    proc: Optional[PtyProcess] = None
    read_task: Optional[asyncio.Task] = None

    async def _read_loop():
        """持续读取 PTY 输出并通过 WebSocket 发送"""
        loop = asyncio.get_event_loop()
        while proc and proc.is_alive():
            try:
                data = await loop.run_in_executor(None, _blocking_read)
                if data:
                    await ws.send_bytes(data)
                else:
                    await asyncio.sleep(0.01)
            except Exception:
                break

    def _blocking_read() -> Optional[bytes]:
        """阻塞读取 PTY（在线程池中运行）"""
        if proc is None or proc.fd is None:
            return None
        import select
        r, _, _ = select.select([proc.fd], [], [], 0.1)
        if r:
            try:
                return os.read(proc.fd, 4096)
            except (OSError, IOError):
                return None
        return None

    try:
        while True:
            msg = await ws.receive()

            if msg["type"] == "websocket.receive":
                if "bytes" in msg and msg["bytes"]:
                    # 二进制数据：用户终端输入 → 写入 PTY
                    if proc and proc.is_alive():
                        proc.write(msg["bytes"])

                elif "text" in msg and msg["text"]:
                    import json
                    try:
                        data = json.loads(msg["text"])
                    except json.JSONDecodeError:
                        continue

                    cmd = data.get("type", "")

                    if cmd == "init":
                        # 启动 PTY 进程
                        cwd = data.get("cwd") or os.path.expanduser("~")
                        cols = data.get("cols", 120)
                        rows = data.get("rows", 40)

                        # 清理旧进程
                        if proc:
                            proc.kill()
                        if read_task and not read_task.done():
                            read_task.cancel()
                            try:
                                await read_task
                            except asyncio.CancelledError:
                                pass

                        proc = PtyProcess(cwd=cwd)
                        proc.spawn(cols=cols, rows=rows)

                        # 启动读取循环
                        read_task = asyncio.create_task(_read_loop())

                        await ws.send_text(json.dumps({
                            "type": "pty_ready",
                            "data": {"status": "alive"},
                        }))

                    elif cmd == "resize":
                        cols = data.get("cols", 120)
                        rows = data.get("rows", 40)
                        if proc:
                            proc.resize(cols, rows)

                    elif cmd == "ping":
                        await ws.send_text(json.dumps({"type": "pong"}))

            elif msg["type"] == "websocket.disconnect":
                break

    except WebSocketDisconnect:
        pass
    finally:
        if read_task and not read_task.done():
            read_task.cancel()
            try:
                await read_task
            except asyncio.CancelledError:
                pass
        if proc:
            proc.kill()

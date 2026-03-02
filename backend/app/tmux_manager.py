# backend/app/tmux_manager.py
import subprocess
import shutil
from typing import Optional

TMUX_PREFIX = "tc_"

def tmux_available() -> bool:
    return shutil.which("tmux") is not None

def create_session(name: str, cwd: str = "/tmp") -> bool:
    """创建 tmux 会话，返回是否成功"""
    if not tmux_available():
        return False
    session_name = f"{TMUX_PREFIX}{name}"
    result = subprocess.run(
        ["tmux", "new-session", "-d", "-s", session_name, "-c", cwd],
        capture_output=True
    )
    return result.returncode == 0

def send_command(name: str, command: str) -> bool:
    """向 tmux 会话发送命令"""
    if not tmux_available():
        return False
    session_name = f"{TMUX_PREFIX}{name}"
    result = subprocess.run(
        ["tmux", "send-keys", "-t", session_name, command, "Enter"],
        capture_output=True
    )
    return result.returncode == 0

def list_sessions() -> list[str]:
    """列出所有 tc_ 前缀的 tmux 会话"""
    if not tmux_available():
        return []
    result = subprocess.run(
        ["tmux", "list-sessions", "-F", "#{session_name}"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return []
    return [
        s.removeprefix(TMUX_PREFIX)
        for s in result.stdout.strip().split("\n")
        if s.startswith(TMUX_PREFIX)
    ]

def kill_session(name: str) -> bool:
    if not tmux_available():
        return False
    session_name = f"{TMUX_PREFIX}{name}"
    result = subprocess.run(
        ["tmux", "kill-session", "-t", session_name],
        capture_output=True
    )
    return result.returncode == 0

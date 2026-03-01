import asyncio
import os
from typing import Optional, AsyncIterator

class ClaudePool:
    _instance: Optional["ClaudePool"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._processes = {}
        return cls._instance

    def build_command(self, prompt: str, worktree_path: str) -> list[str]:
        return [
            "claude", "-p", prompt,
            "--dangerously-skip-permissions",
            "--output-format", "stream-json",
            "--verbose",
        ]

    async def run(
        self,
        task_id: int,
        prompt: str,
        worktree_path: str,
        log_file: str,
    ) -> AsyncIterator[dict]:
        """启动 Claude Code 并以异步迭代器方式返回事件流"""
        from .stream import parse_line

        cmd = self.build_command(prompt, worktree_path)
        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=worktree_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self._processes[task_id] = proc

        with open(log_file, "w") as f:
            async for line in proc.stdout:
                raw = line.decode("utf-8", errors="replace")
                f.write(raw)
                event = parse_line(raw)
                if event:
                    yield event

        await proc.wait()
        self._processes.pop(task_id, None)

    def kill(self, task_id: int):
        proc = self._processes.get(task_id)
        if proc:
            proc.kill()

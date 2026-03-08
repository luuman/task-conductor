import asyncio
import os
import time
from typing import Optional, AsyncIterator
from .metrics_store import metrics_store


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

        metric = metrics_store.start_call(task_id)

        # 清除 CLAUDECODE 环境变量，允许从 Claude Code 会话内启动子进程
        env = {**os.environ}
        env.pop("CLAUDECODE", None)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=worktree_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        self._processes[task_id] = proc

        try:
            with open(log_file, "w") as f:
                async for line in proc.stdout:
                    raw = line.decode("utf-8", errors="replace")
                    f.write(raw)
                    event = parse_line(raw)
                    if event:
                        content = event.get("content") or event.get("result", "")
                        if content:
                            if metric.ttft is None:
                                metric.ttft = time.time() - metric.started_at
                            metric.char_count += len(str(content))
                        yield event
            await proc.wait()
            metric.success = (proc.returncode == 0)
        except Exception:
            metric.success = False
            raise
        finally:
            metrics_store.finish_call(metric)
            self._processes.pop(task_id, None)

    def kill(self, task_id: int):
        proc = self._processes.get(task_id)
        if proc:
            proc.kill()

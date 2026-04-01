"""管理 dev server 子进程的单例 ProcessManager"""
import asyncio
import socket
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ProcessInfo:
    task_id: int
    pid: int
    port: int
    cwd: str
    command: str
    started_at: datetime = field(default_factory=datetime.utcnow)


class ProcessManager:
    """管理 dev server 子进程，单例"""
    _instance: "ProcessManager | None" = None
    _processes: dict[int, ProcessInfo]
    _procs: dict[int, asyncio.subprocess.Process]

    def __new__(cls) -> "ProcessManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._processes = {}
            cls._instance._procs = {}
        return cls._instance

    def _find_free_port(self, start: int = 3700) -> int:
        port = start
        used = {info.port for info in self._processes.values()}
        while port < 4000:
            if port not in used:
                with socket.socket() as s:
                    try:
                        s.bind(("", port))
                        return port
                    except OSError:
                        pass
            port += 1
        raise RuntimeError("无可用端口（3700-3999）")

    async def start(self, task_id: int, cwd: str, command: str) -> int:
        if task_id in self._processes:
            return self._processes[task_id].port
        port = self._find_free_port()
        env_patch = {"PORT": str(port), "VITE_PORT": str(port)}
        import os
        env = {**os.environ, **env_patch}
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        info = ProcessInfo(
            task_id=task_id, pid=proc.pid, port=port,
            cwd=cwd, command=command,
        )
        self._processes[task_id] = info
        self._procs[task_id] = proc
        return port

    async def stop(self, task_id: int) -> None:
        proc = self._procs.pop(task_id, None)
        self._processes.pop(task_id, None)
        if proc and proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                proc.kill()

    async def stop_all(self) -> None:
        for task_id in list(self._processes.keys()):
            await self.stop(task_id)

    def list(self) -> list[ProcessInfo]:
        return list(self._processes.values())

    def get_port(self, task_id: int) -> int | None:
        info = self._processes.get(task_id)
        return info.port if info else None


process_manager = ProcessManager()

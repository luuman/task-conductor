# backend/app/scheduler.py
"""
ProjectScheduler：每个项目维护任务队列 + 依赖图。

调度规则（smart 模式）：
  1. 任务没有未完成的前置依赖 → 可进入 ready 状态
  2. ready 任务数 ≤ project.max_parallel → 立即启动（分配 worktree）
  3. ready 任务超出 max_parallel → 排队等待空位
  4. 某任务完成 → 检查所有排队中的任务，把依赖已满足的移入 ready

mode 值：
  smart    = 有依赖→等待，无依赖→并行（默认）
  queue    = 全部串行，一次只跑一个
  parallel = 忽略依赖，全部并行（受 max_parallel 限制）
"""
import asyncio
import json
import logging
import os
from datetime import datetime
from sqlalchemy.orm import Session
from .database import engine
from .models import Task, Project
from .ws.manager import manager
from .worktree import create_worktree, remove_worktree, generate_branch_name, is_git_repo

logger = logging.getLogger(__name__)


class ProjectScheduler:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._running: dict[int, set[int]] = {}  # project_id → {task_id}
            cls._instance._lock: asyncio.Lock | None = None
        return cls._instance

    def _get_lock(self) -> asyncio.Lock:
        """延迟初始化 asyncio.Lock，确保在 event loop 启动后创建"""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def _get_depends(self, task: Task) -> list[int]:
        if not task.depends_on:
            return []
        try:
            return json.loads(task.depends_on)
        except Exception:
            return []

    def _deps_satisfied(self, task: Task, db: Session) -> bool:
        """检查所有前置任务是否已完成（status == 'done'）"""
        for dep_id in self._get_depends(task):
            dep = db.get(Task, dep_id)
            if dep is None or dep.status != "done":
                return False
        return True

    def _allocate_worktree(self, task: Task, project: Project) -> str:
        """分配 git worktree 路径（目录由执行层实际创建）"""
        base = project.worktree_base or f"/tmp/tc-worktrees/project-{project.id}"
        return os.path.join(base, f"task-{task.id}")

    def get_running_count(self, project_id: int) -> int:
        return len(self._running.get(project_id, set()))

    async def enqueue(self, task_id: int):
        """将任务加入调度，若条件满足则立即启动，否则置为 queued"""
        async with self._get_lock():
            with Session(engine) as db:
                task = db.get(Task, task_id)
                if not task or task.status not in ("pending", "queued"):
                    return
                project = db.get(Project, task.project_id)
                running_count = len(self._running.get(project.id, set()))

                mode = project.execution_mode
                if mode == "parallel":
                    can_run = True
                elif mode == "queue":
                    can_run = running_count == 0
                else:  # smart（默认）
                    can_run = self._deps_satisfied(task, db)

                if can_run and running_count < project.max_parallel:
                    # 直接启动
                    worktree = self._allocate_worktree(task, project)
                    task.status = "running"
                    task.worktree_path = worktree
                    task.started_at = datetime.utcnow()
                    db.commit()
                    self._running.setdefault(project.id, set()).add(task_id)
                    project_id = project.id
                    asyncio.create_task(self._execute_task(task_id, worktree, project_id))
                    status_out = "running"
                else:
                    # 排队等待
                    task.status = "queued"
                    task.queued_at = datetime.utcnow()
                    db.commit()
                    status_out = "queued"
                    project_id = project.id

        await manager.broadcast(
            f"project:{project_id}", "task_scheduled",
            {"task_id": task_id, "status": status_out}
        )

    async def on_task_done(self, task_id: int, project_id: int):
        """任务完成/失败回调：释放运行槽，触发等待中的任务"""
        async with self._get_lock():
            self._running.get(project_id, set()).discard(task_id)

        # 检查排队中且依赖已满足的任务
        with Session(engine) as db:
            queued_tasks = db.query(Task).filter(
                Task.project_id == project_id,
                Task.status == "queued",
            ).all()
            for t in queued_tasks:
                if self._deps_satisfied(t, db):
                    asyncio.create_task(self.enqueue(t.id))

    async def _execute_task(self, task_id: int, worktree_path: str, project_id: int):
        """驱动任务从当前阶段执行（由调度器内部调用）"""
        from .pipeline.runner import run_pipeline
        try:
            await run_pipeline(task_id, worktree_path)
        except Exception as e:
            logger.error(f"Task {task_id} pipeline error: {e}")
            with Session(engine) as db:
                t = db.get(Task, task_id)
                if t:
                    t.status = "failed"
                    t.finished_at = datetime.utcnow()
                    db.commit()
        # 无论成功失败，完成后释放运行槽
        await self.on_task_done(task_id, project_id)


# 全局单例
scheduler = ProjectScheduler()

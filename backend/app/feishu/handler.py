"""飞书消息处理器：对话模式 & Pipeline 模式。"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from sqlalchemy.orm import Session

from ..claude.pool import ClaudePool
from ..claude.stream import extract_text
from ..database import engine
from ..models import Task, Project
from ..pipeline.runner import run_pipeline
from .cards import (
    build_error_card,
    build_result_card,
    build_task_created_card,
    build_thinking_card,
)
from .client import feishu_client

logger = logging.getLogger(__name__)

LOG_DIR = "/tmp/task-conductor/logs"


def _get_project_cwd(project_id: int) -> str:
    """从 DB 查 Project.repo_url，fallback 到 settings.workspace_root。"""
    with Session(engine) as db:
        project = db.get(Project, project_id)
        if project and project.repo_url:
            return project.repo_url

    # fallback: 从全局设置获取 workspace_root
    from ..routers.settings_router import _load

    settings = _load()
    return settings.get("workspace_root", "/home/sichengli/Documents/code2")


async def handle_chat(prompt: str, chat_id: str, cwd: str) -> None:
    """对话模式：调用 Claude Code 执行，结果发回飞书。"""
    # 1. 发送占位卡片
    msg_id = await feishu_client.send_card(chat_id, build_thinking_card())

    # 2. 记录开始时间
    start_ms = int(time.time() * 1000)

    # 3. 调用 ClaudePool 收集输出
    task_id = int(time.time())
    log_file = os.path.join(LOG_DIR, f"feishu-{task_id}.log")

    try:
        pool = ClaudePool()
        contents: list[str] = []
        async for event in pool.run(task_id, prompt, cwd, log_file):
            content = event.get("content") or event.get("result", "")
            if content:
                contents.append(str(content))

        # 4. 合并所有输出
        result = "\n".join(contents) if contents else "(无输出)"

        # 5. 更新卡片为结果
        cost_ms = int(time.time() * 1000) - start_ms
        await feishu_client.update_card(
            msg_id, build_result_card(result, cost_ms, cwd)
        )
    except Exception as e:
        # 6. 异常时更新为错误卡片
        logger.exception("handle_chat failed: %s", e)
        await feishu_client.update_card(msg_id, build_error_card(str(e)))


async def handle_task_create(
    title: str,
    chat_id: str,
    project_id: int,
    project_name: str,
) -> None:
    """Pipeline 模式：创建任务并启动流水线。"""
    # 1. 在 DB 中创建 Task
    with Session(engine) as db:
        task = Task(
            project_id=project_id,
            title=title,
            description=title,
            stage="input",
            status="pending",
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        task_id = task.id

    # 2. 发送任务创建卡片
    await feishu_client.send_card(
        chat_id, build_task_created_card(task_id, title, project_name)
    )

    # 3. 获取工作目录
    worktree = _get_project_cwd(project_id)

    # 4. 异步启动流水线
    asyncio.create_task(run_pipeline(task_id, worktree))

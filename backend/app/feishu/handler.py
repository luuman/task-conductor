"""飞书消息处理器：对话模式 & Pipeline 模式。"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from sqlalchemy.orm import Session

from ..claude.pool import ClaudePool
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


async def _send_or_reply_card(chat_id: str, card: dict, reply_to: str = "") -> str:
    """发送卡片：有 reply_to 时回复到话题，否则直接发到群。返回 message_id。"""
    if reply_to:
        return await feishu_client.reply_card(reply_to, card)
    return await feishu_client.send_card(chat_id, card)


async def handle_chat(prompt: str, chat_id: str, cwd: str, reply_to: str = "") -> None:
    """对话模式：调用 Claude Code 执行，结果发回飞书。"""
    # 1. 发送占位卡片（话题模式下回复到同一话题）
    msg_id = await _send_or_reply_card(chat_id, build_thinking_card(), reply_to)

    # 2. 记录开始时间
    start_ms = int(time.time() * 1000)

    # 3. 调用 ClaudePool 收集输出
    task_id = int(time.time())
    log_file = os.path.join(LOG_DIR, f"feishu-{task_id}.log")

    try:
        pool = ClaudePool()
        result_text = ""
        assistant_texts: list[str] = []
        async for event in pool.run(task_id, prompt, cwd, log_file):
            etype = event.get("type", "")
            if etype == "result":
                result_text = event.get("result", "")
            elif etype == "assistant":
                # 收集 assistant 文本作为 fallback
                msg = event.get("message", {})
                for block in msg.get("content", []):
                    if isinstance(block, dict) and block.get("type") == "text":
                        t = block.get("text", "").strip()
                        if t:
                            assistant_texts.append(t)

        # 优先用 result（完整回答），fallback 到 assistant 文本拼接
        result = result_text or "\n\n".join(assistant_texts) or "(无输出)"

        # 4. 更新卡片为结果
        cost_ms = int(time.time() * 1000) - start_ms
        await feishu_client.update_card(
            msg_id, build_result_card(result, cost_ms, cwd)
        )
    except Exception as e:
        # 5. 异常时更新为错误卡片
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

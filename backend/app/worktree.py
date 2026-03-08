# backend/app/worktree.py
"""Git Worktree 管理模块：为每个任务创建独立的 git worktree"""
import asyncio
import logging
import re
from .models import Task

logger = logging.getLogger(__name__)


def generate_branch_name(task: Task) -> str:
    """生成分支名: tc/task-{id}/{slug}"""
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", task.title or "untitled")
    slug = slug.strip("-")[:40]
    return f"tc/task-{task.id}/{slug}"


async def is_git_repo(path: str) -> bool:
    """检查路径是否为 git 仓库"""
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", path, "rev-parse", "--git-dir",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    return proc.returncode == 0


async def _branch_exists(repo_path: str, branch_name: str) -> bool:
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", repo_path, "rev-parse", "--verify", f"refs/heads/{branch_name}",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    return proc.returncode == 0


async def create_worktree(repo_path: str, worktree_path: str, branch_name: str) -> str:
    """git worktree add，返回 worktree_path

    如果分支已存在则复用，否则新建分支。
    """
    if await _branch_exists(repo_path, branch_name):
        cmd = ["git", "-C", repo_path, "worktree", "add", worktree_path, branch_name]
    else:
        cmd = ["git", "-C", repo_path, "worktree", "add", worktree_path, "-b", branch_name]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git worktree add failed: {err}")
    logger.info(f"Created worktree: {worktree_path} (branch: {branch_name})")
    return worktree_path


async def remove_worktree(repo_path: str, worktree_path: str):
    """git worktree remove --force"""
    proc = await asyncio.create_subprocess_exec(
        "git", "-C", repo_path, "worktree", "remove", worktree_path, "--force",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        logger.warning(f"git worktree remove failed (non-fatal): {err}")
    else:
        logger.info(f"Removed worktree: {worktree_path}")

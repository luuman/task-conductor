"""Git 操作 API：状态查询、Diff、Stage/Commit、Log/Branch、Stash"""

import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Project

router = APIRouter(prefix="/api/projects", tags=["Git"])

# ── 状态码映射 ──────────────────────────────────────────────────
_STATUS_MAP = {
    "M": "modified",
    "A": "added",
    "D": "deleted",
    "R": "renamed",
    "C": "copied",
}


def _get_db():
    with Session(engine) as session:
        yield session


def _get_project_path(project_id: int, db: Session) -> Path:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    repo = project.repo_url or project.worktree_base
    if not repo:
        raise HTTPException(400, "项目未配置路径")
    p = Path(repo)
    if not p.is_dir():
        raise HTTPException(400, f"项目目录不存在: {repo}")
    return p


def _run_git(cwd: Path, *args: str, timeout: int = 10) -> subprocess.CompletedProcess:
    """运行 git 命令并返回结果"""
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _ensure_git(cwd: Path) -> None:
    """确保目录是 git 仓库，否则抛 400"""
    if not (cwd / ".git").exists():
        # 也可能是 worktree，检查 git rev-parse
        result = _run_git(cwd, "rev-parse", "--git-dir", timeout=5)
        if result.returncode != 0:
            raise HTTPException(400, "该项目不是 Git 仓库")


def _parse_status_code(code: str) -> str:
    """将单个 porcelain 状态码映射为可读名称"""
    return _STATUS_MAP.get(code, "changed")


# ── GET /{project_id}/git/status ─────────────────────────────────

@router.get("/{project_id}/git/status", summary="获取 Git 仓库状态")
def git_status(
    project_id: int,
    db: Session = Depends(_get_db),
):
    """
    解析 `git status --porcelain=v1` 输出，将文件按 staged / unstaged / untracked 分组。

    每个条目格式：`{path: str, status: str}`

    同时返回当前分支名。
    """
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    # 当前分支
    branch_result = _run_git(cwd, "rev-parse", "--abbrev-ref", "HEAD", timeout=5)
    branch = branch_result.stdout.strip() if branch_result.returncode == 0 else None

    # porcelain 状态
    result = _run_git(cwd, "status", "--porcelain=v1")
    if result.returncode != 0:
        raise HTTPException(500, f"git status 失败: {result.stderr.strip()}")

    staged: list[dict] = []
    unstaged: list[dict] = []
    untracked: list[dict] = []

    for line in result.stdout.splitlines():
        if len(line) < 3:
            continue
        x = line[0]  # index (staged) status
        y = line[1]  # worktree (unstaged) status
        raw_path = line[3:]

        # 处理重命名: "R  old -> new"
        if " -> " in raw_path:
            raw_path = raw_path.split(" -> ", 1)[1]

        # untracked
        if x == "?" and y == "?":
            untracked.append({"path": raw_path, "status": "untracked"})
            continue

        # 一个文件可能同时出现在 staged 和 unstaged 中（部分暂存）
        if x != " " and x != "?":
            staged.append({"path": raw_path, "status": _parse_status_code(x)})
        if y != " " and y != "?":
            unstaged.append({"path": raw_path, "status": _parse_status_code(y)})

    return {
        "branch": branch,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
    }


# ── GET /{project_id}/git/diff ───────────────────────────────────

@router.get("/{project_id}/git/diff", summary="获取 Git Diff")
def git_diff(
    project_id: int,
    file: str | None = Query(None, description="指定文件路径（相对于项目根）"),
    staged: bool = Query(False, description="查看已暂存的更改（--cached）"),
    commit: str | None = Query(None, description="查看指定 commit 的更改（commit~1..commit）"),
    db: Session = Depends(_get_db),
):
    """
    获取 Git diff 输出。

    - 默认：工作区未暂存的更改
    - `staged=true`：已暂存（--cached）的更改
    - `commit=<sha>`：指定 commit 与其父 commit 的差异
    - `file=<path>`：仅查看指定文件的 diff
    """
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    args: list[str] = ["diff"]

    if commit:
        # 查看指定 commit 的更改
        args.append(f"{commit}~1..{commit}")
    elif staged:
        args.append("--cached")

    # 可选的文件路径过滤
    if file:
        args.append("--")
        args.append(file)

    result = _run_git(cwd, *args, timeout=15)
    if result.returncode != 0:
        raise HTTPException(500, f"git diff 失败: {result.stderr.strip()}")

    return {"diff": result.stdout}

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


# ── Request Bodies ─────────────────────────────────────────────


class GitFilesBody(BaseModel):
    files: list[str] = []
    all: bool = False


class GitCommitBody(BaseModel):
    message: str


class GitCheckoutBody(BaseModel):
    branch: str
    create: bool = False


class GitStashSaveBody(BaseModel):
    message: str = ""


class GitStashIndexBody(BaseModel):
    index: int = 0


# ── Task 2: Stage / Unstage / Discard / Commit ────────────────


@router.post("/{project_id}/git/stage", summary="暂存文件")
def git_stage(
    project_id: int,
    body: GitFilesBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    if body.all:
        result = _run_git(cwd, "add", "-A")
        if result.returncode != 0:
            raise HTTPException(400, f"git add -A 失败: {result.stderr.strip()}")
    else:
        for f in body.files:
            result = _run_git(cwd, "add", "--", f)
            if result.returncode != 0:
                raise HTTPException(400, f"git add 失败 ({f}): {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/unstage", summary="取消暂存")
def git_unstage(
    project_id: int,
    body: GitFilesBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    if body.all:
        result = _run_git(cwd, "reset", "HEAD")
        if result.returncode != 0:
            raise HTTPException(400, f"git reset HEAD 失败: {result.stderr.strip()}")
    else:
        for f in body.files:
            result = _run_git(cwd, "reset", "HEAD", "--", f)
            if result.returncode != 0:
                raise HTTPException(400, f"git reset 失败 ({f}): {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/discard", summary="丢弃工作区更改")
def git_discard(
    project_id: int,
    body: GitFilesBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    if not body.files:
        raise HTTPException(400, "必须指定要丢弃的文件列表")

    for f in body.files:
        result = _run_git(cwd, "checkout", "--", f)
        if result.returncode != 0:
            raise HTTPException(400, f"git checkout 失败 ({f}): {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/commit", summary="提交更改")
def git_commit(
    project_id: int,
    body: GitCommitBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "commit", "-m", body.message)
    if result.returncode != 0:
        raise HTTPException(400, f"git commit 失败: {result.stderr.strip()}")

    return {"ok": True}


# ── Task 3: Log / Branches / Checkout / Push / Pull / Fetch / Commit Detail ──


@router.get("/{project_id}/git/log", summary="获取提交历史")
def git_log(
    project_id: int,
    limit: int = Query(100, ge=1, le=5000),
    branch: str | None = Query(None),
    all_branches: bool = Query(True),
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    args: list[str] = ["log", f"--format=%H|%P|%an|%aI|%D|%s", f"-{limit}"]

    if all_branches:
        args.append("--all")
    elif branch:
        args.append(branch)

    result = _run_git(cwd, *args, timeout=15)
    if result.returncode != 0:
        raise HTTPException(400, f"git log 失败: {result.stderr.strip()}")

    commits = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 5)
        if len(parts) < 6:
            continue
        hash_, parents_str, author, date, refs_str, message = parts
        parents = parents_str.split() if parents_str.strip() else []
        refs = [r.strip() for r in refs_str.split(",") if r.strip()] if refs_str.strip() else []
        commits.append({
            "hash": hash_,
            "parents": parents,
            "author": author,
            "date": date,
            "refs": refs,
            "message": message,
        })

    return {"commits": commits}


@router.get("/{project_id}/git/branches", summary="获取分支列表")
def git_branches(
    project_id: int,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "branch", "-a", "--format=%(refname:short)|%(HEAD)")
    if result.returncode != 0:
        raise HTTPException(400, f"git branch 失败: {result.stderr.strip()}")

    branches = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 1)
        name = parts[0].strip()
        current = parts[1].strip() == "*" if len(parts) > 1 else False
        remote = name.startswith("origin/") or "/" in name
        branches.append({"name": name, "current": current, "remote": remote})

    return {"branches": branches}


@router.post("/{project_id}/git/checkout", summary="切换分支")
def git_checkout(
    project_id: int,
    body: GitCheckoutBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    args = ["checkout"]
    if body.create:
        args.append("-b")
    args.append(body.branch)

    result = _run_git(cwd, *args)
    if result.returncode != 0:
        raise HTTPException(400, f"git checkout 失败: {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/push", summary="推送到远程")
def git_push(
    project_id: int,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "push", timeout=60)
    if result.returncode != 0:
        raise HTTPException(400, f"git push 失败: {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/pull", summary="拉取远程更新")
def git_pull(
    project_id: int,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "pull", timeout=60)
    if result.returncode != 0:
        raise HTTPException(400, f"git pull 失败: {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/fetch", summary="获取远程引用")
def git_fetch(
    project_id: int,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "fetch", "--all", timeout=60)
    if result.returncode != 0:
        raise HTTPException(400, f"git fetch 失败: {result.stderr.strip()}")

    return {"ok": True}


@router.get("/{project_id}/git/commit/{sha}", summary="获取单个提交详情")
def git_commit_detail(
    project_id: int,
    sha: str,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    # 提交元信息
    meta_result = _run_git(cwd, "log", "-1", f"--format=%H|%P|%an|%aI|%D|%s", sha)
    if meta_result.returncode != 0:
        raise HTTPException(400, f"git log 失败: {meta_result.stderr.strip()}")

    line = meta_result.stdout.strip()
    parts = line.split("|", 5)
    if len(parts) < 6:
        raise HTTPException(400, "无法解析提交信息")

    hash_, parents_str, author, date, refs_str, message = parts
    parents = parents_str.split() if parents_str.strip() else []
    refs = [r.strip() for r in refs_str.split(",") if r.strip()] if refs_str.strip() else []

    # 变更文件列表
    files_result = _run_git(cwd, "diff-tree", "--no-commit-id", "-r", "--name-status", sha)
    changed_files = []
    if files_result.returncode == 0:
        for fline in files_result.stdout.splitlines():
            if not fline.strip():
                continue
            fparts = fline.split("\t", 1)
            if len(fparts) == 2:
                changed_files.append({
                    "status": _parse_status_code(fparts[0].strip()),
                    "path": fparts[1].strip(),
                })

    return {
        "hash": hash_,
        "parents": parents,
        "author": author,
        "date": date,
        "refs": refs,
        "message": message,
        "files": changed_files,
    }


# ── Task 4: Stash ─────────────────────────────────────────────


@router.get("/{project_id}/git/stash", summary="获取 Stash 列表")
def git_stash_list(
    project_id: int,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "stash", "list", "--format=%gd|%gs|%aI")
    if result.returncode != 0:
        raise HTTPException(400, f"git stash list 失败: {result.stderr.strip()}")

    stashes = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 2)
        if len(parts) >= 3:
            stashes.append({
                "ref": parts[0].strip(),
                "message": parts[1].strip(),
                "date": parts[2].strip(),
            })

    return {"stashes": stashes}


@router.post("/{project_id}/git/stash/save", summary="保存 Stash")
def git_stash_save(
    project_id: int,
    body: GitStashSaveBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    args = ["stash", "push"]
    if body.message:
        args.extend(["-m", body.message])

    result = _run_git(cwd, *args)
    if result.returncode != 0:
        raise HTTPException(400, f"git stash push 失败: {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/stash/apply", summary="应用 Stash")
def git_stash_apply(
    project_id: int,
    body: GitStashIndexBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "stash", "apply", f"stash@{{{body.index}}}")
    if result.returncode != 0:
        raise HTTPException(400, f"git stash apply 失败: {result.stderr.strip()}")

    return {"ok": True}


@router.post("/{project_id}/git/stash/drop", summary="删除 Stash")
def git_stash_drop(
    project_id: int,
    body: GitStashIndexBody,
    db: Session = Depends(_get_db),
):
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    result = _run_git(cwd, "stash", "drop", f"stash@{{{body.index}}}")
    if result.returncode != 0:
        raise HTTPException(400, f"git stash drop 失败: {result.stderr.strip()}")

    return {"ok": True}

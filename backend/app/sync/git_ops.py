"""
GitHub 仓库 clone / fetch / commit / push 操作。

使用 subprocess 直接调用 git，通过 PAT 嵌入 HTTPS URL 鉴权。
"""
from __future__ import annotations

import subprocess
from pathlib import Path


def _git(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    """执行 git 命令，返回 CompletedProcess。"""
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


def _repo_url(github_repo: str, github_pat: str) -> str:
    """构建带 PAT 的 HTTPS clone URL。"""
    return f"https://{github_pat}@github.com/{github_repo}.git"


def ensure_repo(github_repo: str, github_pat: str, work_dir: Path) -> Path:
    """
    确保本地 repo 存在并是最新状态。

    - 不存在时执行 git clone
    - 已存在时执行 git fetch origin
    返回本地 repo 路径。
    """
    repo_name = github_repo.split("/")[-1]
    repo_path = work_dir / repo_name

    if not repo_path.exists():
        url = _repo_url(github_repo, github_pat)
        _git(["git", "clone", url, str(repo_path)])
    else:
        _git(["git", "fetch", "origin"], cwd=repo_path)

    return repo_path


def commit_and_push(repo_path: Path, message: str) -> None:
    """
    git add -A → git commit → git push。

    若 nothing to commit 则静默跳过。
    """
    _git(["git", "add", "-A"], cwd=repo_path)

    result = _git(["git", "commit", "-m", message], cwd=repo_path)
    if "nothing to commit" in (result.stdout + result.stderr):
        return

    _git(["git", "push"], cwd=repo_path)

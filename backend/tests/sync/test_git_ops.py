"""Tests for backend/app/sync/git_ops.py"""
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock, call

import pytest

from app.sync.git_ops import ensure_repo, commit_and_push


def test_ensure_repo_clones_when_not_exists(tmp_path):
    """目标路径不存在时执行 git clone。"""
    repo_dir = tmp_path / "myrepo"
    assert not repo_dir.exists()

    with patch("app.sync.git_ops.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0)
        result = ensure_repo("owner/myrepo", "ghp_token", tmp_path)

    assert result == repo_dir
    clone_call = mock_run.call_args_list[0]
    cmd = clone_call.args[0]
    assert "clone" in cmd
    assert "ghp_token" in " ".join(cmd)
    assert "owner/myrepo" in " ".join(cmd)


def test_ensure_repo_fetches_when_exists(tmp_path):
    """目标路径已存在时执行 git fetch。"""
    repo_dir = tmp_path / "myrepo"
    repo_dir.mkdir()

    with patch("app.sync.git_ops.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0)
        result = ensure_repo("owner/myrepo", "ghp_token", tmp_path)

    assert result == repo_dir
    fetch_call = mock_run.call_args_list[0]
    cmd = fetch_call.args[0]
    assert "fetch" in cmd


def test_commit_and_push_normal(tmp_path):
    """正常流程：add → commit → push 依次执行。"""
    with patch("app.sync.git_ops.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        commit_and_push(tmp_path, "chore: daily backup")

    cmds = [" ".join(c.args[0]) for c in mock_run.call_args_list]
    assert any("add" in c for c in cmds)
    assert any("commit" in c for c in cmds)
    assert any("push" in c for c in cmds)


def test_commit_and_push_nothing_to_commit(tmp_path):
    """git commit 返回 'nothing to commit' 时不抛异常。"""
    def side_effect(cmd, **kwargs):
        m = MagicMock(returncode=0, stdout="", stderr="")
        if "commit" in cmd:
            m.stdout = "nothing to commit, working tree clean"
        return m

    with patch("app.sync.git_ops.subprocess.run", side_effect=side_effect):
        # 不应抛异常
        commit_and_push(tmp_path, "chore: daily backup")

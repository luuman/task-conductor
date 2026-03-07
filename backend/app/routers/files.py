"""项目文件浏览 API：列出目录树、读取文件内容"""

import os
import stat
from pathlib import Path
from datetime import datetime

import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Project

router = APIRouter(prefix="/api/projects", tags=["文件"])

# 不展示的目录/文件（隐藏 + 常见大目录）
IGNORE_NAMES = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
    "dist", "build", ".next", ".nuxt", ".cache",
    ".DS_Store", "Thumbs.db",
}

# 允许在编辑器中查看的文本扩展名（宽松策略：未知扩展也尝试读取）
TEXT_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yaml", ".yml",
    ".toml", ".cfg", ".ini", ".env", ".sh", ".bash", ".zsh",
    ".html", ".htm", ".css", ".scss", ".less", ".svg",
    ".md", ".txt", ".rst", ".csv", ".xml",
    ".java", ".c", ".cpp", ".h", ".hpp", ".go", ".rs", ".rb",
    ".sql", ".graphql", ".proto", ".lock", ".gitignore",
    ".dockerfile", ".dockerignore", ".editorconfig",
}

MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB


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


def _safe_resolve(base: Path, rel: str) -> Path:
    """确保路径不会逃逸出项目根目录"""
    target = (base / rel).resolve()
    if not str(target).startswith(str(base.resolve())):
        raise HTTPException(403, "路径越界")
    return target


def _file_info(path: Path, base: Path) -> dict:
    try:
        st = path.stat()
    except OSError:
        return None
    rel = str(path.relative_to(base))
    is_dir = path.is_dir()
    return {
        "name": path.name,
        "path": rel,
        "is_dir": is_dir,
        "size": st.st_size if not is_dir else None,
        "modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
    }


@router.get("/{project_id}/files", summary="列出项目目录")
def list_files(
    project_id: int,
    path: str = Query("", description="相对于项目根的子目录路径"),
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    target = _safe_resolve(base, path) if path else base

    if not target.is_dir():
        raise HTTPException(400, "不是目录")

    items = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.name in IGNORE_NAMES:
                continue
            if entry.name.startswith(".") and entry.name not in (".env.example", ".gitignore", ".editorconfig"):
                continue
            info = _file_info(entry, base)
            if info:
                items.append(info)
    except PermissionError:
        raise HTTPException(403, "无权限读取目录")

    return {
        "path": path or ".",
        "items": items,
    }


@router.get("/{project_id}/file", summary="读取文件内容")
def read_file(
    project_id: int,
    path: str = Query(..., description="相对于项目根的文件路径"),
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    target = _safe_resolve(base, path)

    if not target.is_file():
        raise HTTPException(404, "文件不存在")

    size = target.stat().st_size
    if size > MAX_FILE_SIZE:
        raise HTTPException(400, f"文件过大 ({size} bytes)，上限 {MAX_FILE_SIZE} bytes")

    # 尝试以文本方式读取
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # 二进制文件
        return {
            "path": path,
            "name": target.name,
            "size": size,
            "binary": True,
            "content": None,
        }

    return {
        "path": path,
        "name": target.name,
        "size": size,
        "binary": False,
        "content": content,
    }


class SaveFileBody(BaseModel):
    path: str
    content: str


@router.put("/{project_id}/file", summary="保存文件内容")
def save_file(
    project_id: int,
    body: SaveFileBody,
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    target = _safe_resolve(base, body.path)

    if not target.is_file():
        raise HTTPException(404, "文件不存在")

    size = target.stat().st_size
    if size > MAX_FILE_SIZE:
        raise HTTPException(400, f"文件过大 ({size} bytes)，上限 {MAX_FILE_SIZE} bytes")

    try:
        target.write_text(body.content, encoding="utf-8")
    except OSError as e:
        raise HTTPException(500, f"写入失败: {e}")

    new_size = target.stat().st_size
    return {
        "path": body.path,
        "name": target.name,
        "size": new_size,
        "ok": True,
    }


@router.get("/{project_id}/files/search", summary="搜索项目文件")
def search_files(
    project_id: int,
    q: str = Query(..., min_length=1, description="搜索关键词"),
    db: Session = Depends(_get_db),
):
    """在项目目录中递归搜索文件名匹配的文件，返回前 50 条结果"""
    base = _get_project_path(project_id, db)
    query_lower = q.lower()
    results: list[dict] = []
    max_results = 50

    def walk(directory: Path, depth: int = 0):
        if depth > 10 or len(results) >= max_results:
            return
        try:
            for entry in sorted(directory.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
                if len(results) >= max_results:
                    return
                if entry.name in IGNORE_NAMES or (entry.name.startswith(".") and entry.name not in (".env.example", ".gitignore", ".editorconfig")):
                    continue
                if entry.is_dir():
                    walk(entry, depth + 1)
                elif query_lower in entry.name.lower():
                    info = _file_info(entry, base)
                    if info:
                        results.append(info)
        except PermissionError:
            pass

    walk(base)
    return {"query": q, "items": results}


@router.get("/{project_id}/file/raw", summary="获取文件原始内容（用于图片等二进制文件）")
def raw_file(
    project_id: int,
    path: str = Query(..., description="相对于项目根的文件路径"),
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    target = _safe_resolve(base, path)

    if not target.is_file():
        raise HTTPException(404, "文件不存在")

    size = target.stat().st_size
    if size > 10 * 1024 * 1024:  # 10 MB limit for raw
        raise HTTPException(400, "文件过大")

    media_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return FileResponse(str(target), media_type=media_type)

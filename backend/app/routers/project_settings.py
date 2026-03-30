"""
项目级 Claude 配置文件读取接口。
通过 project.repo_url 定位项目路径，读取 CLAUDE.md / hooks / memory / .mcp.json 等文件。
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Project

router = APIRouter(prefix="/api/projects", tags=["项目 Claude 配置"])

CLAUDE_HOME = Path.home() / ".claude"

HOOK_EVENTS = [
    "PreToolUse", "PostToolUse", "PostToolUseFailure",
    "SessionStart", "SessionEnd", "Stop",
    "SubagentStart", "SubagentStop", "Notification",
]

# 规则分类关键词（heuristic，无需 AI）
_CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("DB",   ["db", "database", "数据库", "sql", "sqlite", "orm", "migration"]),
    ("UI",   ["css", "style", "ui", "样式", "tailwind", "component", "module.css"]),
    ("前端", ["api", "接口", "endpoint", "fetch", "http", "前端", "react", "tsx"]),
    ("语言", ["language", "中文", "chinese", "zh", "english", "语言", "回答"]),
    ("范围", ["path", "directory", "file", "dir", "目录", "路径", "scope", "tauri", "frontend", "backend"]),
    ("限制", ["never", "don't", "avoid", "不要", "禁止", "注意", "do not", "must not"]),
]


def get_db():
    with Session(engine) as session:
        yield session


def _get_project_path(project_id: int, db: Session) -> Path:
    p = db.get(Project, project_id)
    if not p or not p.repo_url:
        raise HTTPException(404, "项目不存在或未配置路径")
    return Path(p.repo_url)


def _classify_rule(text: str) -> str:
    lower = text.lower()
    for cat, keywords in _CATEGORY_RULES:
        if any(k in lower for k in keywords):
            return cat
    return "行为"


def _extract_rules(content: str) -> list[dict]:
    """从 Markdown 内容提取 bullet list 规则并分类。"""
    rules = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith(("- ", "* ", "• ")) and len(stripped) > 5:
            text = stripped[2:].strip()
            if text and not text.startswith("#") and not text.startswith("```"):
                rules.append({"text": text[:120], "category": _classify_rule(text)})
    return rules


# ── Endpoints ─────────────────────────────────────────────────────

@router.get("/{project_id}/claude-config", summary="读取 CLAUDE.md 规则（项目 + 全局）")
def get_claude_config(project_id: int, db: Session = Depends(get_db)):
    project_path = _get_project_path(project_id, db)
    result: dict = {}

    # 项目级：根目录 CLAUDE.md（已提交）
    root_md = project_path / "CLAUDE.md"
    if root_md.exists():
        content = root_md.read_text(encoding="utf-8", errors="replace")
        result["project_root"] = {
            "path": str(root_md),
            "size": root_md.stat().st_size,
            "content": content,
            "rules": _extract_rules(content),
        }

    # 项目级：.claude/CLAUDE.md（个人补充）
    dot_md = project_path / ".claude" / "CLAUDE.md"
    if dot_md.exists():
        content = dot_md.read_text(encoding="utf-8", errors="replace")
        result["project_dot"] = {
            "path": str(dot_md),
            "size": dot_md.stat().st_size,
            "content": content,
            "rules": _extract_rules(content),
        }

    # 全局：~/.claude/CLAUDE.md
    global_md = CLAUDE_HOME / "CLAUDE.md"
    if global_md.exists():
        content = global_md.read_text(encoding="utf-8", errors="replace")
        result["global"] = {
            "path": str(global_md),
            "size": global_md.stat().st_size,
            "content": content,
            "rules": _extract_rules(content),
        }

    return result


def _read_hooks_from(settings_path: Path, scope: str) -> list[dict]:
    if not settings_path.exists():
        return [{"event": e, "scope": scope, "enabled": False, "commands": []} for e in HOOK_EVENTS]
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return [{"event": e, "scope": scope, "enabled": False, "commands": []} for e in HOOK_EVENTS]

    hooks_section = data.get("hooks", {})
    result = []
    for event in HOOK_EVENTS:
        entries = hooks_section.get(event, [])
        commands = []
        for entry in entries:
            for hook in entry.get("hooks", []):
                if hook.get("command"):
                    commands.append(hook["command"])
        result.append({
            "event": event,
            "scope": scope,
            "enabled": event in hooks_section,  # key present = hook registered (even with empty commands list)
            "commands": commands,
        })
    return result


@router.get("/{project_id}/hooks-status", summary="读取合并 hooks 状态（全局 + 项目）")
def get_hooks_status(project_id: int, db: Session = Depends(get_db)):
    project_path = _get_project_path(project_id, db)

    global_hooks = _read_hooks_from(CLAUDE_HOME / "settings.json", "global")
    project_hooks = _read_hooks_from(project_path / ".claude" / "settings.json", "project")

    # 以 event 为 key 合并
    merged: dict[str, dict] = {}
    for h in global_hooks:
        merged[h["event"]] = {"event": h["event"], "global": h, "project": None}
    for h in project_hooks:
        if h["event"] in merged:
            merged[h["event"]]["project"] = h
        else:
            merged[h["event"]] = {"event": h["event"], "global": None, "project": h}

    return {"hooks": list(merged.values())}


class HooksToggleBody(BaseModel):
    event: str
    scope: str   # "global" | "project"
    enabled: bool


@router.post("/{project_id}/hooks-toggle", summary="启用/禁用单个 hook 事件")
def toggle_hook(project_id: int, body: HooksToggleBody, db: Session = Depends(get_db)):
    if body.event not in HOOK_EVENTS:
        raise HTTPException(400, f"无效的 hook 事件类型: {body.event}，有效值: {HOOK_EVENTS}")
    project_path = _get_project_path(project_id, db)

    if body.scope == "global":
        settings_path = CLAUDE_HOME / "settings.json"
    else:
        settings_path = project_path / ".claude" / "settings.json"

    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    else:
        data = {}

    hooks = data.setdefault("hooks", {})
    if body.enabled:
        if body.event not in hooks:
            hooks[body.event] = []   # 空列表 = 已注册但无命令
    else:
        hooks.pop(body.event, None)

    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "event": body.event, "scope": body.scope, "enabled": body.enabled}


@router.get("/{project_id}/memory", summary="读取项目记忆文件分类")
def get_project_memory(project_id: int, db: Session = Depends(get_db)):
    project_path = _get_project_path(project_id, db)
    encoded = str(project_path).replace("/", "-")
    memory_dir = CLAUDE_HOME / "projects" / encoded / "memory"

    categories: dict[str, list] = {"user": [], "feedback": [], "project": [], "reference": []}

    if not memory_dir.exists():
        return categories

    for md_file in sorted(memory_dir.glob("*.md")):
        if md_file.name == "MEMORY.md":
            continue
        try:
            content = md_file.read_text(encoding="utf-8", errors="replace")
            fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
            cat, name, description = "reference", md_file.stem, ""
            if fm_match:
                fm = fm_match.group(1)
                if m := re.search(r"^type:\s*(.+)$", fm, re.MULTILINE):
                    cat = m.group(1).strip()
                if m := re.search(r"^name:\s*(.+)$", fm, re.MULTILINE):
                    name = m.group(1).strip()
                if m := re.search(r"^description:\s*(.+)$", fm, re.MULTILINE):
                    description = m.group(1).strip()
            if cat in categories:
                categories[cat].append({"name": name, "description": description, "file": md_file.name})
        except Exception:
            pass

    return categories


@router.get("/{project_id}/mcp-servers", summary="读取 .mcp.json 的 MCP Server 配置")
def get_mcp_servers(project_id: int, db: Session = Depends(get_db)):
    project_path = _get_project_path(project_id, db)
    mcp_path = project_path / ".mcp.json"

    if not mcp_path.exists():
        return {"servers": []}
    try:
        data = json.loads(mcp_path.read_text(encoding="utf-8"))
        servers_raw = data.get("mcpServers", {})
        servers = [
            {"name": name, "tools": cfg.get("tools", []), "status": "ok"}
            for name, cfg in servers_raw.items()
        ]
        return {"servers": servers}
    except (json.JSONDecodeError, OSError):
        return {"servers": []}


@router.get("/{project_id}/permissions", summary="合并读取三层权限配置")
def get_permissions(project_id: int, db: Session = Depends(get_db)):
    project_path = _get_project_path(project_id, db)

    def read_perms(path: Path, source: str) -> tuple[list, list]:
        if not path.exists():
            return [], []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            perms = data.get("permissions", {})
            allows = [{"rule": r, "source": source} for r in perms.get("allow", [])]
            denies = [{"rule": r, "source": source} for r in perms.get("deny", [])]
            return allows, denies
        except Exception:
            return [], []

    allow_all, deny_all = [], []
    for path, src in [
        (CLAUDE_HOME / "settings.json",                       "global"),
        (project_path / ".claude" / "settings.json",          "project"),
        (project_path / ".claude" / "settings.local.json",    "local"),
    ]:
        a, d = read_perms(path, src)
        allow_all.extend(a)
        deny_all.extend(d)

    return {"allow": allow_all, "deny": deny_all}


@router.get("/{project_id}/settings-local", summary="读取 settings.local.json（只读）")
def get_settings_local(project_id: int, db: Session = Depends(get_db)):
    project_path = _get_project_path(project_id, db)
    local_path = project_path / ".claude" / "settings.local.json"

    if not local_path.exists():
        return {"exists": False, "content": None}
    try:
        content = json.loads(local_path.read_text(encoding="utf-8"))
        return {"exists": True, "content": content}
    except json.JSONDecodeError:
        return {"exists": True, "content": None, "error": "JSON 解析失败"}

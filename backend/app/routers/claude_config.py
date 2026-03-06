"""
读写 ~/.claude/ 目录下的配置、统计、插件等信息，供前端可视化配置 Claude Code。
"""

import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/claude-config", tags=["Claude 配置"])

CLAUDE_HOME = Path.home() / ".claude"
SETTINGS_PATH = CLAUDE_HOME / "settings.json"

# ── 简单 TTL 内存缓存 ─────────────────────────────────────────────
_cache: dict[str, tuple[float, Any]] = {}  # key → (expire_ts, value)

def _cached(key: str, ttl: int, fn):
    """返回缓存值，过期则重新计算。ttl 单位秒。"""
    now = time.time()
    entry = _cache.get(key)
    if entry and entry[0] > now:
        return entry[1]
    value = fn()
    _cache[key] = (now + ttl, value)
    return value

def _invalidate_cache(key: str | None = None):
    if key:
        _cache.pop(key, None)
    else:
        _cache.clear()

# ── 所有已知 Hook 事件类型 ─────────────────────────────────────────
HOOK_EVENT_TYPES = [
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "Notification",
]

# ── Pydantic 模型 ─────────────────────────────────────────────────


class HookEntry(BaseModel):
    type: str = "command"
    command: str
    timeout: int = 5


class HookRule(BaseModel):
    matcher: str = ""
    hooks: list[HookEntry]


class InstalledPlugin(BaseModel):
    plugin_id: str
    name: str
    publisher: str
    scope: str
    version: str
    install_path: str
    installed_at: str
    last_updated: str
    git_commit: str | None = None


class DailyActivity(BaseModel):
    date: str
    message_count: int
    session_count: int
    tool_call_count: int


class SkillInfo(BaseModel):
    name: str
    path: str


class HookScriptInfo(BaseModel):
    name: str
    path: str
    size_bytes: int


class ProjectRef(BaseModel):
    dir_name: str
    has_memory: bool
    has_claude_md: bool


class McpServer(BaseModel):
    name: str
    url: str | None = None
    command: str | None = None
    args: list[str] | None = None
    transport: str = "unknown"
    status: str = "unknown"
    scope: str = "unknown"


class ClaudeOverview(BaseModel):
    cli_version: str
    home_path: str
    total_messages: int
    total_tool_calls: int
    total_sessions: int
    first_active_day: str | None
    last_active_day: str | None
    active_days: int
    daily_activity: list[DailyActivity]
    installed_plugins: list[InstalledPlugin]
    skills: list[SkillInfo]
    hook_scripts: list[HookScriptInfo]
    projects: list[ProjectRef]
    mcp_servers: list[McpServer]


class ClaudeConfigOut(BaseModel):
    hooks: dict[str, list[HookRule]]
    enabled_plugins: dict[str, bool]
    permissions: dict[str, Any]
    other: dict[str, Any]
    raw: dict[str, Any]


class HookRuleUpdate(BaseModel):
    event: str
    rules: list[HookRule]


class PluginToggle(BaseModel):
    plugin_id: str
    enabled: bool


class PermissionsUpdate(BaseModel):
    permissions: dict[str, Any]


class RawUpdate(BaseModel):
    config: dict[str, Any]


# ── 读写辅助 ───────────────────────────────────────────────────────


def _read_config() -> dict:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_config(data: dict):
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8"
    )


def _parse_config(raw: dict) -> ClaudeConfigOut:
    hooks_raw = raw.get("hooks", {})
    hooks: dict[str, list[HookRule]] = {}
    for event, rules_list in hooks_raw.items():
        parsed_rules: list[HookRule] = []
        if isinstance(rules_list, list):
            for rule in rules_list:
                if isinstance(rule, dict):
                    matcher = rule.get("matcher", "")
                    hook_entries = []
                    for h in rule.get("hooks", []):
                        if isinstance(h, dict):
                            hook_entries.append(
                                HookEntry(
                                    type=h.get("type", "command"),
                                    command=h.get("command", ""),
                                    timeout=h.get("timeout", 5),
                                )
                            )
                    parsed_rules.append(
                        HookRule(matcher=matcher, hooks=hook_entries)
                    )
        hooks[event] = parsed_rules

    enabled_plugins = raw.get("enabledPlugins", {})
    permissions = raw.get("permissions", {})

    known_keys = {"hooks", "enabledPlugins", "permissions"}
    other = {k: v for k, v in raw.items() if k not in known_keys}

    return ClaudeConfigOut(
        hooks=hooks,
        enabled_plugins=enabled_plugins,
        permissions=permissions,
        other=other,
        raw=raw,
    )


def _get_cli_version_uncached() -> str:
    try:
        result = subprocess.run(
            ["claude", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"

def _get_cli_version() -> str:
    return _cached("cli_version", 3600, _get_cli_version_uncached)  # 1h


def _read_stats() -> list[DailyActivity]:
    stats_file = CLAUDE_HOME / "stats-cache.json"
    if not stats_file.exists():
        return []
    try:
        data = json.loads(stats_file.read_text(encoding="utf-8"))
        activities = data.get("dailyActivity", [])
        return [
            DailyActivity(
                date=a.get("date", ""),
                message_count=a.get("messageCount", 0),
                session_count=a.get("sessionCount", 0),
                tool_call_count=a.get("toolCallCount", 0),
            )
            for a in activities
            if isinstance(a, dict)
        ]
    except Exception:
        return []


def _read_installed_plugins() -> list[InstalledPlugin]:
    plugins_file = CLAUDE_HOME / "plugins" / "installed_plugins.json"
    if not plugins_file.exists():
        return []
    try:
        data = json.loads(plugins_file.read_text(encoding="utf-8"))
        plugins_map = data.get("plugins", {})
        result: list[InstalledPlugin] = []
        for plugin_id, installs in plugins_map.items():
            if not isinstance(installs, list) or not installs:
                continue
            inst = installs[-1]  # latest install
            parts = plugin_id.split("@", 1) if "@" in plugin_id else [plugin_id, ""]
            result.append(
                InstalledPlugin(
                    plugin_id=plugin_id,
                    name=parts[0],
                    publisher=parts[1] if len(parts) > 1 else "",
                    scope=inst.get("scope", "user"),
                    version=inst.get("version", "unknown"),
                    install_path=inst.get("installPath", ""),
                    installed_at=inst.get("installedAt", ""),
                    last_updated=inst.get("lastUpdated", ""),
                    git_commit=inst.get("gitCommitSha"),
                )
            )
        return result
    except Exception:
        return []


def _list_skills() -> list[SkillInfo]:
    skills_dir = CLAUDE_HOME / "skills"
    if not skills_dir.is_dir():
        return []
    result: list[SkillInfo] = []
    for entry in sorted(skills_dir.iterdir()):
        if entry.name.startswith("."):
            continue
        result.append(SkillInfo(name=entry.name, path=str(entry)))
    return result


def _list_hook_scripts() -> list[HookScriptInfo]:
    hooks_dir = CLAUDE_HOME / "hooks"
    if not hooks_dir.is_dir():
        return []
    result: list[HookScriptInfo] = []
    for entry in sorted(hooks_dir.iterdir()):
        if entry.is_file():
            result.append(
                HookScriptInfo(
                    name=entry.name,
                    path=str(entry),
                    size_bytes=entry.stat().st_size,
                )
            )
    return result


def _list_mcp_servers(use_cache: bool = True) -> list[McpServer]:
    """Parse `claude mcp list` output to get MCP server info."""
    if use_cache:
        return _cached("mcp_servers", 120, lambda: _list_mcp_servers(use_cache=False))  # 2min
    import re

    try:
        result = subprocess.run(
            ["claude", "mcp", "list"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        output = result.stdout + result.stderr
    except Exception:
        return []

    servers: list[McpServer] = []
    for line in output.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("Checking"):
            continue
        # Pattern: 'name: url (transport) - status'  or  'name: url - status'
        m = re.match(
            r"^(.+?):\s+(\S+)(?:\s+\((\w+)\))?\s+-\s+(.+)$", line
        )
        if m:
            name = m.group(1).strip()
            url = m.group(2).strip()
            transport = m.group(3) or "sse"
            status_text = m.group(4).strip()
            # Determine status
            if "\u2713" in status_text or "Connected" in status_text:
                status = "connected"
            elif "Needs auth" in status_text:
                status = "needs_auth"
            elif "Error" in status_text or "Failed" in status_text:
                status = "error"
            else:
                status = "unknown"
            servers.append(
                McpServer(
                    name=name,
                    url=url,
                    transport=transport.lower(),
                    status=status,
                )
            )
    return servers


def _get_mcp_server_detail(name: str) -> dict[str, Any]:
    """Get details of a single MCP server via `claude mcp get <name>`."""
    try:
        result = subprocess.run(
            ["claude", "mcp", "get", name],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return {"raw": result.stdout.strip()}
    except Exception:
        return {"raw": ""}


def _list_projects() -> list[ProjectRef]:
    projects_dir = CLAUDE_HOME / "projects"
    if not projects_dir.is_dir():
        return []
    result: list[ProjectRef] = []
    for entry in sorted(projects_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        has_memory = (entry / "memory").is_dir()
        has_claude_md = (entry / "CLAUDE.md").exists()
        result.append(
            ProjectRef(
                dir_name=entry.name,
                has_memory=has_memory,
                has_claude_md=has_claude_md,
            )
        )
    return result


# ── 端点 ───────────────────────────────────────────────────────────


@router.get("/overview", response_model=ClaudeOverview, summary="Claude 总览信息")
def get_overview():
    activities = _read_stats()
    total_msgs = sum(a.message_count for a in activities)
    total_tools = sum(a.tool_call_count for a in activities)
    total_sess = sum(a.session_count for a in activities)
    first_day = activities[0].date if activities else None
    last_day = activities[-1].date if activities else None

    return ClaudeOverview(
        cli_version=_get_cli_version(),
        home_path=str(CLAUDE_HOME),
        total_messages=total_msgs,
        total_tool_calls=total_tools,
        total_sessions=total_sess,
        first_active_day=first_day,
        last_active_day=last_day,
        active_days=len(activities),
        daily_activity=activities,
        installed_plugins=_read_installed_plugins(),
        skills=_list_skills(),
        hook_scripts=_list_hook_scripts(),
        projects=_list_projects(),
        mcp_servers=_list_mcp_servers(),
    )


@router.get("", response_model=ClaudeConfigOut, summary="读取 Claude 配置")
def get_claude_config():
    raw = _read_config()
    return _parse_config(raw)


@router.get("/hook-events", summary="获取所有可用的 Hook 事件类型")
def get_hook_events() -> list[str]:
    return HOOK_EVENT_TYPES


@router.put("/hooks", summary="更新某个事件的 Hook 规则")
def update_hook_rules(body: HookRuleUpdate):
    if body.event not in HOOK_EVENT_TYPES:
        raise HTTPException(400, f"未知事件类型: {body.event}")
    raw = _read_config()
    hooks = raw.setdefault("hooks", {})
    hooks[body.event] = [rule.model_dump() for rule in body.rules]
    if not body.rules:
        hooks.pop(body.event, None)
    _write_config(raw)
    return _parse_config(raw)


@router.delete("/hooks/{event}", summary="删除某个事件的所有 Hook")
def delete_hook_event(event: str):
    raw = _read_config()
    hooks = raw.get("hooks", {})
    hooks.pop(event, None)
    raw["hooks"] = hooks
    _write_config(raw)
    return _parse_config(raw)


@router.put("/plugins", summary="启用/禁用插件")
def toggle_plugin(body: PluginToggle):
    raw = _read_config()
    plugins = raw.setdefault("enabledPlugins", {})
    plugins[body.plugin_id] = body.enabled
    _write_config(raw)
    return _parse_config(raw)


@router.delete("/plugins/{plugin_id:path}", summary="移除插件配置")
def remove_plugin(plugin_id: str):
    raw = _read_config()
    plugins = raw.get("enabledPlugins", {})
    plugins.pop(plugin_id, None)
    raw["enabledPlugins"] = plugins
    _write_config(raw)
    return _parse_config(raw)


@router.put("/permissions", summary="更新权限配置")
def update_permissions(body: PermissionsUpdate):
    raw = _read_config()
    raw["permissions"] = body.permissions
    _write_config(raw)
    return _parse_config(raw)


@router.put("/other/{key}", summary="更新其他配置项")
def update_other(key: str, body: dict[str, Any]):
    if key in ("hooks", "enabledPlugins", "permissions"):
        raise HTTPException(400, f"请使用专用端点修改 {key}")
    raw = _read_config()
    raw[key] = body.get("value")
    _write_config(raw)
    return _parse_config(raw)


@router.delete("/other/{key}", summary="删除其他配置项")
def delete_other(key: str):
    if key in ("hooks", "enabledPlugins", "permissions"):
        raise HTTPException(400, f"不可删除核心字段 {key}")
    raw = _read_config()
    raw.pop(key, None)
    _write_config(raw)
    return _parse_config(raw)


# ── MCP 端点 ───────────────────────────────────────────────────────


class McpAddRequest(BaseModel):
    name: str
    url: str | None = None
    command: str | None = None
    args: list[str] | None = None
    transport: str = "http"
    scope: str = "user"
    env: dict[str, str] | None = None
    headers: dict[str, str] | None = None


@router.get("/mcp", summary="列出 MCP 服务器")
def list_mcp_servers() -> list[McpServer]:
    return _list_mcp_servers()


@router.post("/mcp", summary="添加 MCP 服务器")
def add_mcp_server(body: McpAddRequest):
    cmd = ["claude", "mcp", "add"]

    # Scope
    if body.scope:
        cmd += ["-s", body.scope]

    # Transport
    if body.transport:
        cmd += ["--transport", body.transport]

    # Env
    if body.env:
        for k, v in body.env.items():
            cmd += ["-e", f"{k}={v}"]

    # Headers (for http/sse)
    if body.headers:
        for k, v in body.headers.items():
            cmd += ["--header", f"{k}: {v}"]

    # Name + URL/command
    cmd.append(body.name)

    if body.url:
        cmd.append(body.url)
    elif body.command:
        cmd.append("--")
        cmd.append(body.command)
        if body.args:
            cmd.extend(body.args)

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            raise HTTPException(400, f"添加失败: {result.stderr.strip()}")
        _invalidate_cache("mcp_servers")
        return {"ok": True, "output": result.stdout.strip(), "servers": _list_mcp_servers(use_cache=False)}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "命令超时")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/mcp/{name}", summary="移除 MCP 服务器")
def remove_mcp_server(name: str, scope: str = "user"):
    try:
        result = subprocess.run(
            ["claude", "mcp", "remove", name, "-s", scope],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise HTTPException(400, f"移除失败: {result.stderr.strip()}")
        _invalidate_cache("mcp_servers")
        return {"ok": True, "servers": _list_mcp_servers(use_cache=False)}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "命令超时")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Skills 详情 ──────────────────────────────────────────────────


class SkillDetail(BaseModel):
    name: str
    path: str
    description: str  # first line after YAML frontmatter
    metadata: dict[str, Any]  # YAML frontmatter parsed
    content: str  # full SKILL.md content
    has_auxiliary: bool  # has other files besides SKILL.md
    auxiliary_files: list[str]  # other file names


def _parse_yaml_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter between --- markers using simple string parsing."""
    metadata: dict[str, Any] = {}
    body = text
    stripped = text.strip()
    if stripped.startswith("---"):
        parts = stripped.split("---", 2)
        # parts[0] is empty, parts[1] is frontmatter, parts[2] is body
        if len(parts) >= 3:
            fm_text = parts[1].strip()
            body = parts[2].strip()
            for line in fm_text.split("\n"):
                line = line.strip()
                if ":" in line:
                    key, _, val = line.partition(":")
                    key = key.strip()
                    val = val.strip()
                    # Try to parse simple types
                    if val.lower() in ("true", "yes"):
                        metadata[key] = True
                    elif val.lower() in ("false", "no"):
                        metadata[key] = False
                    elif val.isdigit():
                        metadata[key] = int(val)
                    else:
                        # Strip surrounding quotes
                        if (val.startswith('"') and val.endswith('"')) or (
                            val.startswith("'") and val.endswith("'")
                        ):
                            val = val[1:-1]
                        metadata[key] = val
    return metadata, body


def _read_skill_detail(skill_dir: Path) -> SkillDetail | None:
    """Parse SKILL.md with YAML frontmatter. Return None if not a valid skill dir."""
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return None
    try:
        content = skill_md.read_text(encoding="utf-8")
    except Exception:
        return None

    metadata, body = _parse_yaml_frontmatter(content)

    # Description = first non-empty line of body
    description = ""
    for line in body.split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            description = line
            break
        if line.startswith("#"):
            description = line.lstrip("#").strip()
            break

    # Auxiliary files: everything in skill_dir except SKILL.md
    auxiliary_files: list[str] = []
    try:
        for entry in sorted(skill_dir.iterdir()):
            if entry.name != "SKILL.md" and not entry.name.startswith("."):
                auxiliary_files.append(entry.name)
    except Exception:
        pass

    return SkillDetail(
        name=skill_dir.name,
        path=str(skill_dir),
        description=description,
        metadata=metadata,
        content=content,
        has_auxiliary=len(auxiliary_files) > 0,
        auxiliary_files=auxiliary_files,
    )


@router.get("/skills", summary="列出所有技能详情")
def list_skills_detail() -> list[SkillDetail]:
    skills_dir = CLAUDE_HOME / "skills"
    if not skills_dir.is_dir():
        return []
    result: list[SkillDetail] = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        detail = _read_skill_detail(entry)
        if detail:
            result.append(detail)
    return result


# ── 自定义命令 ────────────────────────────────────────────────────


class CommandInfo(BaseModel):
    name: str  # filename without extension
    path: str
    content: str
    scope: str  # "global" or "project"


@router.get("/commands", summary="列出自定义命令")
def list_commands() -> list[CommandInfo]:
    commands_dir = CLAUDE_HOME / "commands"
    if not commands_dir.is_dir():
        return []
    result: list[CommandInfo] = []
    for entry in sorted(commands_dir.iterdir()):
        if entry.is_file() and entry.suffix == ".md":
            try:
                content = entry.read_text(encoding="utf-8")
            except Exception:
                content = ""
            result.append(
                CommandInfo(
                    name=entry.stem,
                    path=str(entry),
                    content=content,
                    scope="global",
                )
            )
    return result


# ── 系统信息概览 ──────────────────────────────────────────────────


class SystemInfo(BaseModel):
    cli_version: str
    home_path: str
    config_path: str
    cache_dir: str
    cache_size_mb: float
    history_size_mb: float
    session_count: int
    project_count: int
    skill_count: int
    plugin_count: int
    hook_script_count: int
    mcp_server_count: int
    platform: str
    python_version: str


def _dir_size_mb(path: Path) -> float:
    """Calculate total size of a directory in MB."""
    if not path.is_dir():
        return 0.0
    total = 0
    try:
        for f in path.rglob("*"):
            if f.is_file():
                try:
                    total += f.stat().st_size
                except OSError:
                    pass
    except Exception:
        pass
    return round(total / (1024 * 1024), 2)


@router.get("/system-info", summary="系统信息概览")
def get_system_info() -> SystemInfo:
    # Count sessions from projects dir (each project subdir may have sessions)
    projects_dir = CLAUDE_HOME / "projects"
    project_count = 0
    if projects_dir.is_dir():
        project_count = sum(
            1 for e in projects_dir.iterdir()
            if e.is_dir() and not e.name.startswith(".")
        )

    skills_dir = CLAUDE_HOME / "skills"
    skill_count = 0
    if skills_dir.is_dir():
        skill_count = sum(
            1 for e in skills_dir.iterdir()
            if e.is_dir() and not e.name.startswith(".")
        )

    plugin_count = len(_read_installed_plugins())

    hooks_dir = CLAUDE_HOME / "hooks"
    hook_script_count = 0
    if hooks_dir.is_dir():
        hook_script_count = sum(1 for e in hooks_dir.iterdir() if e.is_file())

    mcp_servers = _list_mcp_servers()

    # Cache dir: ~/.claude/cache or similar
    cache_dir = CLAUDE_HOME / "cache"
    cache_size = _dir_size_mb(cache_dir)

    # History: ~/.claude/projects (contains conversation history)
    history_size = _dir_size_mb(projects_dir)

    # Session count from stats
    activities = _read_stats()
    session_count = sum(a.session_count for a in activities)

    return SystemInfo(
        cli_version=_get_cli_version(),
        home_path=str(CLAUDE_HOME),
        config_path=str(SETTINGS_PATH),
        cache_dir=str(cache_dir),
        cache_size_mb=cache_size,
        history_size_mb=history_size,
        session_count=session_count,
        project_count=project_count,
        skill_count=skill_count,
        plugin_count=plugin_count,
        hook_script_count=hook_script_count,
        mcp_server_count=len(mcp_servers),
        platform=platform.platform(),
        python_version=sys.version,
    )


# ── 全局 CLAUDE.md 读写 ──────────────────────────────────────────


@router.get("/claude-md", summary="读取全局 CLAUDE.md")
def get_claude_md() -> dict[str, str]:
    path = CLAUDE_HOME / "CLAUDE.md"
    content = ""
    if path.exists():
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            content = ""
    return {"content": content, "path": str(path)}


@router.put("/claude-md", summary="更新全局 CLAUDE.md")
def update_claude_md(body: dict[str, str]) -> dict[str, str]:
    path = CLAUDE_HOME / "CLAUDE.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    content = body.get("content", "")
    path.write_text(content, encoding="utf-8")
    return {"content": content, "path": str(path)}


# ── 规则文件 ──────────────────────────────────────────────────────


class RuleInfo(BaseModel):
    name: str
    path: str
    content: str
    scope: str


@router.get("/rules", summary="列出规则文件")
def list_rules() -> list[RuleInfo]:
    rules_dir = CLAUDE_HOME / "rules"
    if not rules_dir.is_dir():
        return []
    result: list[RuleInfo] = []
    for entry in sorted(rules_dir.iterdir()):
        if entry.is_file() and entry.suffix == ".md":
            try:
                content = entry.read_text(encoding="utf-8")
            except Exception:
                content = ""
            result.append(
                RuleInfo(
                    name=entry.stem,
                    path=str(entry),
                    content=content,
                    scope="global",
                )
            )
    return result

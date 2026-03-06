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
    enabled: bool = True  # whether the skill is enabled


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


def _read_skill_detail(skill_dir: Path, disabled: bool = False) -> SkillDetail | None:
    """Parse SKILL.md with YAML frontmatter. Return None if not a valid skill dir."""
    skill_md = skill_dir / ("SKILL.md.disabled" if disabled else "SKILL.md")
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
        # Check if disabled (SKILL.md.disabled exists but SKILL.md doesn't)
        is_disabled = (entry / "SKILL.md.disabled").exists() and not (entry / "SKILL.md").exists()
        if is_disabled:
            # Read from disabled file
            detail = _read_skill_detail(entry, disabled=True)
        else:
            detail = _read_skill_detail(entry)
        if detail:
            detail.enabled = not is_disabled
            result.append(detail)
    return result


class ToggleRequest(BaseModel):
    name: str
    enabled: bool


class CreateItemRequest(BaseModel):
    name: str
    content: str = ""


# ── 预置模板库 ────────────────────────────────────────────────────

PRESET_AGENTS: list[dict[str, str]] = [
    {
        "name": "code-reviewer",
        "title": "Code Reviewer",
        "desc": "审查代码质量、潜在 Bug、性能问题和最佳实践",
        "icon": "🔍",
        "content": """---
name: code-reviewer
description: "审查代码质量、发现潜在 Bug 和改进机会"
model: claude-sonnet-4-6
---

你是一位严谨的代码审查专家。

## 职责
- 审查代码变更的正确性、可读性和可维护性
- 指出潜在的 Bug、安全漏洞和性能问题
- 提出具体的改进建议（附代码示例）
- 检查是否符合项目编码规范

## 审查重点
1. **正确性**：逻辑错误、边界条件、空值处理
2. **安全性**：注入、XSS、敏感信息泄露
3. **性能**：N+1 查询、不必要的计算、内存泄漏
4. **可读性**：命名、注释、代码结构
5. **测试**：是否缺少测试覆盖

## 输出格式
对每个问题：
- 严重程度：🔴 严重 / 🟡 建议 / 🟢 优化
- 位置：文件名:行号
- 问题描述 + 修复建议
""",
    },
    {
        "name": "test-engineer",
        "title": "Test Engineer",
        "desc": "编写单元测试、集成测试，提高代码覆盖率",
        "icon": "🧪",
        "content": """---
name: test-engineer
description: "编写高质量测试用例，提高代码覆盖率"
model: claude-sonnet-4-6
---

你是一位测试工程专家。

## 职责
- 分析代码逻辑，编写全面的测试用例
- 覆盖正常路径、边界条件和异常情况
- 使用项目已有的测试框架和工具
- 优先测试核心业务逻辑和易出错的部分

## 测试原则
1. 每个测试只验证一个行为
2. 测试名称清晰描述期望行为
3. 使用 Arrange-Act-Assert 模式
4. Mock 外部依赖，不 Mock 被测对象
5. 边界值测试：空值、零值、极大值、特殊字符

## 输出
- 可直接运行的测试代码
- 简要说明每组测试覆盖的场景
""",
    },
    {
        "name": "doc-writer",
        "title": "Doc Writer",
        "desc": "生成 README、API 文档和代码注释",
        "icon": "📝",
        "content": """---
name: doc-writer
description: "生成清晰、完整的技术文档"
model: claude-sonnet-4-6
---

你是一位技术文档写作专家。

## 职责
- 为代码库生成 README、API 文档、架构说明
- 为复杂函数和模块编写清晰的注释和 docstring
- 生成 CHANGELOG 和迁移指南
- 确保文档与代码保持一致

## 写作原则
1. 先写「为什么」，再写「怎么做」
2. 提供可运行的代码示例
3. 使用简洁直接的语言，避免模糊表述
4. 按读者需求组织内容（快速上手 → 深入细节）
""",
    },
    {
        "name": "security-auditor",
        "title": "Security Auditor",
        "desc": "安全审计，发现漏洞和敏感信息泄露",
        "icon": "🛡️",
        "content": """---
name: security-auditor
description: "安全审计与漏洞扫描"
model: claude-sonnet-4-6
---

你是一位应用安全审计专家。

## 审计范围
- OWASP Top 10 漏洞检测
- 敏感信息泄露（API Key、密码、Token）
- 权限控制和认证机制
- 输入验证和输出编码
- 依赖库已知漏洞

## 输出格式
对每个发现：
- 风险等级：🔴 高危 / 🟠 中危 / 🟡 低危
- 漏洞类型（CWE 编号）
- 影响范围和利用方式
- 修复建议（附代码）
""",
    },
    {
        "name": "refactor-expert",
        "title": "Refactor Expert",
        "desc": "重构代码，提升可读性和可维护性",
        "icon": "♻️",
        "content": """---
name: refactor-expert
description: "代码重构，提升质量和可维护性"
model: claude-sonnet-4-6
---

你是一位代码重构专家。

## 重构原则
- 保持行为不变，只改善内部结构
- 每次只做一种重构，小步前进
- 确保有测试覆盖后再重构
- 遵循 SOLID、DRY、KISS 原则

## 常见重构
1. 提取函数 / 提取类
2. 消除重复代码
3. 简化条件表达式
4. 用多态替代条件分支
5. 引入设计模式（适度）

## 输出
- 重构前后的对比
- 每步重构的理由
- 对现有功能的影响分析
""",
    },
    {
        "name": "git-assistant",
        "title": "Git Assistant",
        "desc": "生成 commit message、PR 描述和 changelog",
        "icon": "📦",
        "content": """---
name: git-assistant
description: "Git 工作流助手：commit、PR、changelog"
model: claude-sonnet-4-6
---

你是一位 Git 工作流助手。

## 职责
- 根据代码变更生成规范的 commit message（Conventional Commits）
- 撰写清晰的 PR 描述（摘要 + 变更列表 + 测试计划）
- 生成 CHANGELOG 条目
- 协助解决 merge conflict

## Commit Message 格式
```
<type>(<scope>): <subject>

<body>

<footer>
```
type: feat | fix | refactor | docs | test | chore | perf | ci
""",
    },
    {
        "name": "performance-optimizer",
        "title": "Performance Optimizer",
        "desc": "分析性能瓶颈，提出优化方案",
        "icon": "⚡",
        "content": """---
name: performance-optimizer
description: "性能分析与优化建议"
model: claude-sonnet-4-6
---

你是一位性能优化专家。

## 分析维度
1. **时间复杂度**：算法效率、热路径优化
2. **空间复杂度**：内存分配、缓存策略
3. **I/O 瓶颈**：数据库查询、网络请求、文件操作
4. **并发**：锁竞争、异步优化、批处理

## 输出格式
- 瓶颈定位（文件:函数:行号）
- 当前性能特征
- 优化方案（附代码）
- 预期改进效果
""",
    },
    {
        "name": "architect",
        "title": "Architect",
        "desc": "架构设计、技术选型和系统设计评审",
        "icon": "🏗️",
        "content": """---
name: architect
description: "系统架构设计与评审"
model: claude-sonnet-4-6
---

你是一位软件架构师。

## 职责
- 评审系统架构设计，识别潜在问题
- 提出技术选型建议（对比优劣）
- 设计模块划分、接口协议和数据流
- 考虑可扩展性、可靠性和可维护性

## 设计原则
1. 关注点分离
2. 依赖倒置
3. 最小知识原则
4. 为失败设计（容错、降级、重试）
5. 避免过度设计
""",
    },
]

PRESET_COMMANDS: list[dict[str, str]] = [
    {
        "name": "review",
        "title": "/review",
        "desc": "审查当前变更或指定文件",
        "icon": "🔍",
        "content": "请审查当前工作目录中的代码变更。关注：\n1. 正确性和潜在 Bug\n2. 代码风格和可读性\n3. 性能问题\n4. 安全漏洞\n\n对每个问题给出严重程度和修复建议。",
    },
    {
        "name": "test",
        "title": "/test",
        "desc": "为指定代码生成测试用例",
        "icon": "🧪",
        "content": "为 $ARGUMENTS 生成全面的测试用例。要求：\n1. 覆盖正常路径和边界条件\n2. 使用项目已有的测试框架\n3. 每个测试只验证一个行为\n4. 测试名称清晰描述期望行为",
    },
    {
        "name": "explain",
        "title": "/explain",
        "desc": "解释代码实现逻辑",
        "icon": "💡",
        "content": "请详细解释 $ARGUMENTS 的实现逻辑：\n1. 整体功能和设计意图\n2. 关键算法和数据结构\n3. 与其他模块的交互关系\n4. 需要注意的边界情况",
    },
    {
        "name": "fix",
        "title": "/fix",
        "desc": "分析并修复错误",
        "icon": "🔧",
        "content": "分析以下错误并提供修复方案：\n$ARGUMENTS\n\n请：\n1. 确定根本原因\n2. 提供修复代码\n3. 说明修复后如何验证\n4. 检查是否存在类似问题",
    },
    {
        "name": "refactor",
        "title": "/refactor",
        "desc": "重构指定代码",
        "icon": "♻️",
        "content": "请重构 $ARGUMENTS：\n1. 保持现有行为不变\n2. 提升可读性和可维护性\n3. 消除代码异味\n4. 给出重构前后的对比说明",
    },
    {
        "name": "commit",
        "title": "/commit",
        "desc": "生成规范的 commit message",
        "icon": "📦",
        "content": "查看当前 git 暂存区的变更，生成一条符合 Conventional Commits 规范的 commit message。\n格式：<type>(<scope>): <subject>\n\n包含简要的 body 说明变更原因。",
    },
    {
        "name": "doc",
        "title": "/doc",
        "desc": "生成文档或注释",
        "icon": "📝",
        "content": "为 $ARGUMENTS 生成文档：\n1. 功能说明\n2. 参数/返回值描述\n3. 使用示例\n4. 注意事项",
    },
    {
        "name": "optimize",
        "title": "/optimize",
        "desc": "分析并优化性能",
        "icon": "⚡",
        "content": "分析 $ARGUMENTS 的性能，找出瓶颈并提出优化方案：\n1. 时间/空间复杂度分析\n2. I/O 和数据库查询优化\n3. 缓存策略\n4. 给出优化前后的对比",
    },
]

PRESET_RULES: list[dict[str, str]] = [
    {
        "name": "no-console-log",
        "title": "No Console Log",
        "desc": "禁止在生产代码中使用 console.log",
        "icon": "🚫",
        "content": "# No Console Log\n\n不要在生产代码中使用 `console.log`。\n- 调试用途请使用项目的 logger 工具\n- 测试代码中可以使用\n- 如确需保留，请加注释说明原因",
    },
    {
        "name": "chinese-comments",
        "title": "中文注释",
        "desc": "使用中文编写注释和文档",
        "icon": "🇨🇳",
        "content": "# 中文注释\n\n所有代码注释、文档字符串和 commit message 使用中文编写。\n- 变量名和函数名保持英文\n- JSDoc / docstring 描述使用中文\n- README 和文档使用中文",
    },
    {
        "name": "error-handling",
        "title": "Error Handling",
        "desc": "统一错误处理规范",
        "icon": "⚠️",
        "content": "# 错误处理规范\n\n1. 不要吞掉异常（空 catch 块）\n2. 使用自定义错误类型区分业务错误和系统错误\n3. 在系统边界（API、用户输入）做输入验证\n4. 内部函数可以假定输入已校验\n5. 错误日志包含上下文信息（参数、状态）",
    },
    {
        "name": "code-style",
        "title": "Code Style",
        "desc": "代码风格和命名规范",
        "icon": "🎨",
        "content": "# 代码风格规范\n\n- 函数名：动词开头（getUserById, parseConfig）\n- 布尔变量：is/has/should 开头\n- 常量：UPPER_SNAKE_CASE\n- 文件名：kebab-case\n- 单个函数不超过 50 行\n- 嵌套不超过 3 层\n- 优先使用 early return 减少嵌套",
    },
    {
        "name": "security-first",
        "title": "Security First",
        "desc": "安全优先编码规范",
        "icon": "🔒",
        "content": "# 安全优先\n\n1. 永远不要硬编码密钥、密码、Token\n2. 用户输入必须验证和转义\n3. SQL 查询使用参数化\n4. 文件路径操作防止目录遍历\n5. HTTP 响应设置安全头（CSP, X-Frame-Options）\n6. 敏感数据不写入日志\n7. 依赖定期更新，关注安全公告",
    },
    {
        "name": "git-workflow",
        "title": "Git Workflow",
        "desc": "Git 提交和分支规范",
        "icon": "📦",
        "content": "# Git 工作流规范\n\n## Commit Message\n- 使用 Conventional Commits：feat/fix/refactor/docs/test/chore\n- 中文描述，简洁明了\n- 每个 commit 只做一件事\n\n## 分支\n- main：稳定版本\n- feat/*：新功能\n- fix/*：修复\n- 合并前必须通过 CI",
    },
]


@router.get("/presets/agents", summary="获取预置 Agent 模板")
def get_preset_agents():
    installed = {a.name for a in list_agents()}
    return [
        {**p, "installed": p["name"] in installed}
        for p in PRESET_AGENTS
    ]


@router.get("/presets/commands", summary="获取预置命令模板")
def get_preset_commands():
    installed = {c.name for c in list_commands()}
    return [
        {**p, "installed": p["name"] in installed}
        for p in PRESET_COMMANDS
    ]


@router.get("/presets/rules", summary="获取预置规则模板")
def get_preset_rules():
    installed = {r.name for r in list_rules()}
    return [
        {**p, "installed": p["name"] in installed}
        for p in PRESET_RULES
    ]


@router.post("/skills/toggle", summary="启用/禁用技能")
def toggle_skill(body: ToggleRequest):
    skills_dir = CLAUDE_HOME / "skills" / body.name
    if not skills_dir.is_dir():
        raise HTTPException(404, f"技能 {body.name} 不存在")
    skill_md = skills_dir / "SKILL.md"
    skill_md_disabled = skills_dir / "SKILL.md.disabled"
    if body.enabled:
        # Enable: rename .disabled back
        if skill_md_disabled.exists() and not skill_md.exists():
            skill_md_disabled.rename(skill_md)
    else:
        # Disable: rename to .disabled
        if skill_md.exists():
            skill_md.rename(skill_md_disabled)
    return {"ok": True, "name": body.name, "enabled": body.enabled}


# ── 自定义命令 ────────────────────────────────────────────────────


class CommandInfo(BaseModel):
    name: str  # filename without extension
    path: str
    content: str
    scope: str  # "global" or "project"
    enabled: bool = True


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
                    enabled=True,
                )
            )
        elif entry.is_file() and entry.name.endswith(".md.disabled"):
            # Disabled command
            try:
                content = entry.read_text(encoding="utf-8")
            except Exception:
                content = ""
            name = entry.name.replace(".md.disabled", "")
            result.append(
                CommandInfo(
                    name=name,
                    path=str(entry),
                    content=content,
                    scope="global",
                    enabled=False,
                )
            )
    return result


@router.post("/commands/toggle", summary="启用/禁用命令")
def toggle_command(body: ToggleRequest):
    commands_dir = CLAUDE_HOME / "commands"
    md_file = commands_dir / f"{body.name}.md"
    disabled_file = commands_dir / f"{body.name}.md.disabled"
    if body.enabled:
        if disabled_file.exists() and not md_file.exists():
            disabled_file.rename(md_file)
    else:
        if md_file.exists():
            md_file.rename(disabled_file)
    return {"ok": True, "name": body.name, "enabled": body.enabled}


@router.post("/commands/create", summary="新建自定义命令")
def create_command(body: CreateItemRequest):
    commands_dir = CLAUDE_HOME / "commands"
    commands_dir.mkdir(parents=True, exist_ok=True)
    md_file = commands_dir / f"{body.name}.md"
    if md_file.exists() or (commands_dir / f"{body.name}.md.disabled").exists():
        raise HTTPException(409, f"命令 {body.name} 已存在")
    md_file.write_text(body.content or f"# {body.name}\n\n在此编写命令内容...\n", encoding="utf-8")
    _invalidate_cache()
    return {"ok": True, "name": body.name}


@router.delete("/commands/{name}", summary="删除自定义命令")
def delete_command(name: str):
    commands_dir = CLAUDE_HOME / "commands"
    md_file = commands_dir / f"{name}.md"
    disabled_file = commands_dir / f"{name}.md.disabled"
    target = md_file if md_file.exists() else disabled_file if disabled_file.exists() else None
    if not target:
        raise HTTPException(404, f"命令 {name} 不存在")
    target.unlink()
    _invalidate_cache()
    return {"ok": True, "name": name}


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
    enabled: bool = True


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
                    enabled=True,
                )
            )
        elif entry.is_file() and entry.name.endswith(".md.disabled"):
            try:
                content = entry.read_text(encoding="utf-8")
            except Exception:
                content = ""
            name = entry.name.replace(".md.disabled", "")
            result.append(
                RuleInfo(
                    name=name,
                    path=str(entry),
                    content=content,
                    scope="global",
                    enabled=False,
                )
            )
    return result


@router.post("/rules/toggle", summary="启用/禁用规则")
def toggle_rule(body: ToggleRequest):
    rules_dir = CLAUDE_HOME / "rules"
    md_file = rules_dir / f"{body.name}.md"
    disabled_file = rules_dir / f"{body.name}.md.disabled"
    if body.enabled:
        if disabled_file.exists() and not md_file.exists():
            disabled_file.rename(md_file)
    else:
        if md_file.exists():
            md_file.rename(disabled_file)
    return {"ok": True, "name": body.name, "enabled": body.enabled}


@router.post("/rules/create", summary="新建规则")
def create_rule(body: CreateItemRequest):
    rules_dir = CLAUDE_HOME / "rules"
    rules_dir.mkdir(parents=True, exist_ok=True)
    md_file = rules_dir / f"{body.name}.md"
    if md_file.exists() or (rules_dir / f"{body.name}.md.disabled").exists():
        raise HTTPException(409, f"规则 {body.name} 已存在")
    md_file.write_text(body.content or f"# {body.name}\n\n在此编写规则内容...\n", encoding="utf-8")
    _invalidate_cache()
    return {"ok": True, "name": body.name}


@router.delete("/rules/{name}", summary="删除规则")
def delete_rule(name: str):
    rules_dir = CLAUDE_HOME / "rules"
    md_file = rules_dir / f"{name}.md"
    disabled_file = rules_dir / f"{name}.md.disabled"
    target = md_file if md_file.exists() else disabled_file if disabled_file.exists() else None
    if not target:
        raise HTTPException(404, f"规则 {name} 不存在")
    target.unlink()
    _invalidate_cache()
    return {"ok": True, "name": name}


# ── Agents 模块 ──────────────────────────────────────────────────


class AgentInfo(BaseModel):
    name: str
    path: str
    content: str
    scope: str  # "global" or "project"
    enabled: bool = True
    metadata: dict[str, Any] = {}


def _parse_agent_file(filepath: Path, scope: str, enabled: bool = True) -> AgentInfo:
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception:
        content = ""
    metadata, _ = _parse_yaml_frontmatter(content)
    name = filepath.stem
    if name.endswith(".disabled"):
        name = name.replace(".md.disabled", "").replace(".disabled", "")
    return AgentInfo(
        name=name,
        path=str(filepath),
        content=content,
        scope=scope,
        enabled=enabled,
        metadata=metadata,
    )


@router.get("/agents", summary="列出所有 Agent")
def list_agents() -> list[AgentInfo]:
    result: list[AgentInfo] = []
    # Global agents: ~/.claude/agents/
    global_dir = CLAUDE_HOME / "agents"
    if global_dir.is_dir():
        for entry in sorted(global_dir.iterdir()):
            if entry.is_file() and entry.suffix == ".md":
                result.append(_parse_agent_file(entry, "global", enabled=True))
            elif entry.is_file() and entry.name.endswith(".md.disabled"):
                name = entry.name.replace(".md.disabled", "")
                agent = _parse_agent_file(entry, "global", enabled=False)
                agent.name = name
                result.append(agent)
    return result


@router.post("/agents/toggle", summary="启用/禁用 Agent")
def toggle_agent(body: ToggleRequest):
    agents_dir = CLAUDE_HOME / "agents"
    md_file = agents_dir / f"{body.name}.md"
    disabled_file = agents_dir / f"{body.name}.md.disabled"
    if body.enabled:
        if disabled_file.exists() and not md_file.exists():
            disabled_file.rename(md_file)
    else:
        if md_file.exists():
            md_file.rename(disabled_file)
    return {"ok": True, "name": body.name, "enabled": body.enabled}


AGENT_TEMPLATE = """---
name: {name}
description: ""
model: claude-sonnet-4-6
---

# {name}

在此编写 Agent 的系统提示词...
"""


@router.post("/agents/create", summary="新建 Agent")
def create_agent(body: CreateItemRequest):
    agents_dir = CLAUDE_HOME / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    md_file = agents_dir / f"{body.name}.md"
    if md_file.exists() or (agents_dir / f"{body.name}.md.disabled").exists():
        raise HTTPException(409, f"Agent {body.name} 已存在")
    md_file.write_text(body.content or AGENT_TEMPLATE.format(name=body.name), encoding="utf-8")
    _invalidate_cache()
    return {"ok": True, "name": body.name}


@router.delete("/agents/{name}", summary="删除 Agent")
def delete_agent(name: str):
    agents_dir = CLAUDE_HOME / "agents"
    md_file = agents_dir / f"{name}.md"
    disabled_file = agents_dir / f"{name}.md.disabled"
    target = md_file if md_file.exists() else disabled_file if disabled_file.exists() else None
    if not target:
        raise HTTPException(404, f"Agent {name} 不存在")
    target.unlink()
    _invalidate_cache()
    return {"ok": True, "name": name}


# ── Disabled Items (Trash) ──────────────────────────────────────────


class DisabledItem(BaseModel):
    type: str          # "agent" | "command" | "rule" | "skill"
    name: str
    file_path: str
    scope: str         # "global"


class RestoreItemRequest(BaseModel):
    type: str   # "agent" | "command" | "rule" | "skill"
    name: str


@router.get("/disabled-items")
def list_disabled_items():
    """列出所有已禁用的 agents、commands、rules、skills"""
    items: list[dict] = []

    # Disabled agents
    agents_dir = CLAUDE_HOME / "agents"
    if agents_dir.is_dir():
        for f in agents_dir.iterdir():
            if f.is_file() and f.name.endswith(".md.disabled"):
                items.append({"type": "agent", "name": f.name.replace(".md.disabled", ""), "file_path": str(f), "scope": "global"})

    # Disabled commands
    commands_dir = CLAUDE_HOME / "commands"
    if commands_dir.is_dir():
        for f in commands_dir.iterdir():
            if f.is_file() and f.name.endswith(".md.disabled"):
                items.append({"type": "command", "name": f.name.replace(".md.disabled", ""), "file_path": str(f), "scope": "global"})

    # Disabled rules
    rules_dir = CLAUDE_HOME / "rules"
    if rules_dir.is_dir():
        for f in rules_dir.iterdir():
            if f.is_file() and f.name.endswith(".md.disabled"):
                items.append({"type": "rule", "name": f.name.replace(".md.disabled", ""), "file_path": str(f), "scope": "global"})

    # Disabled skills
    skills_dir = CLAUDE_HOME / "skills"
    if skills_dir.is_dir():
        for entry in skills_dir.iterdir():
            if entry.is_dir() and (entry / "SKILL.md.disabled").exists() and not (entry / "SKILL.md").exists():
                items.append({"type": "skill", "name": entry.name, "file_path": str(entry / "SKILL.md.disabled"), "scope": "global"})

    return items


@router.post("/disabled-items/restore")
def restore_disabled_item(body: RestoreItemRequest):
    """恢复（重新启用）一个已禁用的项"""
    toggle_body = ToggleRequest(name=body.name, enabled=True)
    if body.type == "agent":
        return toggle_agent(toggle_body)
    elif body.type == "command":
        return toggle_command(toggle_body)
    elif body.type == "rule":
        return toggle_rule(toggle_body)
    elif body.type == "skill":
        return toggle_skill(toggle_body)
    raise HTTPException(400, f"未知类型: {body.type}")


@router.delete("/disabled-items/{item_type}/{name}")
def permanently_delete_disabled_item(item_type: str, name: str):
    """永久删除一个已禁用的项（删除 .disabled 文件）"""
    if item_type == "agent":
        return delete_agent(name)
    elif item_type == "command":
        return delete_command(name)
    elif item_type == "rule":
        return delete_rule(name)
    elif item_type == "skill":
        # Delete the skill dir's SKILL.md.disabled file
        skills_dir = CLAUDE_HOME / "skills" / name
        disabled_file = skills_dir / "SKILL.md.disabled"
        if disabled_file.exists():
            disabled_file.unlink()
            _invalidate_cache()
            return {"ok": True, "message": f"已永久删除 skill {name}"}
        raise HTTPException(404, f"找不到已禁用的 skill: {name}")
    raise HTTPException(400, f"未知类型: {item_type}")


# ── Project-level endpoints ─────────────────────────────────────────


@router.get("/projects/{dir_name}/components")
def get_project_components(dir_name: str):
    """扫描项目级别的 agents, commands, rules"""
    # Convert dir_name back to path
    project_path = "/" + dir_name.replace("-", "/").lstrip("/")
    project_claude_dir = Path(project_path) / ".claude"

    # Also check the projects dir
    project_memory_dir = CLAUDE_HOME / "projects" / dir_name

    result = {
        "dir_name": dir_name,
        "project_path": project_path,
        "agents": [],
        "commands": [],
        "rules": [],
        "has_settings": False,
        "has_claude_md": False,
    }

    # Check for project-level CLAUDE.md
    claude_md_path = Path(project_path) / "CLAUDE.md"
    result["has_claude_md"] = claude_md_path.exists()

    # Check project .claude/ dir
    if project_claude_dir.is_dir():
        # Settings
        result["has_settings"] = (project_claude_dir / "settings.json").exists()

        # Agents
        agents_dir = project_claude_dir / "agents"
        if agents_dir.is_dir():
            for f in agents_dir.iterdir():
                if f.is_file() and f.name.endswith(".md") and not f.name.endswith(".disabled"):
                    result["agents"].append({"name": f.stem, "scope": "project", "enabled": True})
                elif f.is_file() and f.name.endswith(".md.disabled"):
                    result["agents"].append({"name": f.name.replace(".md.disabled", ""), "scope": "project", "enabled": False})

        # Commands
        commands_dir = project_claude_dir / "commands"
        if commands_dir.is_dir():
            for f in commands_dir.iterdir():
                if f.is_file() and f.name.endswith(".md") and not f.name.endswith(".disabled"):
                    result["commands"].append({"name": f.stem, "scope": "project", "enabled": True})
                elif f.is_file() and f.name.endswith(".md.disabled"):
                    result["commands"].append({"name": f.name.replace(".md.disabled", ""), "scope": "project", "enabled": False})

        # Rules
        rules_dir = project_claude_dir / "rules"
        if rules_dir.is_dir():
            for f in rules_dir.iterdir():
                if f.is_file() and f.name.endswith(".md") and not f.name.endswith(".disabled"):
                    result["rules"].append({"name": f.stem, "scope": "project", "enabled": True})
                elif f.is_file() and f.name.endswith(".md.disabled"):
                    result["rules"].append({"name": f.name.replace(".md.disabled", ""), "scope": "project", "enabled": False})

    return result


@router.get("/projects/{dir_name}/details")
def get_project_details(dir_name: str):
    """获取项目的增强详情：会话数、最后活跃时间、CLAUDE.md 简介"""
    project_dir = CLAUDE_HOME / "projects" / dir_name

    result = {
        "dir_name": dir_name,
        "session_count": 0,
        "last_active": None,
        "description": "",
    }

    if not project_dir.is_dir():
        return result

    # Count session JSONL files
    jsonl_files = list(project_dir.glob("*.jsonl"))
    result["session_count"] = len(jsonl_files)

    # Get last modified time
    if jsonl_files:
        latest = max(f.stat().st_mtime for f in jsonl_files)
        from datetime import datetime, timezone
        result["last_active"] = datetime.fromtimestamp(latest, tz=timezone.utc).isoformat()

    # Try to read project CLAUDE.md first line as description
    project_path = "/" + dir_name.replace("-", "/").lstrip("/")
    claude_md = Path(project_path) / "CLAUDE.md"
    if not claude_md.exists():
        claude_md = Path(project_path) / ".claude" / "CLAUDE.md"
    if claude_md.exists():
        try:
            text = claude_md.read_text(encoding="utf-8")
            # Find first non-empty non-heading line as description
            for line in text.split("\n"):
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("```"):
                    result["description"] = line[:200]
                    break
        except Exception:
            pass

    return result

# Settings 页面重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置页面从单调的 15 行流水线 toggle 列表，扩展为包含 12 个面板的 Claude Code 配置可视化仪表盘。

**Architecture:** 后端新增 6 个 Project JSON 配置字段 + 8 个项目级文件系统读取端点；前端新建 12 个 Panel 组件 + 完整重写 settings/index.tsx 主页面，使用 TanStack Query 独立缓存每个面板的数据。

**Tech Stack:** FastAPI + SQLAlchemy 2.0, React 19 + TanStack Query 5 + CSS Modules, TypeScript strict

---

## 文件变更清单

### 后端（修改/新建）
| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/models.py` | 修改 | Project 新增 6 个 Optional[str] JSON 字段 |
| `backend/app/schemas.py` | 修改 | ProjectOut 新增 6 字段；新增 ProjectSettingsUpdate |
| `backend/app/main.py` | 修改 | lifespan 追加 6 条 ALTER TABLE；注册新 router |
| `backend/app/routers/projects.py` | 修改 | 新增 PATCH /{id}/settings 端点 |
| `backend/app/routers/project_settings.py` | 新建 | 8 个文件系统读取端点 |
| `backend/tests/test_project_settings.py` | 新建 | 新端点的 pytest 测试 |

### 前端（修改/新建）
| 文件 | 操作 | 说明 |
|------|------|------|
| `tauri/src/lib/api/types.ts` | 修改 | Project 新增 6 字段；新增 10 个 Response 类型 |
| `tauri/src/lib/api/http.ts` | 修改 | 新增 9 个项目级设置 API 方法 |
| `tauri/src/features/settings/index.tsx` | 重写 | 主页面：12 个面板编排 |
| `tauri/src/features/settings/settings.module.css` | 扩展 | 新增 pipeline flow、chip、grid 等样式 |
| `tauri/src/features/settings/components/PipelineFlow.tsx` | 新建 | 横向流程图节点 |
| `tauri/src/features/settings/components/HooksGrid.tsx` | 新建 | 3×3 Hook 卡片网格 |
| `tauri/src/features/settings/components/ClaudeMdPanel.tsx` | 新建 | CLAUDE.md 规则可视化 |
| `tauri/src/features/settings/components/MemoryPanel.tsx` | 新建 | 记忆文件 2×2 分类网格 |
| `tauri/src/features/settings/components/AutomationPanel.tsx` | 新建 | 自动化调度配置 |
| `tauri/src/features/settings/components/ClaudeRuntimePanel.tsx` | 新建 | Claude 运行时配置（含中国区） |
| `tauri/src/features/settings/components/NotificationPanel.tsx` | 新建 | 通知配置 |
| `tauri/src/features/settings/components/KnowledgeSettingsPanel.tsx` | 新建 | 知识库设置 |
| `tauri/src/features/settings/components/DocsPanel.tsx` | 新建 | 文档配置 |
| `tauri/src/features/settings/components/McpPanel.tsx` | 新建 | MCP 工具展示（只读） |
| `tauri/src/features/settings/components/PermissionsPanel.tsx` | 新建 | 权限配置展示（只读） |
| `tauri/src/features/settings/components/EnvPanel.tsx` | 新建 | 环境变量展示（只读） |

---

## Task 1: 后端 DB 字段迁移 + Model 更新

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py:71-88`（lifespan 中的迁移列表）

- [ ] **Step 1: 在 `models.py` 的 Project 类中追加 6 个新字段**

在 `stages_config` 字段之后、`created_at` 之前添加：

```python
# backend/app/models.py, inside class Project
stages_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 已有

# 新增以下 6 行：
automation_config:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
claude_runtime_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
notification_config:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
docs_config:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
env_config:            Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
knowledge_config:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)  # 已有
```

- [ ] **Step 2: 在 `main.py` lifespan 的 ALTER TABLE 列表中追加 6 条**

在现有最后一条 `"ALTER TABLE tasks ADD COLUMN requirements TEXT"` 之后添加（约第 82 行后）：

```python
        "ALTER TABLE projects ADD COLUMN automation_config TEXT",
        "ALTER TABLE projects ADD COLUMN claude_runtime_config TEXT",
        "ALTER TABLE projects ADD COLUMN notification_config TEXT",
        "ALTER TABLE projects ADD COLUMN docs_config TEXT",
        "ALTER TABLE projects ADD COLUMN env_config TEXT",
        "ALTER TABLE projects ADD COLUMN knowledge_config TEXT",
```

- [ ] **Step 3: 验证后端能正常启动（不报 OperationalError）**

```bash
cd backend && source .venv/bin/activate
python -c "from app.main import app; print('OK')"
```

Expected: 打印 `OK`，无报错

- [ ] **Step 4: Commit**

```bash
cd backend
git add app/models.py app/main.py
git commit -m "feat: add 6 JSON config fields to Project model

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Schema 更新 + PATCH settings 端点

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/projects.py`

- [ ] **Step 1: 更新 `schemas.py` 中的 `ProjectOut`，新增 `ProjectSettingsUpdate`**

```python
# backend/app/schemas.py - 修改 ProjectOut（在 stages_config 行之后添加）
class ProjectOut(BaseModel):
    id: int
    name: str
    repo_url: Optional[str]
    max_parallel: int
    execution_mode: str
    is_test: bool
    feishu_chat_id: Optional[str] = None
    feishu_sync: bool = False
    sort_order: int
    stages_config: Optional[str] = None
    # 新增 6 行：
    automation_config:     Optional[str] = None
    claude_runtime_config: Optional[str] = None
    notification_config:   Optional[str] = None
    docs_config:           Optional[str] = None
    env_config:            Optional[str] = None
    knowledge_config:      Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}

# 在文件末尾追加新 Schema：
class ProjectSettingsUpdate(BaseModel):
    automation_config:     Optional[str] = None
    claude_runtime_config: Optional[str] = None
    notification_config:   Optional[str] = None
    docs_config:           Optional[str] = None
    env_config:            Optional[str] = None
    knowledge_config:      Optional[str] = None
```

- [ ] **Step 2: 在 `routers/projects.py` 中添加 PATCH 端点**

在 `update_stages_config` 函数之后添加（约第 149 行后）：

```python
# backend/app/routers/projects.py - 在 update_stages_config 后追加
from ..schemas import ProjectSettingsUpdate  # 追加到文件顶部 import

@router.patch("/{project_id}/settings", response_model=ProjectOut, summary="批量更新项目配置字段")
def patch_project_settings(project_id: int, body: ProjectSettingsUpdate, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p
```

- [ ] **Step 3: 写测试（先写，预期会失败）**

```python
# backend/tests/test_project_settings.py - 先创建文件
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def _create_project(name="test-settings"):
    resp = client.post("/api/projects", json={"name": name, "repo_url": ""})
    return resp.json()["id"]

def test_patch_settings_automation():
    pid = _create_project("patch-test")
    import json
    config = json.dumps({"enabled": True, "weekdays": [1,2,3,4,5], "max_concurrent": 2,
                         "time_from": "09:00", "time_to": "22:00"})
    resp = client.patch(f"/api/projects/{pid}/settings",
                        json={"automation_config": config})
    assert resp.status_code == 200
    assert resp.json()["automation_config"] == config

def test_patch_settings_runtime():
    pid = _create_project("runtime-test")
    import json
    config = json.dumps({"timeout_seconds": 240, "max_retries": 2,
                         "model": "claude-sonnet-4-6", "region": "cn"})
    resp = client.patch(f"/api/projects/{pid}/settings",
                        json={"claude_runtime_config": config})
    assert resp.status_code == 200
    data = resp.json()
    assert data["claude_runtime_config"] == config

def test_patch_settings_404():
    resp = client.patch("/api/projects/99999/settings", json={"docs_config": "{}"})
    assert resp.status_code == 404
```

- [ ] **Step 4: 运行测试（预期失败 → 方法不存在）**

```bash
cd backend && python -m pytest tests/test_project_settings.py::test_patch_settings_automation -v
```

Expected: FAIL — ImportError 或 404

- [ ] **Step 5: 验证 PATCH 端点（测试应通过）**

```bash
cd backend && python -m pytest tests/test_project_settings.py -v
```

Expected: 3 tests PASSED

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py app/routers/projects.py tests/test_project_settings.py
git commit -m "feat: add PATCH /api/projects/:id/settings endpoint

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 文件系统读取 Backend 端点

**Files:**
- Create: `backend/app/routers/project_settings.py`
- Modify: `backend/app/main.py`（import + include_router）

- [ ] **Step 1: 创建 `backend/app/routers/project_settings.py`**

```python
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
            "rules": _extract_rules(content),
        }

    # 项目级：.claude/CLAUDE.md（个人补充）
    dot_md = project_path / ".claude" / "CLAUDE.md"
    if dot_md.exists():
        content = dot_md.read_text(encoding="utf-8", errors="replace")
        result["project_dot"] = {
            "path": str(dot_md),
            "size": dot_md.stat().st_size,
            "rules": _extract_rules(content),
        }

    # 全局：~/.claude/CLAUDE.md
    global_md = CLAUDE_HOME / "CLAUDE.md"
    if global_md.exists():
        content = global_md.read_text(encoding="utf-8", errors="replace")
        result["global"] = {
            "path": str(global_md),
            "size": global_md.stat().st_size,
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
            "enabled": len(entries) > 0,
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
```

- [ ] **Step 2: 在 `main.py` 注册新 router**

在 imports 部分（约第 21-34 行）追加：
```python
from .routers import project_settings as project_settings_router
```

在 `app.include_router(projects.router)` 之后追加：
```python
app.include_router(project_settings_router.router)  # GET /api/projects/{id}/claude-config, /hooks-status, /memory, /mcp-servers, /permissions, /settings-local; POST /hooks-toggle
```

- [ ] **Step 3: 为新端点补充测试**

在 `tests/test_project_settings.py` 追加：

```python
import os
import json
import tempfile
from pathlib import Path

def test_claude_config_no_path():
    """无 repo_url 的项目应返回 404"""
    pid = _create_project("no-path-test")
    # 强制清空 repo_url（直接操作 DB）
    from sqlalchemy.orm import Session
    from app.database import engine
    from app.models import Project
    with Session(engine) as db:
        p = db.get(Project, pid)
        p.repo_url = None
        db.commit()
    resp = client.get(f"/api/projects/{pid}/claude-config")
    assert resp.status_code == 404

def test_hooks_status_returns_9_events():
    """hooks-status 必须包含 9 种事件，每个有 global/project 两层"""
    pid = _create_project("hooks-test")
    resp = client.get(f"/api/projects/{pid}/hooks-status")
    assert resp.status_code == 200
    hooks = resp.json()["hooks"]
    assert len(hooks) == 9
    for h in hooks:
        assert "event" in h
        assert "global" in h
        assert "project" in h

def test_memory_returns_categories():
    """memory 端点即使无文件也应返回 4 个分类键"""
    pid = _create_project("memory-test")
    resp = client.get(f"/api/projects/{pid}/memory")
    assert resp.status_code == 200
    data = resp.json()
    for key in ["user", "feedback", "project", "reference"]:
        assert key in data
        assert isinstance(data[key], list)

def test_mcp_servers_no_file():
    pid = _create_project("mcp-test")
    resp = client.get(f"/api/projects/{pid}/mcp-servers")
    assert resp.status_code == 200
    assert resp.json() == {"servers": []}

def test_permissions_empty():
    pid = _create_project("perm-test")
    resp = client.get(f"/api/projects/{pid}/permissions")
    assert resp.status_code == 200
    assert resp.json() == {"allow": [], "deny": []}

def test_settings_local_not_exists():
    pid = _create_project("local-test")
    resp = client.get(f"/api/projects/{pid}/settings-local")
    assert resp.status_code == 200
    assert resp.json()["exists"] == False
```

- [ ] **Step 4: 运行所有新测试**

```bash
cd backend && python -m pytest tests/test_project_settings.py -v
```

Expected: 全部 PASSED（约 10 个测试）

- [ ] **Step 5: Commit**

```bash
git add app/routers/project_settings.py app/main.py tests/test_project_settings.py
git commit -m "feat: add project-scoped Claude config file-reading endpoints

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 前端 TypeScript 类型 + API 方法

**Files:**
- Modify: `tauri/src/lib/api/types.ts`
- Modify: `tauri/src/lib/api/http.ts`

- [ ] **Step 1: 在 `types.ts` 中为 Project 新增 6 个可选字段**

在 `stages_config: string | null` 行之后添加：
```typescript
// types.ts - Project interface 内追加
automation_config:     string | null
claude_runtime_config: string | null
notification_config:   string | null
docs_config:           string | null
env_config:            string | null
knowledge_config:      string | null
```

- [ ] **Step 2: 在 `types.ts` 末尾追加新 Response 类型**

```typescript
// types.ts 末尾追加

export interface ClaudeRule {
  text: string
  category: string
}

export interface ClaudeMdSection {
  path: string
  size: number
  rules: ClaudeRule[]
}

export interface ClaudeConfigResponse {
  project_root?: ClaudeMdSection
  project_dot?: ClaudeMdSection
  global?: ClaudeMdSection
}

export interface HookInfo {
  event: string
  scope: string
  enabled: boolean
  commands: string[]
}

export interface HookStatusEntry {
  event: string
  global: HookInfo | null
  project: HookInfo | null
}

export interface HooksStatusResponse {
  hooks: HookStatusEntry[]
}

export interface MemoryEntry {
  name: string
  description: string
  file: string
}

export interface MemoryResponse {
  user: MemoryEntry[]
  feedback: MemoryEntry[]
  project: MemoryEntry[]
  reference: MemoryEntry[]
}

export interface McpServerInfo {
  name: string
  tools: string[]
  status: 'ok' | 'missing'
}

export interface McpServersResponse {
  servers: McpServerInfo[]
}

export interface PermRule {
  rule: string
  source: 'global' | 'project' | 'local'
}

export interface PermissionsResponse {
  allow: PermRule[]
  deny: PermRule[]
}

export interface SettingsLocalResponse {
  exists: boolean
  content: Record<string, unknown> | null
  error?: string
}

export interface ProjectSettingsUpdate {
  automation_config?: string | null
  claude_runtime_config?: string | null
  notification_config?: string | null
  docs_config?: string | null
  env_config?: string | null
  knowledge_config?: string | null
}
```

- [ ] **Step 3: 在 `http.ts` 中追加 9 个项目级设置 API 方法**

在 `getProjectDocuments` 函数之前（约第 704 行）插入：

```typescript
// http.ts - 项目级 Claude 配置 API（项目级，与全局 claudeConfig 命名空间区分）

getProjectClaudeConfig(projectId: number) {
  return this.fetch<ClaudeConfigResponse>(`/api/projects/${projectId}/claude-config`)
}

getProjectHooksStatus(projectId: number) {
  return this.fetch<HooksStatusResponse>(`/api/projects/${projectId}/hooks-status`)
}

toggleProjectHook(projectId: number, event: string, scope: 'global' | 'project', enabled: boolean) {
  return this.fetch<{ ok: boolean }>(`/api/projects/${projectId}/hooks-toggle`, {
    method: 'POST',
    body: JSON.stringify({ event, scope, enabled }),
  })
}

getProjectMemory(projectId: number) {
  return this.fetch<MemoryResponse>(`/api/projects/${projectId}/memory`)
}

getProjectMcpServers(projectId: number) {
  return this.fetch<McpServersResponse>(`/api/projects/${projectId}/mcp-servers`)
}

getProjectPermissions(projectId: number) {
  return this.fetch<PermissionsResponse>(`/api/projects/${projectId}/permissions`)
}

getProjectSettingsLocal(projectId: number) {
  return this.fetch<SettingsLocalResponse>(`/api/projects/${projectId}/settings-local`)
}

patchProjectSettings(projectId: number, data: ProjectSettingsUpdate) {
  return this.fetch<Project>(`/api/projects/${projectId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
```

同时，在 `types.ts` 的 `ApiAdapter` interface（约第 530 行附近）中追加这 8 个方法签名（与 http.ts 保持一致）。

- [ ] **Step 4: 确认这些方法加入 `types.ts` 的 ApiAdapter interface**

```typescript
// types.ts - ApiAdapter interface 内追加
getProjectClaudeConfig(projectId: number): Promise<ClaudeConfigResponse>
getProjectHooksStatus(projectId: number): Promise<HooksStatusResponse>
toggleProjectHook(projectId: number, event: string, scope: 'global' | 'project', enabled: boolean): Promise<{ ok: boolean }>
getProjectMemory(projectId: number): Promise<MemoryResponse>
getProjectMcpServers(projectId: number): Promise<McpServersResponse>
getProjectPermissions(projectId: number): Promise<PermissionsResponse>
getProjectSettingsLocal(projectId: number): Promise<SettingsLocalResponse>
patchProjectSettings(projectId: number, data: ProjectSettingsUpdate): Promise<Project>
```

- [ ] **Step 5: TypeScript 类型检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts
git commit -m "feat: add project-scoped settings API types and methods

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: PipelineFlow 横向流程图组件

**Files:**
- Create: `tauri/src/features/settings/components/PipelineFlow.tsx`
- Modify: `tauri/src/features/settings/settings.module.css`（追加样式）

- [ ] **Step 1: 创建 `PipelineFlow.tsx`**

```tsx
// tauri/src/features/settings/components/PipelineFlow.tsx
import { useCallback } from 'react'
import styles from '../settings.module.css'

const ALL_STAGES = [
  'input', 'discovery', 'analysis', 'prd', 'architecture',
  'ui', 'plan', 'dev', 'review', 'test', 'security',
  'staging', 'deploy', 'monitor', 'done',
] as const

const FIXED_STAGES = new Set(['input', 'done'])
const APPROVAL_STAGES = new Set(['analysis', 'prd', 'ui', 'plan', 'test', 'deploy'])

const CONFIGURABLE_STAGES = ALL_STAGES.filter((s) => !FIXED_STAGES.has(s))

const STAGE_LABELS: Record<string, string> = {
  input:        '需求输入',
  discovery:    '市场调研',
  analysis:     '需求分析',
  prd:          '产品文档',
  architecture: '架构设计',
  ui:           'UI/UX',
  plan:         '技术规划',
  dev:          '代码实现',
  review:       '代码审查',
  test:         '测试',
  security:     '安全审查',
  staging:      '预发布',
  deploy:       '部署',
  monitor:      '监控',
  done:         '完成',
}

interface PipelineFlowProps {
  enabledStages: Set<string> | null  // null = 全部启用
  onToggle: (stage: string, enabled: boolean) => void
  disabled?: boolean
}

export function PipelineFlow({ enabledStages, onToggle, disabled }: PipelineFlowProps) {
  const isEnabled = useCallback(
    (stage: string) => enabledStages === null || enabledStages.has(stage),
    [enabledStages]
  )

  const handleClick = (stage: string) => {
    if (disabled || FIXED_STAGES.has(stage)) return
    onToggle(stage, !isEnabled(stage))
  }

  return (
    <div className={styles.pipelineFlow}>
      {ALL_STAGES.map((stage, index) => {
        const fixed = FIXED_STAGES.has(stage)
        const enabled = isEnabled(stage)
        const approval = APPROVAL_STAGES.has(stage)
        const nodeClass = fixed
          ? styles.pipelineNodeFixed
          : enabled
            ? styles.pipelineNodeEnabled
            : styles.pipelineNodeDisabled

        return (
          <div key={stage} className={styles.pipelineItem}>
            {index > 0 && <div className={styles.pipelineArrow}>›</div>}
            <div
              className={`${styles.pipelineNode} ${nodeClass}`}
              onClick={() => handleClick(stage)}
              title={`${STAGE_LABELS[stage]}${approval ? '（需审批）' : ''}`}
            >
              <span className={enabled && !fixed ? '' : styles.pipelineNodeStrike}>
                {stage}
              </span>
              {approval && <span className={styles.pipelineApprovalDot} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 在 `settings.module.css` 末尾追加 PipelineFlow 样式**

```css
/* settings.module.css 末尾追加 */

/* ── PipelineFlow ── */
.pipelineFlow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
}

.pipelineItem {
  display: flex;
  align-items: center;
}

.pipelineArrow {
  font-size: 14px;
  color: var(--tc-foreground-secondary);
  margin: 0 1px;
  user-select: none;
}

.pipelineNode {
  position: relative;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 11px;
  font-family: monospace;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.pipelineNode:hover:not(.pipelineNodeFixed) {
  opacity: 0.75;
}

.pipelineNodeEnabled {
  background: rgba(100, 80, 255, 0.16);
  border-color: rgba(100, 80, 255, 0.45);
  color: var(--tc-foreground);
}

.pipelineNodeDisabled {
  background: transparent;
  border-color: var(--tc-border);
  color: var(--tc-foreground-secondary);
}

.pipelineNodeFixed {
  background: var(--tc-panel-bg);
  border-color: var(--tc-border);
  color: var(--tc-foreground-secondary);
  cursor: default;
  opacity: 0.6;
}

.pipelineNodeStrike {
  text-decoration: line-through;
  opacity: 0.5;
}

.pipelineApprovalDot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fbbf24;
  border: 1px solid var(--tc-panel-bg);
}

/* ── Chip 通用样式 ── */
.chipRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--tc-border);
  font-size: 11px;
  cursor: pointer;
  color: var(--tc-foreground-secondary);
  background: transparent;
  transition: all 0.15s;
  user-select: none;
}

.chip:hover {
  border-color: var(--tc-border-active);
  color: var(--tc-foreground);
}

.chipActive {
  background: var(--tc-accent-bg);
  border-color: var(--tc-accent);
  color: var(--tc-accent-on-bg, var(--tc-foreground));
}

/* ── 内联标签行 ── */
.fieldRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.fieldLabel {
  font-size: 12px;
  color: var(--tc-foreground-secondary);
  min-width: 72px;
  flex-shrink: 0;
}

.fieldInput {
  padding: 4px 8px;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: var(--tc-content-bg);
  color: var(--tc-foreground);
  font-size: 12px;
  width: 90px;
}

.fieldInput:focus {
  outline: none;
  border-color: var(--tc-border-active);
}

/* ── 星期选择器 ── */
.weekdayGrid {
  display: flex;
  gap: 4px;
}

.weekdayBtn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--tc-border);
  background: transparent;
  color: var(--tc-foreground-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.weekdayBtn:hover {
  border-color: var(--tc-border-active);
}

.weekdayBtnActive {
  background: var(--tc-accent-bg);
  border-color: var(--tc-accent);
  color: var(--tc-accent-on-bg, var(--tc-foreground));
}

/* ── 规则 chip（CLAUDE.md）── */
.ruleChip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--tc-content-bg);
  border: 1px solid var(--tc-border);
  font-size: 11px;
  color: var(--tc-foreground);
  margin: 2px;
  max-width: 300px;
}

.ruleChipCategory {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.ruleChipText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Hooks 3×3 卡片 ── */
.hooksGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.hookCard {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--tc-border);
  background: var(--tc-content-bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hookCardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hookEventName {
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
  color: var(--tc-foreground);
}

.hookScopeDots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.scopeDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  opacity: 0.3;
  transition: opacity 0.15s;
}

.scopeDotActive {
  opacity: 1;
  box-shadow: 0 0 4px currentColor;
}

.hookDesc {
  font-size: 10px;
  color: var(--tc-foreground-secondary);
  line-height: 1.4;
}

.hookCardFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hookPhaseTag {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

/* ── 记忆文件 2×2 ── */
.memoryGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.memoryCell {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--tc-border);
  background: var(--tc-content-bg);
}

.memoryCellBadge {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
}

.memoryCellCount {
  font-size: 20px;
  font-weight: 700;
  color: var(--tc-foreground);
  line-height: 1;
  margin-bottom: 4px;
}

.memoryCellList {
  font-size: 10px;
  color: var(--tc-foreground-secondary);
  list-style: none;
  padding: 0;
  margin: 0;
}

.memoryCellList li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 0;
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/settings/components/PipelineFlow.tsx tauri/src/features/settings/settings.module.css
git commit -m "feat: add PipelineFlow horizontal pipeline visualization component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: HooksGrid 组件

**Files:**
- Create: `tauri/src/features/settings/components/HooksGrid.tsx`

- [ ] **Step 1: 创建 `HooksGrid.tsx`**

```tsx
// tauri/src/features/settings/components/HooksGrid.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '../../../ui/toggle'
import { api } from '../../../lib/api'
import type { HookStatusEntry } from '../../../lib/api/types'
import styles from '../settings.module.css'

interface HookMeta {
  desc: string
  phase: string
  phaseColor: string
}

const HOOK_META: Record<string, HookMeta> = {
  PreToolUse:          { desc: '工具调用前，可阻断或修改输入',   phase: '调用前',  phaseColor: '#f59e0b' },
  PostToolUse:         { desc: '工具调用成功后执行',             phase: '调用后',  phaseColor: '#10b981' },
  PostToolUseFailure:  { desc: '工具调用失败后执行',             phase: '失败',    phaseColor: '#ef4444' },
  SessionStart:        { desc: '会话启动时执行一次',             phase: '会话',    phaseColor: '#6366f1' },
  SessionEnd:          { desc: '会话正常结束时执行',             phase: '会话',    phaseColor: '#6366f1' },
  Stop:                { desc: 'Claude 停止输出前执行',          phase: '停止',    phaseColor: '#8b5cf6' },
  SubagentStart:       { desc: '子代理（Task tool）启动时',      phase: '代理',    phaseColor: '#0ea5e9' },
  SubagentStop:        { desc: '子代理执行结束时',               phase: '代理',    phaseColor: '#0ea5e9' },
  Notification:        { desc: '需要发送通知时（如等待输入）',   phase: '通知',    phaseColor: '#ec4899' },
}

interface HooksGridProps {
  projectId: number
  hooks: HookStatusEntry[]
}

export function HooksGrid({ projectId, hooks }: HooksGridProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ event, scope, enabled }: { event: string; scope: 'global' | 'project'; enabled: boolean }) =>
      api.toggleProjectHook(projectId, event, scope, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-hooks', projectId] })
    },
  })

  return (
    <div className={styles.hooksGrid}>
      {hooks.map((h) => {
        const meta = HOOK_META[h.event] ?? { desc: '', phase: '其他', phaseColor: '#6b7280' }
        const globalEnabled = h.global?.enabled ?? false
        const projectEnabled = h.project?.enabled ?? false
        // mini toggle 控制项目级 hook
        const toggleEnabled = projectEnabled

        return (
          <div key={h.event} className={styles.hookCard}>
            <div className={styles.hookCardHeader}>
              <span className={styles.hookEventName}>{h.event}</span>
              <div className={styles.hookScopeDots}>
                <span
                  className={`${styles.scopeDot} ${globalEnabled ? styles.scopeDotActive : ''}`}
                  style={{ color: '#4a80cc', background: '#4a80cc' }}
                  title={`全局: ${globalEnabled ? '启用' : '未配置'}`}
                />
                <span
                  className={`${styles.scopeDot} ${projectEnabled ? styles.scopeDotActive : ''}`}
                  style={{ color: '#3aaa60', background: '#3aaa60' }}
                  title={`项目级: ${projectEnabled ? '启用' : '未配置'}`}
                />
              </div>
            </div>
            <div className={styles.hookDesc}>{meta.desc}</div>
            <div className={styles.hookCardFooter}>
              <span
                className={styles.hookPhaseTag}
                style={{
                  background: `${meta.phaseColor}20`,
                  color: meta.phaseColor,
                  border: `1px solid ${meta.phaseColor}40`,
                }}
              >
                {meta.phase}
              </span>
              <Toggle
                checked={toggleEnabled}
                onChange={(checked) =>
                  mutation.mutate({ event: h.event, scope: 'project', enabled: checked })
                }
                disabled={mutation.isPending}
                title="控制项目级 hook"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add tauri/src/features/settings/components/HooksGrid.tsx
git commit -m "feat: add HooksGrid 3x3 card component with scope dots and toggle

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: ClaudeMdPanel + MemoryPanel（只读可视化）

**Files:**
- Create: `tauri/src/features/settings/components/ClaudeMdPanel.tsx`
- Create: `tauri/src/features/settings/components/MemoryPanel.tsx`

- [ ] **Step 1: 创建 `ClaudeMdPanel.tsx`**

```tsx
// tauri/src/features/settings/components/ClaudeMdPanel.tsx
import type { ClaudeConfigResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  '范围': { bg: '#6366f115', color: '#818cf8' },
  'DB':   { bg: '#0ea5e915', color: '#38bdf8' },
  '前端': { bg: '#10b98115', color: '#34d399' },
  'UI':   { bg: '#ec489915', color: '#f472b6' },
  '行为': { bg: '#f59e0b15', color: '#fbbf24' },
  '语言': { bg: '#8b5cf615', color: '#a78bfa' },
  '限制': { bg: '#ef444415', color: '#f87171' },
}

function RuleChips({ rules, label }: { rules: Array<{ text: string; category: string }>; label: string }) {
  if (!rules.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {rules.map((rule, i) => {
          const c = CATEGORY_COLORS[rule.category] ?? { bg: '#6b728015', color: '#9ca3af' }
          return (
            <span key={i} className={styles.ruleChip} title={rule.text}>
              <span
                className={styles.ruleChipCategory}
                style={{ background: c.bg, color: c.color }}
              >
                {rule.category}
              </span>
              <span className={styles.ruleChipText}>{rule.text}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

interface ClaudeMdPanelProps {
  data: ClaudeConfigResponse | undefined
  isLoading: boolean
}

export function ClaudeMdPanel({ data, isLoading }: ClaudeMdPanelProps) {
  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  }
  if (!data) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>无 CLAUDE.md 文件</div>
  }

  const totalRules =
    (data.project_root?.rules.length ?? 0) +
    (data.project_dot?.rules.length ?? 0) +
    (data.global?.rules.length ?? 0)

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tc-foreground-secondary)', marginBottom: 12 }}>
        共 {totalRules} 条规则
      </div>
      {data.project_root && (
        <RuleChips rules={data.project_root.rules} label={`项目根目录 CLAUDE.md（${(data.project_root.size / 1024).toFixed(1)} KB）`} />
      )}
      {data.project_dot && (
        <RuleChips rules={data.project_dot.rules} label={`.claude/CLAUDE.md（${(data.project_dot.size / 1024).toFixed(1)} KB）`} />
      )}
      {data.global && (
        <RuleChips rules={data.global.rules} label={`全局 ~/.claude/CLAUDE.md（${(data.global.size / 1024).toFixed(1)} KB）`} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `MemoryPanel.tsx`**

```tsx
// tauri/src/features/settings/components/MemoryPanel.tsx
import type { MemoryResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

const CATEGORY_META = {
  user:      { label: '用户',   color: '#6366f1', bg: '#6366f115' },
  feedback:  { label: '反馈',   color: '#f59e0b', bg: '#f59e0b15' },
  project:   { label: '项目',   color: '#10b981', bg: '#10b98115' },
  reference: { label: '参考',   color: '#0ea5e9', bg: '#0ea5e915' },
} as const

interface MemoryPanelProps {
  data: MemoryResponse | undefined
  isLoading: boolean
}

export function MemoryPanel({ data, isLoading }: MemoryPanelProps) {
  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  }

  const categories: Array<keyof typeof CATEGORY_META> = ['user', 'feedback', 'project', 'reference']

  return (
    <div className={styles.memoryGrid}>
      {categories.map((cat) => {
        const meta = CATEGORY_META[cat]
        const entries = data?.[cat] ?? []
        return (
          <div key={cat} className={styles.memoryCell}>
            <span
              className={styles.memoryCellBadge}
              style={{ background: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
            <div className={styles.memoryCellCount}>{entries.length}</div>
            <ul className={styles.memoryCellList}>
              {entries.slice(0, 5).map((e) => (
                <li key={e.file} title={e.description}>{e.name}</li>
              ))}
              {entries.length > 5 && (
                <li style={{ opacity: 0.5 }}>+{entries.length - 5} 更多</li>
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/settings/components/ClaudeMdPanel.tsx \
        tauri/src/features/settings/components/MemoryPanel.tsx
git commit -m "feat: add ClaudeMdPanel rule chips and MemoryPanel 2x2 grid

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: AutomationPanel + ClaudeRuntimePanel（可编辑）

**Files:**
- Create: `tauri/src/features/settings/components/AutomationPanel.tsx`
- Create: `tauri/src/features/settings/components/ClaudeRuntimePanel.tsx`

- [ ] **Step 1: 创建 `AutomationPanel.tsx`**

```tsx
// tauri/src/features/settings/components/AutomationPanel.tsx
import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface AutomationConfig {
  enabled: boolean
  time_from: string
  time_to: string
  weekdays: number[]  // 0=Mon,1=Tue,...,6=Sun
  max_concurrent: number
}

const DEFAULT: AutomationConfig = {
  enabled: false,
  time_from: '09:00',
  time_to: '22:00',
  weekdays: [0, 1, 2, 3, 4],
  max_concurrent: 2,
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const CONCURRENT_PRESETS = [1, 2, 3, 5]

interface AutomationPanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function AutomationPanel({ value, onChange, disabled }: AutomationPanelProps) {
  const [cfg, setCfg] = useState<AutomationConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<AutomationConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const toggleWeekday = (day: number) => {
    const days = cfg.weekdays.includes(day)
      ? cfg.weekdays.filter((d) => d !== day)
      : [...cfg.weekdays, day].sort()
    update({ weekdays: days })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 自动化总开关 */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>启用自动化</span>
        <Toggle checked={cfg.enabled} onChange={(v) => update({ enabled: v })} disabled={disabled} />
      </div>

      {cfg.enabled && (
        <>
          {/* 执行时间窗口 */}
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>执行时段</span>
            <input
              type="time"
              value={cfg.time_from}
              onChange={(e) => update({ time_from: e.target.value })}
              className={styles.fieldInput}
              disabled={disabled}
            />
            <span style={{ color: 'var(--tc-foreground-secondary)', fontSize: 12 }}>—</span>
            <input
              type="time"
              value={cfg.time_to}
              onChange={(e) => update({ time_to: e.target.value })}
              className={styles.fieldInput}
              disabled={disabled}
            />
          </div>

          {/* 星期选择 */}
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>执行星期</span>
            <div className={styles.weekdayGrid}>
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  className={`${styles.weekdayBtn} ${cfg.weekdays.includes(i) ? styles.weekdayBtnActive : ''}`}
                  onClick={() => toggleWeekday(i)}
                  disabled={disabled}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 最大并发数 */}
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>最大并发</span>
            <div className={styles.chipRow}>
              {CONCURRENT_PRESETS.map((n) => (
                <button
                  key={n}
                  className={`${styles.chip} ${cfg.max_concurrent === n ? styles.chipActive : ''}`}
                  onClick={() => update({ max_concurrent: n })}
                  disabled={disabled}
                >
                  {n} 个
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `ClaudeRuntimePanel.tsx`**

```tsx
// tauri/src/features/settings/components/ClaudeRuntimePanel.tsx
import { useState } from 'react'
import styles from '../settings.module.css'

interface ClaudeRuntimeConfig {
  timeout_seconds: number
  max_retries: number
  model: string
  region: 'global' | 'cn'
}

const DEFAULT: ClaudeRuntimeConfig = {
  timeout_seconds: 120,
  max_retries: 1,
  model: 'claude-sonnet-4-6',
  region: 'global',
}

const TIMEOUT_PRESETS = [60, 120, 240]
const RETRY_PRESETS = [0, 1, 2, 3]
const MODEL_OPTIONS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

interface ClaudeRuntimePanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function ClaudeRuntimePanel({ value, onChange, disabled }: ClaudeRuntimePanelProps) {
  const [cfg, setCfg] = useState<ClaudeRuntimeConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<ClaudeRuntimeConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const isCn = cfg.region === 'cn'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 区域选择 */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>区域</span>
        <div className={styles.chipRow}>
          {(['global', 'cn'] as const).map((r) => (
            <button
              key={r}
              className={`${styles.chip} ${cfg.region === r ? styles.chipActive : ''}`}
              onClick={() => {
                const patch: Partial<ClaudeRuntimeConfig> = { region: r }
                // 切换到中国区时自动设置 240s 超时
                if (r === 'cn' && cfg.timeout_seconds < 240) {
                  patch.timeout_seconds = 240
                }
                update(patch)
              }}
              disabled={disabled}
              style={r === 'cn' && cfg.region === 'cn' ? { borderColor: '#fbbf24', color: '#fbbf24' } : undefined}
            >
              {r === 'cn' ? '🇨🇳 中国区' : '🌐 全球'}
            </button>
          ))}
        </div>
        {isCn && (
          <span style={{ fontSize: 10, color: '#fbbf24', marginLeft: 4 }}>
            中国区建议 ≥ 240s
          </span>
        )}
      </div>

      {/* 超时时间 */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>超时时间</span>
        <div className={styles.chipRow}>
          {TIMEOUT_PRESETS.map((t) => (
            <button
              key={t}
              className={`${styles.chip} ${cfg.timeout_seconds === t ? styles.chipActive : ''}`}
              onClick={() => update({ timeout_seconds: t })}
              disabled={disabled}
              style={isCn && t === 240 ? { borderColor: '#fbbf2460' } : undefined}
            >
              {t}s{isCn && t === 240 ? ' ✓' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* 重试次数 */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>重试次数</span>
        <div className={styles.chipRow}>
          {RETRY_PRESETS.map((n) => (
            <button
              key={n}
              className={`${styles.chip} ${cfg.max_retries === n ? styles.chipActive : ''}`}
              onClick={() => update({ max_retries: n })}
              disabled={disabled}
            >
              {n === 0 ? '不重试' : `${n} 次`}
            </button>
          ))}
        </div>
      </div>

      {/* 模型选择 */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>模型</span>
        <select
          value={cfg.model}
          onChange={(e) => update({ model: e.target.value })}
          className={styles.fieldInput}
          disabled={disabled}
          style={{ width: 240 }}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/settings/components/AutomationPanel.tsx \
        tauri/src/features/settings/components/ClaudeRuntimePanel.tsx
git commit -m "feat: add AutomationPanel weekday grid and ClaudeRuntimePanel China region preset

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: NotificationPanel + KnowledgeSettingsPanel + DocsPanel

**Files:**
- Create: `tauri/src/features/settings/components/NotificationPanel.tsx`
- Create: `tauri/src/features/settings/components/KnowledgeSettingsPanel.tsx`
- Create: `tauri/src/features/settings/components/DocsPanel.tsx`

- [ ] **Step 1: 创建 `NotificationPanel.tsx`**

```tsx
// tauri/src/features/settings/components/NotificationPanel.tsx
import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface NotificationConfig {
  tts_enabled: boolean
  webhook_enabled: boolean
  webhook_url: string
  triggers: string[]
}

const DEFAULT: NotificationConfig = {
  tts_enabled: true,
  webhook_enabled: false,
  webhook_url: '',
  triggers: ['approval', 'task_fail'],
}

const TRIGGER_OPTIONS = [
  { value: 'approval',       label: '需审批' },
  { value: 'task_complete',  label: '任务完成' },
  { value: 'task_fail',      label: '任务失败' },
  { value: 'stage_advance',  label: '阶段推进' },
]

interface NotificationPanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function NotificationPanel({ value, onChange, disabled }: NotificationPanelProps) {
  const [cfg, setCfg] = useState<NotificationConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<NotificationConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const toggleTrigger = (t: string) => {
    const triggers = cfg.triggers.includes(t)
      ? cfg.triggers.filter((x) => x !== t)
      : [...cfg.triggers, t]
    update({ triggers })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>语音播报</span>
        <Toggle checked={cfg.tts_enabled} onChange={(v) => update({ tts_enabled: v })} disabled={disabled} />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>Webhook</span>
        <Toggle checked={cfg.webhook_enabled} onChange={(v) => update({ webhook_enabled: v })} disabled={disabled} />
      </div>

      {cfg.webhook_enabled && (
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Webhook URL</span>
          <input
            type="url"
            value={cfg.webhook_url}
            onChange={(e) => update({ webhook_url: e.target.value })}
            placeholder="https://..."
            className={styles.fieldInput}
            style={{ width: 280 }}
            disabled={disabled}
          />
        </div>
      )}

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>触发时机</span>
        <div className={styles.chipRow}>
          {TRIGGER_OPTIONS.map(({ value: t, label }) => (
            <button
              key={t}
              className={`${styles.chip} ${cfg.triggers.includes(t) ? styles.chipActive : ''}`}
              onClick={() => toggleTrigger(t)}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `KnowledgeSettingsPanel.tsx`**

```tsx
// tauri/src/features/settings/components/KnowledgeSettingsPanel.tsx
import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface KnowledgeConfig {
  max_entries: number
  auto_accumulate: boolean
  prompt_injection: boolean
  cleanup_strategy: string
}

const DEFAULT: KnowledgeConfig = {
  max_entries: 100,
  auto_accumulate: true,
  prompt_injection: true,
  cleanup_strategy: 'oldest_first',
}

const CLEANUP_OPTIONS = [
  { value: 'none',            label: '不自动清理' },
  { value: 'oldest_first',    label: '清理最旧条目' },
  { value: 'lowest_relevance', label: '清理低相关度' },
]

const MAX_ENTRIES_PRESETS = [50, 100, 200, 500]

interface KnowledgeSettingsPanelProps {
  value: string | null
  knowledgeCount: number
  onChange: (json: string) => void
  disabled?: boolean
}

export function KnowledgeSettingsPanel({ value, knowledgeCount, onChange, disabled }: KnowledgeSettingsPanelProps) {
  const [cfg, setCfg] = useState<KnowledgeConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<KnowledgeConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 当前条目统计 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tc-foreground)' }}>{knowledgeCount}</div>
          <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)' }}>当前条目</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tc-foreground)' }}>{cfg.max_entries}</div>
          <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)' }}>上限</div>
        </div>
      </div>

      {/* 上限设置 */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>条目上限</span>
        <div className={styles.chipRow}>
          {MAX_ENTRIES_PRESETS.map((n) => (
            <button
              key={n}
              className={`${styles.chip} ${cfg.max_entries === n ? styles.chipActive : ''}`}
              onClick={() => update({ max_entries: n })}
              disabled={disabled}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>自动积累</span>
        <Toggle checked={cfg.auto_accumulate} onChange={(v) => update({ auto_accumulate: v })} disabled={disabled} />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>注入 Prompt</span>
        <Toggle checked={cfg.prompt_injection} onChange={(v) => update({ prompt_injection: v })} disabled={disabled} />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>清理策略</span>
        <select
          value={cfg.cleanup_strategy}
          onChange={(e) => update({ cleanup_strategy: e.target.value })}
          className={styles.fieldInput}
          style={{ width: 160 }}
          disabled={disabled}
        >
          {CLEANUP_OPTIONS.map(({ value: v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 `DocsPanel.tsx`**

```tsx
// tauri/src/features/settings/components/DocsPanel.tsx
import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface DocLink {
  title: string
  url_or_path: string
  description: string
}

interface DocsConfig {
  links: DocLink[]
  auto_update_arch: boolean
}

const DEFAULT: DocsConfig = { links: [], auto_update_arch: false }

interface DocsPanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function DocsPanel({ value, onChange, disabled }: DocsPanelProps) {
  const [cfg, setCfg] = useState<DocsConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })
  const [adding, setAdding] = useState(false)
  const [newLink, setNewLink] = useState<DocLink>({ title: '', url_or_path: '', description: '' })

  const update = (patch: Partial<DocsConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const addLink = () => {
    if (!newLink.title || !newLink.url_or_path) return
    update({ links: [...cfg.links, newLink] })
    setNewLink({ title: '', url_or_path: '', description: '' })
    setAdding(false)
  }

  const removeLink = (i: number) => {
    update({ links: cfg.links.filter((_, idx) => idx !== i) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>自动更新架构文档</span>
        <Toggle checked={cfg.auto_update_arch} onChange={(v) => update({ auto_update_arch: v })} disabled={disabled} />
      </div>

      {/* 文档卡片列表 */}
      {cfg.links.map((link, i) => (
        <div key={i} style={{
          padding: '8px 12px', borderRadius: 8, border: '1px solid var(--tc-border)',
          background: 'var(--tc-content-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tc-foreground)' }}>{link.title}</div>
            <div style={{ fontSize: 10, color: 'var(--tc-accent)', fontFamily: 'monospace', marginTop: 2 }}>
              {link.url_or_path}
            </div>
            {link.description && (
              <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', marginTop: 2 }}>
                {link.description}
              </div>
            )}
          </div>
          <button
            onClick={() => removeLink(i)}
            disabled={disabled}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tc-foreground-secondary)', fontSize: 14 }}
          >
            ×
          </button>
        </div>
      ))}

      {/* 添加新文档 */}
      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px dashed var(--tc-border)', borderRadius: 8 }}>
          <input placeholder="标题" value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
            className={styles.fieldInput} style={{ width: '100%' }} />
          <input placeholder="路径或 URL" value={newLink.url_or_path} onChange={(e) => setNewLink({ ...newLink, url_or_path: e.target.value })}
            className={styles.fieldInput} style={{ width: '100%' }} />
          <input placeholder="描述（可选）" value={newLink.description} onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
            className={styles.fieldInput} style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`${styles.chip} ${styles.chipActive}`} onClick={addLink}>确认</button>
            <button className={styles.chip} onClick={() => setAdding(false)}>取消</button>
          </div>
        </div>
      ) : (
        <button className={styles.chip} onClick={() => setAdding(true)} disabled={disabled} style={{ alignSelf: 'flex-start' }}>
          + 添加文档
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add tauri/src/features/settings/components/NotificationPanel.tsx \
        tauri/src/features/settings/components/KnowledgeSettingsPanel.tsx \
        tauri/src/features/settings/components/DocsPanel.tsx
git commit -m "feat: add NotificationPanel, KnowledgeSettingsPanel, DocsPanel components

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: McpPanel + PermissionsPanel + EnvPanel（只读面板）

**Files:**
- Create: `tauri/src/features/settings/components/McpPanel.tsx`
- Create: `tauri/src/features/settings/components/PermissionsPanel.tsx`
- Create: `tauri/src/features/settings/components/EnvPanel.tsx`

- [ ] **Step 1: 创建 `McpPanel.tsx`**

```tsx
// tauri/src/features/settings/components/McpPanel.tsx
import type { McpServersResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

interface McpPanelProps {
  data: McpServersResponse | undefined
  isLoading: boolean
}

export function McpPanel({ data, isLoading }: McpPanelProps) {
  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  if (!data?.servers.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)', padding: '8px 0' }}>
        未配置 MCP 服务器（项目根目录无 .mcp.json）
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.servers.map((server) => (
        <div key={server.name} style={{
          padding: '10px 12px', borderRadius: 8, border: '1px solid var(--tc-border)',
          background: 'var(--tc-content-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: server.status === 'ok' ? 'var(--tc-success)' : 'var(--tc-error)',
              boxShadow: server.status === 'ok' ? '0 0 4px var(--tc-success)' : undefined,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--tc-foreground)' }}>
              {server.name}
            </span>
          </div>
          {server.tools.length > 0 && (
            <div className={styles.chipRow}>
              {server.tools.map((tool) => (
                <span key={tool} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  background: 'var(--tc-accent-bg)',
                  color: 'var(--tc-accent-on-bg, var(--tc-foreground))',
                  fontFamily: 'monospace',
                }}>
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `PermissionsPanel.tsx`**

```tsx
// tauri/src/features/settings/components/PermissionsPanel.tsx
import type { PermissionsResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  global:  { bg: '#4a80cc20', color: '#4a80cc' },
  project: { bg: '#3aaa6020', color: '#3aaa60' },
  local:   { bg: '#f59e0b20', color: '#f59e0b' },
}

const SOURCE_LABELS: Record<string, string> = {
  global:  '全局',
  project: '项目',
  local:   '本地',
}

interface PermissionsPanelProps {
  data: PermissionsResponse | undefined
  isLoading: boolean
}

export function PermissionsPanel({ data, isLoading }: PermissionsPanelProps) {
  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>

  const allows = data?.allow ?? []
  const denies = data?.deny ?? []

  if (!allows.length && !denies.length) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>无权限配置</div>
  }

  const renderList = (rules: typeof allows, color: string) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {rules.map((r, i) => {
        const sc = SOURCE_COLORS[r.source] ?? SOURCE_COLORS.local
        return (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            border: `1px solid ${color}40`, background: `${color}10`,
            fontSize: 11, fontFamily: 'monospace',
          }}>
            <span>{r.rule}</span>
            <span style={{
              fontSize: 9, padding: '1px 4px', borderRadius: 3,
              background: sc.bg, color: sc.color, fontFamily: 'sans-serif',
            }}>
              {SOURCE_LABELS[r.source] ?? r.source}
            </span>
          </span>
        )
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {allows.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, marginBottom: 6 }}>✓ 允许</div>
          {renderList(allows, '#10b981')}
        </div>
      )}
      {denies.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>✗ 拒绝</div>
          {renderList(denies, '#ef4444')}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建 `EnvPanel.tsx`**

```tsx
// tauri/src/features/settings/components/EnvPanel.tsx
import styles from '../settings.module.css'

const SENSITIVE_KEYS = ['PIN', 'TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'AUTH']

function maskValue(key: string, value: string): string {
  const upper = key.toUpperCase()
  if (SENSITIVE_KEYS.some((k) => upper.includes(k))) {
    return value.length > 4 ? `${'*'.repeat(value.length - 4)}${value.slice(-4)}` : '****'
  }
  return value
}

interface EnvPanelProps {
  envConfig: string | null  // JSON string: Record<string, string> 或 null
}

export function EnvPanel({ envConfig }: EnvPanelProps) {
  let vars: Record<string, string> = {}
  if (envConfig) {
    try { vars = JSON.parse(envConfig) } catch { /* ignore */ }
  }

  // 筛选 TC_ 前缀的变量
  const tcVars = Object.entries(vars).filter(([k]) => k.startsWith('TC_'))

  if (!tcVars.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>
        无 TC_ 前缀环境变量配置
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tcVars.map(([key, value]) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'var(--tc-content-bg)',
          border: '1px solid var(--tc-border)',
          fontSize: 11,
        }}>
          <span style={{ fontFamily: 'monospace', color: 'var(--tc-accent)', minWidth: 160 }}>{key}</span>
          <span style={{ fontFamily: 'monospace', color: 'var(--tc-foreground-secondary)' }}>
            {maskValue(key, value)}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add tauri/src/features/settings/components/McpPanel.tsx \
        tauri/src/features/settings/components/PermissionsPanel.tsx \
        tauri/src/features/settings/components/EnvPanel.tsx
git commit -m "feat: add read-only McpPanel, PermissionsPanel, EnvPanel components

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Settings 主页面完整重写

**Files:**
- Rewrite: `tauri/src/features/settings/index.tsx`

这是最关键的 Task，将所有面板组合进统一的仪表盘。

- [ ] **Step 1: 完整重写 `tauri/src/features/settings/index.tsx`**

```tsx
// tauri/src/features/settings/index.tsx
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '../../ui/toggle'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import type { ProjectSettingsUpdate } from '../../lib/api/types'
import { PipelineFlow } from './components/PipelineFlow'
import { HooksGrid } from './components/HooksGrid'
import { ClaudeMdPanel } from './components/ClaudeMdPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { AutomationPanel } from './components/AutomationPanel'
import { ClaudeRuntimePanel } from './components/ClaudeRuntimePanel'
import { NotificationPanel } from './components/NotificationPanel'
import { KnowledgeSettingsPanel } from './components/KnowledgeSettingsPanel'
import { DocsPanel } from './components/DocsPanel'
import { McpPanel } from './components/McpPanel'
import { PermissionsPanel } from './components/PermissionsPanel'
import { EnvPanel } from './components/EnvPanel'
import styles from './settings.module.css'

function parseStagesConfig(raw: string | null): Set<string> | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr)
  } catch { /* ignore */ }
  return null
}

const CONFIGURABLE_STAGES = [
  'discovery', 'analysis', 'prd', 'architecture',
  'ui', 'plan', 'dev', 'review', 'test', 'security',
  'staging', 'deploy', 'monitor',
] as const

function SectionCard({
  title,
  hint,
  children,
  warning,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  warning?: boolean
}) {
  return (
    <div className={warning ? styles.sectionWarning : styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>{title}</div>
        {hint && <div className={styles.sectionHint}>{hint}</div>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projectId = activeProjectId ? Number(activeProjectId) : null
  const queryClient = useQueryClient()

  // ── 项目基础数据 ──
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    staleTime: 30_000,
  })
  const project = projects?.find((p) => p.id === projectId)

  // ── 文件系统数据（60s 缓存）──
  const { data: claudeConfig, isLoading: claudeConfigLoading } = useQuery({
    queryKey: ['project-claude-config', projectId],
    queryFn: () => api.getProjectClaudeConfig(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: hooksStatus, isLoading: hooksLoading } = useQuery({
    queryKey: ['project-hooks', projectId],
    queryFn: () => api.getProjectHooksStatus(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: memoryData, isLoading: memoryLoading } = useQuery({
    queryKey: ['project-memory', projectId],
    queryFn: () => api.getProjectMemory(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: mcpData, isLoading: mcpLoading } = useQuery({
    queryKey: ['project-mcp', projectId],
    queryFn: () => api.getProjectMcpServers(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: permData, isLoading: permLoading } = useQuery({
    queryKey: ['project-permissions', projectId],
    queryFn: () => api.getProjectPermissions(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  // 知识库条目数（复用已有接口）
  const { data: knowledgeItems } = useQuery({
    queryKey: ['project-knowledge', projectId],
    queryFn: () => api.getProjectKnowledge(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  // ── 流水线阶段 Mutation ──
  const stagesMutation = useMutation({
    mutationFn: (stages: string[]) => api.updateProjectStagesConfig(projectId!, stages),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const enabledSet = project ? parseStagesConfig(project.stages_config) : null

  const handleStageToggle = useCallback(
    (stage: string, enabled: boolean) => {
      if (!project) return
      const current = enabledSet ?? new Set(CONFIGURABLE_STAGES)
      if (enabled) current.add(stage)
      else current.delete(stage)
      stagesMutation.mutate(CONFIGURABLE_STAGES.filter((s) => current.has(s)))
    },
    [project, enabledSet, stagesMutation]
  )

  // ── 项目设置 Mutation（批量保存 6 个 JSON 字段）──
  const settingsMutation = useMutation({
    mutationFn: (data: ProjectSettingsUpdate) => api.patchProjectSettings(projectId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  if (!project) return null

  const isSaving = stagesMutation.isPending || settingsMutation.isPending

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>{project.name} · 项目设置</div>
        <div className={styles.headerHint}>
          Claude Code 配置可视化 · {isSaving ? '保存中...' : ''}
        </div>
      </div>

      {/* ── 组一：流水线 ── */}
      <SectionCard
        title="① 流水线阶段"
        hint="点击节点切换启用/禁用；黄色点 = 需人工审批；input/done 始终保留"
      >
        <PipelineFlow
          enabledStages={enabledSet}
          onToggle={handleStageToggle}
          disabled={stagesMutation.isPending}
        />
      </SectionCard>

      {/* ── 组二：Claude 配置文件 ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground-secondary)', margin: '20px 0 8px', letterSpacing: '0.05em' }}>
        CLAUDE CODE 配置文件
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="② Hooks 配置" hint="蓝点=全局 / 绿点=项目级；toggle 控制项目级 hook">
          {hooksLoading ? (
            <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
          ) : (
            <HooksGrid projectId={projectId!} hooks={hooksStatus?.hooks ?? []} />
          )}
        </SectionCard>

        <SectionCard title="③ CLAUDE.md 规则" hint="从项目根目录与全局配置文件提取规则条目">
          <ClaudeMdPanel data={claudeConfig} isLoading={claudeConfigLoading} />
        </SectionCard>
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="④ 记忆文件" hint="~/.claude/projects/{project}/memory/">
          <MemoryPanel data={memoryData} isLoading={memoryLoading} />
        </SectionCard>

        <SectionCard title="⑩ MCP 工具" hint=".mcp.json 中的 mcpServers（只读）">
          <McpPanel data={mcpData} isLoading={mcpLoading} />
        </SectionCard>
      </div>

      <SectionCard title="⑪ 权限配置" hint="三层 allow/deny 合并展示（只读）：全局 / 项目 / 本地">
        <PermissionsPanel data={permData} isLoading={permLoading} />
      </SectionCard>

      {/* ── 组三：项目配置 ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground-secondary)', margin: '20px 0 8px', letterSpacing: '0.05em' }}>
        项目配置
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="② 自动化调度" hint="设置任务自动执行时间窗口和并发限制">
          <AutomationPanel
            value={project.automation_config ?? null}
            onChange={(json) => settingsMutation.mutate({ automation_config: json })}
            disabled={isSaving}
          />
        </SectionCard>

        <SectionCard title="③ Claude 运行时" hint="超时、重试、模型、区域预设">
          <ClaudeRuntimePanel
            value={project.claude_runtime_config ?? null}
            onChange={(json) => settingsMutation.mutate({ claude_runtime_config: json })}
            disabled={isSaving}
          />
        </SectionCard>
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="⑦ 通知配置" hint="语音播报、Webhook、触发时机">
          <NotificationPanel
            value={project.notification_config ?? null}
            onChange={(json) => settingsMutation.mutate({ notification_config: json })}
            disabled={isSaving}
          />
        </SectionCard>

        <SectionCard title="⑧ 知识库设置" hint="自动积累 + Prompt 注入 + 清理策略">
          <KnowledgeSettingsPanel
            value={project.knowledge_config ?? null}
            knowledgeCount={knowledgeItems?.length ?? 0}
            onChange={(json) => settingsMutation.mutate({ knowledge_config: json })}
            disabled={isSaving}
          />
        </SectionCard>
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="⑨ 文档配置" hint="项目相关文档与架构文档链接">
          <DocsPanel
            value={project.docs_config ?? null}
            onChange={(json) => settingsMutation.mutate({ docs_config: json })}
            disabled={isSaving}
          />
        </SectionCard>

        <SectionCard title="⑫ 环境变量" hint="TC_ 前缀变量（只读，敏感字段脱敏）">
          <EnvPanel envConfig={project.env_config ?? null} />
        </SectionCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 检查（必须全部通过）**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 零报错。如有报错，逐条修复（常见：类型不匹配、缺少 null 检查、interface 缺少方法签名）

- [ ] **Step 3: 在浏览器中验证**

```bash
cd tauri && pnpm dev
```

打开 `http://localhost:7071`，选择项目后导航到设置页：
1. ✓ 页面不再是单调列表，而是分组卡片布局
2. ✓ 流水线节点横向排列，enabled 节点有紫色背景，disabled 有删除线
3. ✓ Hooks 3×3 卡片网格，每卡有事件名、描述、阶段标签、scope 点、mini toggle
4. ✓ CLAUDE.md 规则显示为彩色分类 chip
5. ✓ 记忆文件 2×2 分类格
6. ✓ AutomationPanel 有星期格子和并发 chip
7. ✓ ClaudeRuntimePanel 中国区切换自动设置 240s

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/settings/index.tsx
git commit -m "feat: rewrite settings page as comprehensive Claude config dashboard

Replaces 15-row pipeline toggle list with 12-panel card visualization:
- Horizontal pipeline flow with node click-to-toggle
- Hooks 3×3 card grid with scope dots
- CLAUDE.md rule chips with category classification
- Memory files 2×2 category grid
- AutomationPanel with weekday selector
- ClaudeRuntimePanel with China region preset (auto 240s timeout)
- NotificationPanel, KnowledgeSettingsPanel, DocsPanel
- Read-only McpPanel, PermissionsPanel, EnvPanel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review（对照 Spec 检查）

检查 spec 文档 `docs/superpowers/specs/2026-03-30-settings-page-redesign.md` 的每个 section：

| 面板 | Spec 章节 | 计划 Task | 状态 |
|------|----------|-----------|------|
| ① 流水线阶段 | § 板块清单① | Task 5 PipelineFlow | ✓ |
| ② 自动化调度 | § 板块清单② | Task 8 AutomationPanel | ✓ |
| ③ Claude 运行时配置 | § 板块清单③ | Task 8 ClaudeRuntimePanel | ✓ |
| ④ CLAUDE.md 规则 | § 板块清单④ | Task 3 端点 + Task 7 ClaudeMdPanel | ✓ |
| ⑤ Hooks 配置 | § 板块清单⑤ | Task 3 端点 + Task 6 HooksGrid | ✓ |
| ⑥ 记忆文件 | § 板块清单⑥ | Task 3 端点 + Task 7 MemoryPanel | ✓ |
| ⑦ 通知配置 | § 板块清单⑦ | Task 9 NotificationPanel | ✓ |
| ⑧ 知识库 | § 板块清单⑧ | Task 9 KnowledgeSettingsPanel | ✓ |
| ⑨ 文档配置 | § 板块清单⑨ | Task 9 DocsPanel | ✓ |
| ⑩ MCP 工具 | § 板块清单⑩ | Task 3 端点 + Task 10 McpPanel | ✓ |
| ⑪ 权限配置 | § 板块清单⑪ | Task 3 端点 + Task 10 PermissionsPanel | ✓ |
| ⑫ 环境变量 | § 板块清单⑫ | Task 10 EnvPanel | ✓ |
| 后端 6 新字段 | § 后端变更 | Task 1+2 | ✓ |
| 9 个新 API 端点 | § 后端变更 API | Task 2+3 | ✓（8个端点+1个PATCH=9个）|
| DB 迁移 | § 实现顺序建议1 | Task 1 | ✓ |

**Spec 未在本次范围内的内容（已在 spec 中明确排除）**：
- CLAUDE.md 在线编辑
- Hooks 命令自定义
- MCP server 增删
- 权限规则增删

所有 placeholder 扫描：无 TBD / TODO / "fill in" / "implement later" 出现。

---

**计划完成。共 11 个实现 Task + Self-Review。**

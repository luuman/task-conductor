# Input 阶段需求完善工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在任务 `input` 阶段打造 AI 驱动的需求完善工作台：AI 通过 MCP 工具创建任务并导航到任务页，页面展示结构化需求字段（左）+ PRD 实时预览（右），AI 面板完成对话后生成完整需求文档，再启动流水线。

**Architecture:** 后端新增 `requirements` 字段存储结构化需求 JSON，新增 TC MCP Tools Python 脚本供 Claude Code 注册使用（通过标准 stdio MCP 协议），新增 `/api/ui/navigate` 端点通过 WebSocket 将导航指令推送到前端；前端在 input 阶段渲染 `RequirementWorkspace`（双栏：字段面板 + Markdown 预览），全局监听 WS `ui` 频道并执行路由跳转。

**Tech Stack:** FastAPI + SQLAlchemy（后端），Python stdio MCP server（TC 工具），React 19 + CSS Modules + TanStack Query 5（前端），i18next（国际化）

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/models.py` | 修改 | Task 新增 `requirements` 字段 |
| `backend/app/schemas.py` | 修改 | TaskOut 新增 `requirements` |
| `backend/app/main.py` | 修改 | 迁移 SQL + 注册 WS `ui` 端点 |
| `backend/app/routers/ui_nav.py` | 新建 | `POST /api/ui/navigate` 端点 |
| `backend/tc_mcp_server.py` | 新建 | stdio MCP 工具服务器脚本 |
| `backend/install_tc_mcp.sh` | 新建 | 一键注册 MCP 到 Claude Code |
| `tauri/src/lib/api/types.ts` | 修改 | Task 新增 `requirements`，新增 `InterviewMessage` |
| `tauri/src/lib/api/http.ts` | 修改 | 新增 `updateRequirements`, `getInterviewMessages`, `saveInterviewMessage` |
| `tauri/src/hooks/useUiNavigate.ts` | 新建 | WS `ui` 频道监听 → React Router navigate |
| `tauri/src/app/Router.tsx` | 修改 | 挂载 `useUiNavigate` |
| `tauri/src/features/task-detail/components/RequirementWorkspace.tsx` | 新建 | 需求字段面板 |
| `tauri/src/features/task-detail/components/RequirementWorkspace.module.css` | 新建 | 样式 |
| `tauri/src/features/task-detail/components/PrdPreview.tsx` | 新建 | Markdown PRD 预览 |
| `tauri/src/features/task-detail/components/PrdPreview.module.css` | 新建 | 样式 |
| `tauri/src/features/task-detail/hooks/useTaskDetailData.ts` | 修改 | 新增 `updateRequirements` mutation |
| `tauri/src/features/task-detail/index.tsx` | 修改 | input 阶段显示 RequirementWorkspace |

---

## Task 1：后端 — Task 模型新增 `requirements` 字段

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 在 Task 模型新增 requirements 字段**

在 `backend/app/models.py` 的 `Task` 类中，在 `canvas_data` 字段后新增：

```python
requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
# 结构化需求字段，JSON 格式：
# {"background": "...", "target_users": "...", "core_features": [...],
#  "acceptance_criteria": [...], "tech_constraints": "..."}
```

- [ ] **Step 2: 在 TaskOut schema 新增 requirements**

在 `backend/app/schemas.py` 的 `TaskOut` 类中，在 `canvas_data` 后新增：

```python
requirements: Optional[str] = None  # 结构化需求 JSON
```

- [ ] **Step 3: 在 main.py 迁移列表新增 ALTER TABLE**

在 `backend/app/main.py` 的 `migrations` 列表（现有 ALTER TABLE 集合）中新增：

```python
"ALTER TABLE tasks ADD COLUMN requirements TEXT",
```

- [ ] **Step 4: 重启后端验证迁移**

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload
```

访问 `http://localhost:8765/api/tasks/1`，确认返回 JSON 中包含 `"requirements": null`。

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/main.py
git commit -m "feat: add requirements field to Task model"
```

---

## Task 2：后端 — UI 导航 WebSocket 端点

**Files:**
- Create: `backend/app/routers/ui_nav.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 新建 ui_nav.py**

创建 `backend/app/routers/ui_nav.py`：

```python
"""
UI 导航 — 通过 WebSocket 将路由跳转指令推送给前端
"""
from fastapi import APIRouter
from pydantic import BaseModel
from ..ws.manager import manager

router = APIRouter(prefix="/api/ui", tags=["UI 控制"])


class NavigateBody(BaseModel):
    path: str  # 如 "/task/42"


@router.post("/navigate", summary="通知前端跳转到指定页面")
async def navigate_to(body: NavigateBody):
    await manager.broadcast("ui", "navigate", {"path": body.path})
    return {"ok": True, "path": body.path}
```

- [ ] **Step 2: 在 main.py 注册路由 + WS 端点**

在 `backend/app/main.py` 中找到路由注册区域，新增：

```python
from .routers import ui_nav as ui_nav_router
app.include_router(ui_nav_router.router)
```

然后在现有 WebSocket 端点区域新增：

```python
@app.websocket("/ws/ui")
async def ws_ui(websocket: WebSocket):
    await manager.connect(websocket, "ui")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "ui")
```

- [ ] **Step 3: 验证端点存在**

```bash
curl -s -X POST http://localhost:8765/api/ui/navigate \
  -H "Content-Type: application/json" \
  -d '{"path": "/task/1"}'
# 期望输出: {"ok":true,"path":"/task/1"}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/ui_nav.py backend/app/main.py
git commit -m "feat: add UI navigate WS broadcast endpoint"
```

---

## Task 3：后端 — TC MCP Tools 服务器脚本

**Files:**
- Create: `backend/tc_mcp_server.py`
- Create: `backend/install_tc_mcp.sh`

- [ ] **Step 1: 新建 tc_mcp_server.py**

创建 `backend/tc_mcp_server.py`：

```python
#!/usr/bin/env python3
"""
TaskConductor MCP Tools Server
Claude Code 可通过此脚本调用 TaskConductor 的操作工具。

工具列表：
  - tc_create_task      创建任务并返回 task_id
  - tc_navigate_to      让前端跳转到指定页面
  - tc_update_requirements  更新任务需求字段
  - tc_start_pipeline   启动任务流水线
  - tc_get_task         查询任务详情
  - tc_get_interview_messages  获取访谈历史消息
  - tc_save_interview_message  保存一条访谈消息
"""
import json
import sys
import os
import urllib.request
import urllib.error

BASE_URL = os.environ.get("TC_BASE_URL", "http://localhost:8765")
TOKEN = os.environ.get("TC_TOKEN", "")


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}


# ── MCP Protocol ──────────────────────────────────────────────────

TOOLS = [
    {
        "name": "tc_create_task",
        "description": "在 TaskConductor 中创建一个新任务，返回 task_id。创建后可调用 tc_navigate_to 跳转到任务页面。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "所属项目 ID"},
                "title": {"type": "string", "description": "任务标题"},
                "description": {"type": "string", "description": "任务简短描述（可选）"},
            },
            "required": ["project_id", "title"],
        },
    },
    {
        "name": "tc_navigate_to",
        "description": "让 TaskConductor 前端界面跳转到指定路径，如 /task/42 或 /versions。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "前端路由路径，如 /task/42"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "tc_update_requirements",
        "description": "更新任务的结构化需求字段（背景、目标用户、核心功能、验收标准、技术约束）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
                "requirements": {
                    "type": "object",
                    "description": "需求字段",
                    "properties": {
                        "background": {"type": "string"},
                        "target_users": {"type": "string"},
                        "core_features": {"type": "array", "items": {"type": "string"}},
                        "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
                        "tech_constraints": {"type": "string"},
                    },
                },
            },
            "required": ["task_id", "requirements"],
        },
    },
    {
        "name": "tc_start_pipeline",
        "description": "启动任务流水线（任务需处于 input/pending 状态）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "tc_get_task",
        "description": "查询任务详情，包含当前阶段、状态、需求字段等。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "tc_save_interview_message",
        "description": "保存一条访谈对话消息到任务，role 为 assistant 或 user。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
                "role": {"type": "string", "enum": ["user", "assistant"]},
                "content": {"type": "string", "description": "消息内容"},
            },
            "required": ["task_id", "role", "content"],
        },
    },
    {
        "name": "tc_get_interview_messages",
        "description": "获取任务的访谈历史消息列表。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
            },
            "required": ["task_id"],
        },
    },
]


def handle_tool_call(name: str, args: dict) -> str:
    if name == "tc_create_task":
        result = _request("POST", f"/api/projects/{args['project_id']}/tasks", {
            "title": args["title"],
            "description": args.get("description", ""),
        })
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_navigate_to":
        result = _request("POST", "/api/ui/navigate", {"path": args["path"]})
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_update_requirements":
        result = _request("PUT", f"/api/tasks/{args['task_id']}/requirements", {
            "requirements": json.dumps(args["requirements"], ensure_ascii=False),
        })
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_start_pipeline":
        result = _request("POST", f"/api/tasks/{args['task_id']}/start")
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_get_task":
        result = _request("GET", f"/api/tasks/{args['task_id']}")
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_save_interview_message":
        result = _request("POST", f"/api/tasks/{args['task_id']}/interview/message", {
            "role": args["role"],
            "content": args["content"],
        })
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_get_interview_messages":
        result = _request("GET", f"/api/tasks/{args['task_id']}/interview/messages")
        return json.dumps(result, ensure_ascii=False)

    else:
        return json.dumps({"error": f"Unknown tool: {name}"})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        method = req.get("method", "")

        if method == "initialize":
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "task-conductor", "version": "1.0.0"},
                },
            }
        elif method == "tools/list":
            resp = {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
        elif method == "tools/call":
            params = req.get("params", {})
            tool_name = params.get("name", "")
            tool_args = params.get("arguments", {})
            content = handle_tool_call(tool_name, tool_args)
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": content}]},
            }
        else:
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        print(json.dumps(resp, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 新建 install_tc_mcp.sh**

创建 `backend/install_tc_mcp.sh`：

```bash
#!/usr/bin/env bash
# 将 TaskConductor MCP 工具注册到 Claude Code
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_SCRIPT="$SCRIPT_DIR/tc_mcp_server.py"
CLAUDE_JSON="$HOME/.claude.json"

if [ ! -f "$CLAUDE_JSON" ]; then
  echo '{}' > "$CLAUDE_JSON"
fi

python3 - <<PYEOF
import json, sys
path = "$CLAUDE_JSON"
script = "$MCP_SCRIPT"
with open(path) as f:
    data = json.load(f)
data.setdefault("mcpServers", {})["task-conductor"] = {
    "type": "stdio",
    "command": "python3",
    "args": [script],
    "env": {"TC_BASE_URL": "http://localhost:8765"}
}
with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print("✅ TaskConductor MCP 工具已注册到 Claude Code")
print("   重启 Claude Code 后生效")
PYEOF
```

```bash
chmod +x backend/install_tc_mcp.sh
```

- [ ] **Step 3: 后端新增 PUT /api/tasks/{id}/requirements 端点**

在 `backend/app/routers/tasks.py` 中新增：

```python
class RequirementsBody(BaseModel):
    requirements: str  # JSON string


@router.put("/{task_id}/requirements", response_model=TaskOut, summary="更新任务需求字段")
def update_requirements(task_id: int, body: RequirementsBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.requirements = body.requirements
    db.commit()
    db.refresh(t)
    return t
```

- [ ] **Step 4: 验证 MCP 工具脚本可运行**

```bash
cd backend
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 tc_mcp_server.py
# 期望输出包含: "serverInfo":{"name":"task-conductor"...}
```

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | python3 tc_mcp_server.py
# 期望输出包含 7 个工具的列表
```

- [ ] **Step 5: Commit**

```bash
git add backend/tc_mcp_server.py backend/install_tc_mcp.sh backend/app/routers/tasks.py
git commit -m "feat: add TC MCP tools server + requirements API endpoint"
```

---

## Task 4：前端 — WS `ui` 频道导航监听

**Files:**
- Create: `tauri/src/hooks/useUiNavigate.ts`
- Modify: `tauri/src/app/Router.tsx`

- [ ] **Step 1: 新建 useUiNavigate.ts**

创建 `tauri/src/hooks/useUiNavigate.ts`：

```typescript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8765'

export function useUiNavigate() {
  const navigate = useNavigate()

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      ws = new WebSocket(`${WS_BASE}/ws/ui`)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'navigate' && msg.data?.path) {
            navigate(msg.data.path)
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [navigate])
}
```

- [ ] **Step 2: 在 Router.tsx 挂载 useUiNavigate**

读取 `tauri/src/app/Router.tsx`，找到路由组件的根组件（通常是 `<Routes>` 的父级），创建一个 wrapper 组件挂载 hook：

```typescript
// 在 Router.tsx 中新增
function NavigateListener() {
  useUiNavigate()
  return null
}
```

然后在 `<BrowserRouter>`（或 `<HashRouter>`）内的最顶层插入 `<NavigateListener />`：

```tsx
<Router>
  <NavigateListener />
  <Routes>
    {/* 现有路由 */}
  </Routes>
</Router>
```

- [ ] **Step 3: 验证（手动测试）**

重启前端后，在终端执行：

```bash
curl -s -X POST http://localhost:8765/api/ui/navigate \
  -H "Content-Type: application/json" \
  -d '{"path": "/versions"}'
```

观察浏览器（`http://localhost:7071`）是否自动跳转到版本规划页。

- [ ] **Step 4: Commit**

```bash
git add tauri/src/hooks/useUiNavigate.ts tauri/src/app/Router.tsx
git commit -m "feat: frontend listens WS ui channel for navigate events"
```

---

## Task 5：前端 — API 类型 + requirements 相关方法

**Files:**
- Modify: `tauri/src/lib/api/types.ts`
- Modify: `tauri/src/lib/api/http.ts`

- [ ] **Step 1: 在 types.ts 的 Task 接口新增 requirements**

在 `tauri/src/lib/api/types.ts` 的 `Task` 接口中（`prd_content` 后），新增：

```typescript
requirements: string | null   // 结构化需求 JSON
```

同时新增 `InterviewMessage` 接口（如不存在）：

```typescript
export interface InterviewMessage {
  id: number
  task_id: number
  role: 'user' | 'assistant'
  content: string
  extra: string | null
  created_at: string
}
```

新增 `RequirementFields` 接口：

```typescript
export interface RequirementFields {
  background?: string
  target_users?: string
  core_features?: string[]
  acceptance_criteria?: string[]
  tech_constraints?: string
}
```

- [ ] **Step 2: 在 ApiAdapter 接口新增方法**

在 `types.ts` 的 `ApiAdapter` 接口新增：

```typescript
updateRequirements(taskId: number, requirements: RequirementFields): Promise<Task>
getInterviewMessages(taskId: number): Promise<InterviewMessage[]>
saveInterviewMessage(taskId: number, role: 'user' | 'assistant', content: string): Promise<InterviewMessage>
```

- [ ] **Step 3: 在 http.ts 实现这三个方法**

在 `tauri/src/lib/api/http.ts` 的 `HttpApiAdapter` 类中新增：

```typescript
async updateRequirements(taskId: number, requirements: RequirementFields): Promise<Task> {
  const result = await this.fetch<Task>(`/api/tasks/${taskId}/requirements`, {
    method: 'PUT',
    body: JSON.stringify({ requirements: JSON.stringify(requirements) }),
  })
  cache.invalidate(`task:${taskId}`)
  return result
}

async getInterviewMessages(taskId: number): Promise<InterviewMessage[]> {
  return this.fetch<InterviewMessage[]>(`/api/tasks/${taskId}/interview/messages`)
}

async saveInterviewMessage(taskId: number, role: 'user' | 'assistant', content: string): Promise<InterviewMessage> {
  return this.fetch<InterviewMessage>(`/api/tasks/${taskId}/interview/message`, {
    method: 'POST',
    body: JSON.stringify({ role, content }),
  })
}
```

- [ ] **Step 4: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
# 期望：无错误
```

- [ ] **Step 5: Commit**

```bash
git add tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts
git commit -m "feat: add requirements API methods to frontend"
```

---

## Task 6：前端 — PrdPreview 组件

**Files:**
- Create: `tauri/src/features/task-detail/components/PrdPreview.tsx`
- Create: `tauri/src/features/task-detail/components/PrdPreview.module.css`

- [ ] **Step 1: 新建 PrdPreview.tsx**

创建 `tauri/src/features/task-detail/components/PrdPreview.tsx`：

```tsx
import styles from './PrdPreview.module.css'
import { RequirementFields } from '../../../lib/api/types'

interface Props {
  fields: RequirementFields
  title: string
}

function renderList(items: string[] | undefined): string {
  if (!items || items.length === 0) return '*待补充*'
  return items.map(i => `- ${i}`).join('\n')
}

function fieldsToMarkdown(title: string, fields: RequirementFields): string {
  return `## ${title}

### 背景
${fields.background || '*待补充*'}

### 目标用户
${fields.target_users || '*待补充*'}

### 核心功能
${renderList(fields.core_features)}

### 验收标准
${renderList(fields.acceptance_criteria)}

### 技术约束
${fields.tech_constraints || '*无特殊约束*'}
`
}

// 简单 Markdown 渲染（不引入第三方库）
function renderMarkdown(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br/><br/>')
}

export function PrdPreview({ fields, title }: Props) {
  const markdown = fieldsToMarkdown(title, fields)
  const html = renderMarkdown(markdown)

  return (
    <div className={styles.root}>
      <div className={styles.header}>PRD 预览</div>
      <div
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
```

- [ ] **Step 2: 新建 PrdPreview.module.css**

创建 `tauri/src/features/task-detail/components/PrdPreview.module.css`：

```css
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tc-surface-1, #1a1a1a);
  border-radius: 8px;
  border: 1px solid var(--tc-border, #333);
  overflow: hidden;
}

.header {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tc-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--tc-border, #333);
  background: var(--tc-surface-2, #222);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tc-text, #e0e0e0);
}

.content h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--tc-text, #e0e0e0);
}

.content h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 6px;
  color: var(--tc-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.content ul {
  margin: 0;
  padding-left: 18px;
}

.content li {
  margin-bottom: 4px;
}

.content em {
  color: var(--tc-text-secondary, #888);
  font-style: italic;
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
# 期望：无错误
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/task-detail/components/PrdPreview.tsx \
        tauri/src/features/task-detail/components/PrdPreview.module.css
git commit -m "feat: add PrdPreview component"
```

---

## Task 7：前端 — RequirementWorkspace 组件

**Files:**
- Create: `tauri/src/features/task-detail/components/RequirementWorkspace.tsx`
- Create: `tauri/src/features/task-detail/components/RequirementWorkspace.module.css`

- [ ] **Step 1: 新建 RequirementWorkspace.tsx**

创建 `tauri/src/features/task-detail/components/RequirementWorkspace.tsx`：

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RequirementFields } from '../../../lib/api/types'
import { PrdPreview } from './PrdPreview'
import { Button } from '../../../ui/button'
import styles from './RequirementWorkspace.module.css'

interface FieldConfig {
  key: keyof RequirementFields
  label: string
  placeholder: string
  type: 'text' | 'list'
  required: boolean
}

const FIELDS: FieldConfig[] = [
  { key: 'background', label: '背景', placeholder: '为什么要做这个？解决什么问题？', type: 'text', required: true },
  { key: 'target_users', label: '目标用户', placeholder: '谁会使用这个功能？', type: 'text', required: true },
  { key: 'core_features', label: '核心功能', placeholder: '每行一个功能点', type: 'list', required: true },
  { key: 'acceptance_criteria', label: '验收标准', placeholder: '每行一条验收条件', type: 'list', required: false },
  { key: 'tech_constraints', label: '技术约束', placeholder: '技术限制、依赖、框架要求（选填）', type: 'text', required: false },
]

function parseRequirements(raw: string | null): RequirementFields {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

interface Props {
  taskId: number
  taskTitle: string
  requirementsRaw: string | null
  onSave: (fields: RequirementFields) => void
  onRequestReview: () => void
  isSaving: boolean
}

export function RequirementWorkspace({
  taskTitle,
  requirementsRaw,
  onSave,
  onRequestReview,
  isSaving,
}: Props) {
  const { t } = useTranslation()
  const initial = parseRequirements(requirementsRaw)
  const [fields, setFields] = useState<RequirementFields>(initial)
  const [expandedField, setExpandedField] = useState<keyof RequirementFields | null>(null)

  function setField(key: keyof RequirementFields, value: string) {
    const updated: RequirementFields = { ...fields }
    if (key === 'core_features' || key === 'acceptance_criteria') {
      updated[key] = value.split('\n').filter(l => l.trim())
    } else {
      (updated as Record<string, string>)[key] = value
    }
    setFields(updated)
    onSave(updated)
  }

  function getFieldValue(key: keyof RequirementFields): string {
    const v = fields[key]
    if (Array.isArray(v)) return v.join('\n')
    return (v as string) || ''
  }

  function isFilled(key: keyof RequirementFields): boolean {
    const v = fields[key]
    if (Array.isArray(v)) return v.length > 0
    return !!(v as string)?.trim()
  }

  const requiredFilled = FIELDS.filter(f => f.required).every(f => isFilled(f.key))

  return (
    <div className={styles.root}>
      {/* 左：字段面板 */}
      <div className={styles.fieldsPanel}>
        <div className={styles.panelHeader}>需求补充</div>

        <div className={styles.fieldsList}>
          {FIELDS.map(fc => {
            const filled = isFilled(fc.key)
            const expanded = expandedField === fc.key

            return (
              <div key={fc.key} className={styles.fieldItem}>
                <button
                  className={styles.fieldToggle}
                  onClick={() => setExpandedField(expanded ? null : fc.key)}
                >
                  <span className={filled ? styles.statusFilled : styles.statusEmpty}>
                    {filled ? '✅' : '⚠️'}
                  </span>
                  <span className={styles.fieldLabel}>{fc.label}</span>
                  {!fc.required && (
                    <span className={styles.optionalBadge}>选填</span>
                  )}
                  <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <div className={styles.fieldBody}>
                    {filled && !expanded ? null : (
                      <textarea
                        className={styles.textarea}
                        value={getFieldValue(fc.key)}
                        placeholder={fc.placeholder}
                        rows={fc.type === 'list' ? 4 : 3}
                        onChange={e => setField(fc.key, e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>
                )}

                {!expanded && filled && (
                  <div className={styles.fieldPreview}>
                    {getFieldValue(fc.key).slice(0, 80)}
                    {getFieldValue(fc.key).length > 80 ? '…' : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className={styles.actions}>
          {isSaving && <span className={styles.savingHint}>保存中…</span>}
          <Button
            onClick={onRequestReview}
            disabled={!requiredFilled}
            variant={requiredFilled ? 'default' : 'ghost'}
          >
            完成填写，请 AI 审核
          </Button>
          {!requiredFilled && (
            <p className={styles.hint}>请先填写背景、目标用户和核心功能</p>
          )}
        </div>
      </div>

      {/* 右：PRD 预览 */}
      <div className={styles.previewPanel}>
        <PrdPreview fields={fields} title={taskTitle} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 新建 RequirementWorkspace.module.css**

创建 `tauri/src/features/task-detail/components/RequirementWorkspace.module.css`：

```css
.root {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 100%;
  min-height: 400px;
}

.fieldsPanel {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--tc-surface-1, #1a1a1a);
  border: 1px solid var(--tc-border, #333);
  border-radius: 8px;
  overflow: hidden;
}

.panelHeader {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tc-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--tc-border, #333);
  background: var(--tc-surface-2, #222);
}

.fieldsList {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.fieldItem {
  border-bottom: 1px solid var(--tc-border, #2a2a2a);
}

.fieldToggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--tc-text, #e0e0e0);
  font-size: 14px;
  transition: background 0.15s;
}

.fieldToggle:hover {
  background: var(--tc-surface-hover, #2a2a2a);
}

.statusFilled { font-size: 14px; }
.statusEmpty  { font-size: 14px; }

.fieldLabel {
  flex: 1;
  font-weight: 500;
}

.optionalBadge {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--tc-surface-2, #333);
  border-radius: 4px;
  color: var(--tc-text-secondary, #888);
}

.chevron {
  font-size: 10px;
  color: var(--tc-text-secondary, #888);
}

.fieldBody {
  padding: 8px 16px 12px;
}

.textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--tc-surface-2, #222);
  border: 1px solid var(--tc-border, #444);
  border-radius: 6px;
  color: var(--tc-text, #e0e0e0);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  padding: 8px 10px;
  resize: vertical;
  outline: none;
}

.textarea:focus {
  border-color: var(--tc-accent, #007acc);
}

.fieldPreview {
  padding: 2px 16px 10px 40px;
  font-size: 12px;
  color: var(--tc-text-secondary, #888);
  line-height: 1.4;
}

.actions {
  padding: 12px 16px;
  border-top: 1px solid var(--tc-border, #333);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.savingHint {
  font-size: 12px;
  color: var(--tc-text-secondary, #888);
}

.hint {
  font-size: 12px;
  color: var(--tc-text-secondary, #888);
  margin: 0;
}

.previewPanel {
  overflow: hidden;
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
# 期望：无错误
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/task-detail/components/RequirementWorkspace.tsx \
        tauri/src/features/task-detail/components/RequirementWorkspace.module.css
git commit -m "feat: add RequirementWorkspace component"
```

---

## Task 8：前端 — 任务详情页 input 阶段接入工作台

**Files:**
- Modify: `tauri/src/features/task-detail/hooks/useTaskDetailData.ts`
- Modify: `tauri/src/features/task-detail/index.tsx`

- [ ] **Step 1: 在 useTaskDetailData 新增 updateRequirements mutation**

在 `tauri/src/features/task-detail/hooks/useTaskDetailData.ts` 中新增：

```typescript
const updateRequirements = useMutation({
  mutationFn: (fields: RequirementFields) => api.updateRequirements(taskId, fields),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] })
  },
})
```

在 return 中新增 `updateRequirements`。同时在文件顶部补充 import：

```typescript
import { RequirementFields } from '../../../lib/api/types'
```

- [ ] **Step 2: 在 task-detail/index.tsx 的 input 阶段渲染 RequirementWorkspace**

在 `tauri/src/features/task-detail/index.tsx` 中：

1. 新增 import：
```typescript
import { RequirementWorkspace } from './components/RequirementWorkspace'
import { RequirementFields } from '../../lib/api/types'
```

2. 从 hook 解构 `updateRequirements`：
```typescript
const { task, artifacts, loading, approveTask, startTask, advanceTask, updateRequirements } = useTaskDetailData(taskId)
```

3. 将 input 阶段逻辑替换为工作台模式。找到 `{/* Pipeline Stage Timeline */}` 前的区域，在 `headerRight` 中修改启动按钮条件：

```tsx
{/* input 阶段：需求工作台 */}
{task.stage === 'input' && (
  <div className={styles.section}>
    <div className={styles.sectionHeader}>
      <span className={styles.sectionTitle}>需求完善工作台</span>
    </div>
    <div className={styles.sectionBody}>
      <RequirementWorkspace
        taskId={taskId}
        taskTitle={task.title}
        requirementsRaw={task.requirements ?? null}
        onSave={(fields: RequirementFields) => updateRequirements.mutate(fields)}
        onRequestReview={() => {
          // 发送消息到 AI 面板（占位：console.log，后续接入 AI 面板）
          console.log('[TC] 用户请求 AI 审核需求', { taskId })
        }}
        isSaving={updateRequirements.isPending}
      />
    </div>
  </div>
)}
```

4. 将顶部 `启动流水线` 按钮的条件改为要求 requirements 非空：

```tsx
{task.stage === 'input' && task.status === 'pending' && !!task.requirements && (
  <Button
    onClick={() => startTask.mutate()}
    disabled={startTask.isPending}
  >
    {startTask.isPending ? '启动中…' : '🚀 启动流水线'}
  </Button>
)}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
# 期望：无错误
```

- [ ] **Step 4: 手动验证**

1. 启动前后端
2. 打开任意处于 `input/pending` 的任务页（如 `http://localhost:7071/task/40`）
3. 确认页面显示"需求完善工作台"双栏布局
4. 填写背景、目标用户、核心功能字段
5. 确认右侧 PRD 预览实时更新
6. 确认填写完后"🚀 启动流水线"按钮出现

- [ ] **Step 5: Commit**

```bash
git add tauri/src/features/task-detail/hooks/useTaskDetailData.ts \
        tauri/src/features/task-detail/index.tsx
git commit -m "feat: integrate RequirementWorkspace into task detail input stage"
```

---

## Task 9：注册 TC MCP 工具并验证端到端流程

**Files:**
- `backend/install_tc_mcp.sh`（已创建）

- [ ] **Step 1: 执行安装脚本**

```bash
cd /home/sichengli/Documents/code2/task-conductor
bash backend/install_tc_mcp.sh
# 期望：✅ TaskConductor MCP 工具已注册到 Claude Code
```

- [ ] **Step 2: 验证 ~/.claude.json 已更新**

```bash
cat ~/.claude.json | python3 -m json.tool | grep -A5 "task-conductor"
# 期望输出类似：
# "task-conductor": {
#   "type": "stdio",
#   "command": "python3",
#   "args": ["/path/to/tc_mcp_server.py"],
#   ...
# }
```

- [ ] **Step 3: 重启 Claude Code，验证工具可用**

重启 Claude Code 后，在会话中输入：
```
请调用 tc_get_task 工具查询任务 ID 40 的详情
```
期望 Claude 能成功调用并返回任务信息。

- [ ] **Step 4: 端到端验证**

在 Claude Code 会话中输入：
```
我想做一个知识库功能，支持 Markdown 文档上传和全文搜索。
请帮我创建一个任务并打开任务页面。
```

期望 Claude 依次：
1. 调用 `tc_create_task` 创建任务
2. 调用 `tc_navigate_to` 跳转到 `/task/{新id}`
3. 前端自动跳转到任务页
4. 在任务页看到需求工作台

---

## 自检清单

- [x] spec 覆盖：需求字段 ✅ / PRD 预览 ✅ / AI 工具 ✅ / 导航 ✅ / 启动门控 ✅
- [x] 无 TBD/TODO 占位
- [x] 类型一致性：`RequirementFields` 在 types.ts 定义，在 workspace + hook + http 中引用一致
- [x] `tc_update_requirements` 工具调用 `PUT /api/tasks/{id}/requirements`，该端点在 Task 3 Step 3 定义 ✅

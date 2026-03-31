# Dev Pipeline 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 TaskConductor Tauri 桌面端新增「开发流水线」页面，实现 AI 任务分支管理、内嵌预览、测试验收、一键合并的完整工作流。

**Architecture:** 后端新增 ProcessManager 管理 dev server 子进程，通过反向代理将预览请求透传到对应端口；前端新增独立 Pipeline 页面（Kanban 三列）；Tauri 层新增 WebviewWindow 命令支持全屏预览。

**Tech Stack:** FastAPI + httpx（代理）、React 19 + Zustand + TanStack Query、Tauri 2（WebviewWindow）、CSS Modules

---

## 文件结构

**后端（新建）**
- `backend/app/pipeline/process_manager.py` — ProcessManager 单例，管理 dev server 子进程
- `backend/app/routers/previews.py` — GET/POST/DELETE /api/previews
- `backend/app/routers/proxy.py` — ANY /proxy/{task_id}/{path} 反向代理

**后端（修改）**
- `backend/app/routers/git.py` — 新增 POST /api/projects/{id}/git/merge 端点
- `backend/app/routers/tc_config.py` — DEFAULT_CONFIG 新增 `pipeline.default_merge_branch`
- `backend/app/main.py` — 注册 previews、proxy 路由

**Tauri（修改）**
- `tauri/src-tauri/src/lib.rs` — 新增 `open_preview_window` 命令

**前端（新建）**
- `tauri/src/features/pipeline/index.tsx` — 页面入口 + Kanban 布局
- `tauri/src/features/pipeline/PipelineCard.tsx` — 折叠/展开卡片
- `tauri/src/features/pipeline/PreviewPanel.tsx` — 内嵌 iframe 预览区
- `tauri/src/features/pipeline/pipeline.module.css`
- `tauri/src/features/pipeline/card.module.css`
- `tauri/src/features/pipeline/preview.module.css`
- `tauri/src/features/settings/components/ServicesPanel.tsx` — 设置页服务管理区块

**前端（修改）**
- `tauri/src/lib/api/types.ts` — 新增 PreviewService、PipelineTask 类型，扩展 GitBranch
- `tauri/src/lib/api/http.ts` — 新增 previews/merge API 方法
- `tauri/src/app/Router.tsx` — 注册 /pipeline 路由
- `tauri/src/layouts/Sidebar/Sidebar.tsx` — 新增流水线入口
- `tauri/src/features/settings/index.tsx` — 引入 ServicesPanel
- `tauri/src/i18n/zh.json` — 新增 pipeline.* 翻译键
- `tauri/src/i18n/en.json` — 新增 pipeline.* 翻译键

---

## Task 1: ProcessManager

**Files:**
- Create: `backend/app/pipeline/process_manager.py`
- Create: `backend/app/pipeline/__init__.py`

- [ ] **Step 1: 创建 pipeline 包**

```bash
touch backend/app/pipeline/__init__.py
```

- [ ] **Step 2: 编写 ProcessManager**

```python
# backend/app/pipeline/process_manager.py
"""管理 dev server 子进程的单例 ProcessManager"""
import asyncio
import socket
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ProcessInfo:
    task_id: int
    pid: int
    port: int
    cwd: str
    command: str
    started_at: datetime = field(default_factory=datetime.utcnow)


class ProcessManager:
    _instance: "ProcessManager | None" = None
    _processes: dict[int, ProcessInfo]
    _procs: dict[int, asyncio.subprocess.Process]

    def __new__(cls) -> "ProcessManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._processes = {}
            cls._instance._procs = {}
        return cls._instance

    def _find_free_port(self, start: int = 3700) -> int:
        port = start
        used = {info.port for info in self._processes.values()}
        while port < 4000:
            if port not in used:
                with socket.socket() as s:
                    try:
                        s.bind(("", port))
                        return port
                    except OSError:
                        pass
            port += 1
        raise RuntimeError("无可用端口（3700-3999）")

    async def start(self, task_id: int, cwd: str, command: str) -> int:
        """启动 dev server，返回端口号。若已运行则直接返回端口。"""
        if task_id in self._processes:
            return self._processes[task_id].port

        port = self._find_free_port()
        env_patch = {"PORT": str(port), "VITE_PORT": str(port)}
        import os
        env = {**os.environ, **env_patch}

        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        info = ProcessInfo(
            task_id=task_id,
            pid=proc.pid,
            port=port,
            cwd=cwd,
            command=command,
        )
        self._processes[task_id] = info
        self._procs[task_id] = proc
        return port

    async def stop(self, task_id: int) -> None:
        """停止指定任务的 dev server"""
        proc = self._procs.pop(task_id, None)
        self._processes.pop(task_id, None)
        if proc and proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                proc.kill()

    async def stop_all(self) -> None:
        for task_id in list(self._processes.keys()):
            await self.stop(task_id)

    def list(self) -> list[ProcessInfo]:
        return list(self._processes.values())

    def get_port(self, task_id: int) -> int | None:
        info = self._processes.get(task_id)
        return info.port if info else None


process_manager = ProcessManager()
```

- [ ] **Step 3: 手动验证（无需测试文件）**

```bash
cd backend && python -c "
from app.pipeline.process_manager import process_manager, ProcessManager
# 单例验证
assert ProcessManager() is ProcessManager()
# 端口分配验证
port = process_manager._find_free_port()
assert 3700 <= port < 4000
print('ProcessManager OK, free port:', port)
"
```

期望输出：`ProcessManager OK, free port: 3700`（或其他空闲端口）

- [ ] **Step 4: Commit**

```bash
git add backend/app/pipeline/
git commit -m "feat(backend): add ProcessManager for dev server process lifecycle"
```

---

## Task 2: Previews 路由

**Files:**
- Create: `backend/app/routers/previews.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 编写 previews router**

```python
# backend/app/routers/previews.py
"""预览服务管理：启动/停止 dev server 子进程"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Task
from ..pipeline.process_manager import process_manager

router = APIRouter(prefix="/api/previews", tags=["Previews"])


def _get_db():
    with Session(engine) as session:
        yield session


class PreviewStartRequest(BaseModel):
    command: str = "npm run dev"  # 可覆盖默认命令


class PreviewInfo(BaseModel):
    task_id: int
    pid: int
    port: int
    cwd: str
    command: str
    started_at: str


@router.get("", response_model=list[PreviewInfo])
def list_previews():
    """列出所有运行中的预览服务"""
    return [
        PreviewInfo(
            task_id=p.task_id,
            pid=p.pid,
            port=p.port,
            cwd=p.cwd,
            command=p.command,
            started_at=p.started_at.isoformat(),
        )
        for p in process_manager.list()
    ]


@router.post("/{task_id}", response_model=PreviewInfo)
async def start_preview(
    task_id: int,
    body: PreviewStartRequest,
    db: Session = Depends(_get_db),
):
    """启动指定任务的 dev server"""
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if not task.worktree_path:
        raise HTTPException(400, "任务未配置 worktree_path")

    port = await process_manager.start(task_id, task.worktree_path, body.command)
    info = process_manager._processes[task_id]
    return PreviewInfo(
        task_id=info.task_id,
        pid=info.pid,
        port=info.port,
        cwd=info.cwd,
        command=info.command,
        started_at=info.started_at.isoformat(),
    )


@router.delete("/{task_id}", status_code=204)
async def stop_preview(task_id: int):
    """停止指定任务的 dev server"""
    await process_manager.stop(task_id)


@router.delete("", status_code=204)
async def stop_all_previews():
    """停止全部预览服务"""
    await process_manager.stop_all()
```

- [ ] **Step 2: 在 main.py 注册路由**

在 `backend/app/main.py` 顶部导入区添加：
```python
from .routers import previews as previews_router
```

在 `app.include_router(git_router.router)` 之后添加：
```python
app.include_router(previews_router.router)   # GET/POST/DELETE /api/previews
```

- [ ] **Step 3: 启动后端验证端点存在**

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8765 &
sleep 2
curl -s http://localhost:8765/api/previews | python3 -m json.tool
# 期望：[]
curl -s http://localhost:8765/docs | grep -c "previews"
# 期望：> 0
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/previews.py backend/app/main.py
git commit -m "feat(backend): add previews router for dev server lifecycle management"
```

---

## Task 3: 反向代理路由

**Files:**
- Create: `backend/app/routers/proxy.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 安装 httpx（若未安装）**

```bash
cd backend && source .venv/bin/activate
pip show httpx || pip install httpx
```

- [ ] **Step 2: 编写代理路由**

```python
# backend/app/routers/proxy.py
"""反向代理：将 /proxy/{task_id}/{path} 转发到对应 dev server 端口"""
import httpx
from fastapi import APIRouter, HTTPException, Request, WebSocket
from fastapi.responses import StreamingResponse
from ..pipeline.process_manager import process_manager

router = APIRouter(tags=["Proxy"])


@router.api_route(
    "/proxy/{task_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy_http(task_id: int, path: str, request: Request):
    """HTTP 反向代理"""
    port = process_manager.get_port(task_id)
    if port is None:
        raise HTTPException(503, f"任务 {task_id} 的预览服务未启动")

    target_url = f"http://localhost:{port}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
        except httpx.ConnectError:
            raise HTTPException(503, "dev server 尚未就绪，请稍候重试")

    return StreamingResponse(
        content=iter([resp.content]),
        status_code=resp.status_code,
        headers=dict(resp.headers),
        media_type=resp.headers.get("content-type"),
    )


@router.get("/proxy/{task_id}", include_in_schema=False)
async def proxy_root(task_id: int, request: Request):
    """根路径代理（无 path 后缀）"""
    return await proxy_http(task_id, "", request)
```

- [ ] **Step 3: 在 main.py 注册**

在已有的 `app.include_router(previews_router.router)` 之后：
```python
from .routers import proxy as proxy_router
app.include_router(proxy_router.router)      # ANY /proxy/{task_id}/...
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/proxy.py backend/app/main.py
git commit -m "feat(backend): add HTTP reverse proxy for dev server preview"
```

---

## Task 4: Git Merge 端点 + 配置扩展

**Files:**
- Modify: `backend/app/routers/git.py`
- Modify: `backend/app/routers/tc_config.py`

- [ ] **Step 1: 在 git.py 末尾添加 merge 端点**

在 `backend/app/routers/git.py` 末尾追加：

```python
# ── POST /{project_id}/git/merge ────────────────────────────────────

class MergeRequest(BaseModel):
    task_id: int
    target_branch: str = "main"


@router.post("/{project_id}/git/merge", summary="合并 feature 分支到目标分支")
def git_merge(
    project_id: int,
    body: MergeRequest,
    db: Session = Depends(_get_db),
):
    """
    执行 git merge feature/task-{task_id} → target_branch，
    合并成功后删除 worktree 和 feature 分支。
    """
    from ..models import Task as TaskModel
    cwd = _get_project_path(project_id, db)
    _ensure_git(cwd)

    task = db.get(TaskModel, body.task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    branch = task.branch_name or f"feature/task-{body.task_id}"

    # 切换到目标分支
    checkout = _run_git(cwd, "checkout", body.target_branch)
    if checkout.returncode != 0:
        raise HTTPException(400, f"切换到 {body.target_branch} 失败: {checkout.stderr.strip()}")

    # 执行合并
    merge = _run_git(cwd, "merge", "--no-ff", branch, "-m", f"Merge {branch} into {body.target_branch}")
    if merge.returncode != 0:
        # 发生冲突，回退
        _run_git(cwd, "merge", "--abort")
        raise HTTPException(409, f"合并冲突，请手动解决: {merge.stderr.strip()}")

    # 删除 worktree
    if task.worktree_path:
        wt_remove = _run_git(cwd, "worktree", "remove", "--force", task.worktree_path)
        # worktree 不存在时忽略错误
        _ = wt_remove

    # 删除 feature 分支
    _run_git(cwd, "branch", "-d", branch)

    # 更新任务状态
    task.status = "merged"
    task.branch_name = None
    task.worktree_path = None
    db.commit()

    return {"merged": branch, "into": body.target_branch}
```

同时在文件顶部 `from pydantic import BaseModel` 已存在，若不存在则添加。

- [ ] **Step 2: 扩展 tc_config DEFAULT_CONFIG**

在 `backend/app/routers/tc_config.py` 的 `DEFAULT_CONFIG` dict 末尾（`"envVars": {...}` 之后）添加：

```python
    "pipeline": {
        "default_merge_branch": "main",
    },
```

- [ ] **Step 3: 验证 config 端点包含新字段**

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8765 &
sleep 2
curl -s http://localhost:8765/api/tc-config | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pipeline'])"
# 期望：{'default_merge_branch': 'main'}
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/git.py backend/app/routers/tc_config.py
git commit -m "feat(backend): add git merge endpoint and pipeline config defaults"
```

---

## Task 5: Tauri — open_preview_window 命令

**Files:**
- Modify: `tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: 在 lib.rs 中添加命令**

在 `tauri/src-tauri/src/lib.rs` 的 `fn greet` 函数之前插入：

```rust
/// 在新 WebviewWindow 中打开预览 URL（VS Code Simple Browser 效果）
#[tauri::command]
async fn open_preview_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    let label = format!("preview-{}", url.len()); // 用 URL 长度作简单唯一标识
    WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::External(
        url.parse().map_err(|e| format!("无效 URL: {e}"))?
    ))
    .title("Preview")
    .inner_size(1280.0, 800.0)
    .build()
    .map_err(|e| format!("打开预览窗口失败: {e}"))?;
    Ok(())
}
```

- [ ] **Step 2: 在 invoke_handler 中注册**

将 `tauri::generate_handler![` 列表中添加 `open_preview_window`：

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    list_dir,
    scan_tree,
    invalidate_file_cache,
    sync_pull,
    get_archived_sessions_cmd,
    toggle_favorite,
    delete_archived,
    open_preview_window,   // ← 新增
])
```

- [ ] **Step 3: 编译验证**

```bash
cd tauri && pnpm tauri build --debug 2>&1 | tail -5
# 期望：Finished ... 无 error
```

若只需检查编译不打包：
```bash
cd tauri/src-tauri && cargo check 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src-tauri/src/lib.rs
git commit -m "feat(tauri): add open_preview_window command for fullscreen preview"
```

---

## Task 6: 前端 API 类型 + 方法

**Files:**
- Modify: `tauri/src/lib/api/types.ts`
- Modify: `tauri/src/lib/api/http.ts`

- [ ] **Step 1: 在 types.ts 添加新类型**

在 `tauri/src/lib/api/types.ts` 中现有 `GitBranch` 接口扩展 `task_id` 字段，并添加新类型：

```typescript
// 扩展现有 GitBranch（在原 interface 末尾加字段）
export interface GitBranch {
  name: string
  current: boolean
  remote: boolean
  task_id?: number   // ← 新增：若分支名匹配 feature/task-{id} 则有值
}

// 新增
export interface PreviewService {
  task_id: number
  pid: number
  port: number
  cwd: string
  command: string
  started_at: string
}

export interface PipelineTask {
  id: number
  title: string
  branch_name: string | null
  worktree_path: string | null
  status: string         // 'developing' | 'pending_review' | 'ready_to_merge' | 'merged'
  stage: string
  test_pass?: number
  test_fail?: number
}

export interface MergeRequest {
  task_id: number
  target_branch: string
}
```

- [ ] **Step 2: 在 http.ts 添加 API 方法**

在 `tauri/src/lib/api/http.ts` 的 `ApiAdapter` 接口实现末尾添加：

```typescript
// Previews
async listPreviews(): Promise<PreviewService[]> {
  return this.fetch<PreviewService[]>('/api/previews')
}

async startPreview(taskId: number, command = 'npm run dev'): Promise<PreviewService> {
  return this.fetch<PreviewService>(`/api/previews/${taskId}`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

async stopPreview(taskId: number): Promise<void> {
  await this.fetch<void>(`/api/previews/${taskId}`, { method: 'DELETE' })
}

async stopAllPreviews(): Promise<void> {
  await this.fetch<void>('/api/previews', { method: 'DELETE' })
}

// Git merge
async gitMerge(projectId: number, taskId: number, targetBranch: string): Promise<void> {
  await this.fetch<void>(`/api/projects/${projectId}/git/merge`, {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId, target_branch: targetBranch }),
  })
}

// Pipeline tasks（复用已有 tasks 端点，按状态过滤）
async getPipelineTasks(projectId: number): Promise<PipelineTask[]> {
  const tasks = await this.fetch<PipelineTask[]>(`/api/projects/${projectId}/tasks`)
  return tasks.filter(t =>
    ['developing', 'pending_review', 'ready_to_merge'].includes(t.status)
  )
}
```

同时在 `types.ts` 的 `ApiAdapter` interface 声明中添加对应方法签名（与 http.ts 保持一致）。

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -10
# 期望：无 error 输出
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts
git commit -m "feat(frontend): add pipeline and preview API types and methods"
```

---

## Task 7: 翻译键

**Files:**
- Modify: `tauri/src/i18n/zh.json`
- Modify: `tauri/src/i18n/en.json`

- [ ] **Step 1: 在 zh.json 添加 pipeline 命名空间**

在 `tauri/src/i18n/zh.json` 的根对象末尾（最后一个 `}` 前）添加：

```json
"pipeline": {
  "title": "开发流水线",
  "newTask": "+ 新建任务",
  "col_developing": "AI 开发中",
  "col_review": "待审批",
  "col_ready": "待合并",
  "card_log": "日志",
  "card_diff": "Diff",
  "card_startPreview": "开启预览",
  "card_preview": "预览",
  "card_approve": "批准",
  "card_mergeInto": "合并到",
  "card_openWindow": "新窗口打开",
  "stage_create": "创建",
  "stage_dev": "开发",
  "stage_test": "测试",
  "stage_merge": "合并",
  "test_pass": "通过",
  "test_fail": "失败",
  "test_running": "测试中...",
  "preview_placeholder": "dev server 未运行",
  "merge_success": "合并成功",
  "merge_conflict": "合并冲突，请手动解决"
}
```

- [ ] **Step 2: 在 en.json 添加对应英文**

```json
"pipeline": {
  "title": "Pipeline",
  "newTask": "+ New Task",
  "col_developing": "Developing",
  "col_review": "Review",
  "col_ready": "Ready",
  "card_log": "Log",
  "card_diff": "Diff",
  "card_startPreview": "Start Preview",
  "card_preview": "Preview",
  "card_approve": "Approve",
  "card_mergeInto": "Merge into",
  "card_openWindow": "Open in window",
  "stage_create": "Create",
  "stage_dev": "Dev",
  "stage_test": "Test",
  "stage_merge": "Merge",
  "test_pass": "passed",
  "test_fail": "failed",
  "test_running": "running...",
  "preview_placeholder": "dev server not running",
  "merge_success": "Merged successfully",
  "merge_conflict": "Merge conflict, please resolve manually"
}
```

- [ ] **Step 3: Commit**

```bash
git add tauri/src/i18n/zh.json tauri/src/i18n/en.json
git commit -m "feat(i18n): add pipeline translation keys"
```

---

## Task 8: PreviewPanel 组件

**Files:**
- Create: `tauri/src/features/pipeline/PreviewPanel.tsx`
- Create: `tauri/src/features/pipeline/preview.module.css`

- [ ] **Step 1: 编写 CSS**

```css
/* tauri/src/features/pipeline/preview.module.css */
.container {
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
  border: 1px solid var(--tc-border);
  background: var(--tc-bg-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-bottom: 1px solid var(--tc-border);
  background: var(--tc-bg-primary);
}

.url {
  flex: 1;
  font-size: 11px;
  color: var(--tc-text-muted);
  font-family: var(--tc-font-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.openBtn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--tc-accent);
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
}

.openBtn:hover {
  opacity: 0.8;
}

.frame {
  width: 100%;
  height: 120px;
  border: none;
  display: block;
  background: var(--tc-bg-primary);
}

.placeholder {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.startBtn {
  background: none;
  border: 1px solid var(--tc-border-active);
  border-radius: 4px;
  color: var(--tc-text-success, #4ade80);
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}

.startBtn:hover {
  background: var(--tc-bg-hover);
}
```

- [ ] **Step 2: 编写 PreviewPanel 组件**

```tsx
// tauri/src/features/pipeline/PreviewPanel.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { api } from '../../lib/api'
import { isTauri } from '../../lib/tauri'
import type { PreviewService } from '../../lib/api/types'
import styles from './preview.module.css'

interface Props {
  taskId: number
  preview: PreviewService | undefined  // undefined = 未启动
  onStarted: (svc: PreviewService) => void
}

export function PreviewPanel({ taskId, preview, onStarted }: Props) {
  const { t } = useTranslation()
  const proxyUrl = preview ? `/proxy/${taskId}/` : null

  const startMutation = useMutation({
    mutationFn: () => api.startPreview(taskId),
    onSuccess: onStarted,
  })

  function handleOpenWindow() {
    if (!proxyUrl) return
    const fullUrl = `${window.location.origin}${proxyUrl}`
    if (isTauri()) {
      invoke('open_preview_window', { url: fullUrl }).catch(console.error)
    } else {
      window.open(fullUrl, '_blank')
    }
  }

  if (!preview) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <button
            className={styles.startBtn}
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? '启动中...' : `▶ ${t('pipeline.card_startPreview')}`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.url}>localhost:{preview.port}</span>
        <button className={styles.openBtn} onClick={handleOpenWindow} title={t('pipeline.card_openWindow')}>
          ⤢
        </button>
      </div>
      <iframe
        className={styles.frame}
        src={proxyUrl!}
        title={`preview-${taskId}`}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep "PreviewPanel\|preview" | head -5
# 期望：无 error
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/pipeline/PreviewPanel.tsx tauri/src/features/pipeline/preview.module.css
git commit -m "feat(frontend): add PreviewPanel component with iframe + Tauri window support"
```

---

## Task 9: PipelineCard 组件

**Files:**
- Create: `tauri/src/features/pipeline/PipelineCard.tsx`
- Create: `tauri/src/features/pipeline/card.module.css`

- [ ] **Step 1: 编写卡片 CSS（V3 风格：左侧色条）**

```css
/* tauri/src/features/pipeline/card.module.css */

/* 色条颜色 CSS 变量（由父组件通过 style prop 注入） */
.card {
  background: var(--tc-bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--tc-border);
  border-left: 2px solid var(--card-accent, #2563eb);
  margin-bottom: 6px;
  cursor: pointer;
  transition: border-color 0.1s;
  overflow: hidden;
}

.card:hover {
  border-color: var(--card-accent, #2563eb);
}

/* 折叠态 */
.collapsed {
  padding: 8px 10px;
}

.collapsedTitle {
  font-size: 10px;
  font-weight: 500;
  color: var(--tc-text-primary);
  margin-bottom: 2px;
}

.collapsedBranch {
  font-size: 9px;
  color: var(--tc-text-muted);
  font-family: var(--tc-font-mono, monospace);
}

/* 展开态 */
.expanded {
  padding: 10px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.titleBlock {}

.title {
  font-size: 10px;
  font-weight: 500;
  color: var(--tc-text-primary);
  margin-bottom: 2px;
}

.branch {
  font-size: 9px;
  color: var(--tc-text-muted);
  font-family: var(--tc-font-mono, monospace);
}

.badge {
  font-size: 8px;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 进度条（四段） */
.progress {
  display: flex;
  gap: 3px;
  margin-bottom: 8px;
}

.progressSeg {
  flex: 1;
  height: 2px;
  border-radius: 1px;
  background: var(--tc-border);
}

.progressSeg[data-done="true"] {
  background: var(--card-accent, #2563eb);
}

.progressSeg[data-active="true"] {
  background: var(--card-accent, #2563eb);
  opacity: 0.4;
}

/* 测试结果 */
.testRow {
  font-size: 9px;
  color: var(--tc-text-muted);
  margin-bottom: 8px;
}

.testPass { color: var(--tc-text-success, #4ade80); }
.testFail { color: var(--tc-text-danger, #f87171); }

/* 操作按钮区 */
.actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.btnGhost {
  font-size: 9px;
  color: var(--tc-text-muted);
  background: none;
  border: 1px solid var(--tc-border);
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
}

.btnGhost:hover {
  background: var(--tc-bg-hover);
}

.btnPrimary {
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  background: #16a34a;
  border: none;
  padding: 3px 8px;
  border-radius: 4px 0 0 4px;
  cursor: pointer;
}

.btnPrimary:hover { background: #15803d; }
.btnPrimaryAlone {
  border-radius: 4px;
}

.btnDropdown {
  font-size: 9px;
  color: #fff;
  background: #15803d;
  border: none;
  border-left: 1px solid rgba(74,222,128,0.3);
  padding: 3px 6px;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
}

.mergeGroup {
  display: flex;
  margin-left: auto;
}
```

- [ ] **Step 2: 编写 PipelineCard 组件**

```tsx
// tauri/src/features/pipeline/PipelineCard.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { PreviewPanel } from './PreviewPanel'
import type { PipelineTask, PreviewService } from '../../lib/api/types'
import styles from './card.module.css'

const STATUS_ACCENT: Record<string, string> = {
  developing:     '#2563eb',
  pending_review: '#eab308',
  ready_to_merge: '#4ade80',
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  developing:     { bg: '#172554', color: '#93c5fd', label: 'AI开发中' },
  pending_review: { bg: '#422006', color: '#fbbf24', label: '待审批' },
  ready_to_merge: { bg: '#14532d', color: '#86efac', label: '待合并' },
}

/** 将任务状态映射为进度段 [创建, 开发, 测试, 合并] */
function getProgressSegs(status: string): Array<'done' | 'active' | 'pending'> {
  switch (status) {
    case 'developing':     return ['done', 'active', 'pending', 'pending']
    case 'pending_review': return ['done', 'done', 'active', 'pending']
    case 'ready_to_merge': return ['done', 'done', 'done', 'active']
    default:               return ['pending', 'pending', 'pending', 'pending']
  }
}

interface Props {
  task: PipelineTask
  preview: PreviewService | undefined
  defaultBranch: string
  expanded: boolean
  onExpand: () => void
  onMerged: () => void
}

export function PipelineCard({ task, preview, defaultBranch, expanded, onExpand, onMerged }: Props) {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const [previewSvc, setPreviewSvc] = useState<PreviewService | undefined>(preview)
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const queryClient = useQueryClient()

  const accent = STATUS_ACCENT[task.status] ?? '#3f3f46'
  const badge = STATUS_BADGE[task.status]
  const segs = getProgressSegs(task.status)
  const segKeys = ['create', 'dev', 'test', 'merge'] as const

  const approveMutation = useMutation({
    mutationFn: () =>
      api.updateTask(task.id, { status: 'ready_to_merge' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] }),
  })

  const mergeMutation = useMutation({
    mutationFn: (branch: string) =>
      api.gitMerge(Number(projectId), task.id, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] })
      onMerged()
    },
  })

  if (!expanded) {
    return (
      <div
        className={styles.card}
        style={{ '--card-accent': accent } as React.CSSProperties}
        onClick={onExpand}
      >
        <div className={styles.collapsed}>
          <div className={styles.collapsedTitle}>#{task.id} {task.title}</div>
          <div className={styles.collapsedBranch}>{task.branch_name ?? '—'}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={styles.card}
      style={{ '--card-accent': accent } as React.CSSProperties}
      onClick={onExpand}
    >
      <div className={styles.expanded} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.title}>#{task.id} {task.title}</div>
            <div className={styles.branch}>{task.branch_name ?? '—'}</div>
          </div>
          {badge && (
            <span
              className={styles.badge}
              style={{ background: badge.bg, color: badge.color }}
            >
              {badge.label}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className={styles.progress}>
          {segs.map((seg, i) => (
            <div
              key={segKeys[i]}
              className={styles.progressSeg}
              data-done={seg === 'done' ? 'true' : undefined}
              data-active={seg === 'active' ? 'true' : undefined}
            />
          ))}
        </div>

        {/* Test results */}
        {(task.test_pass !== undefined || task.test_fail !== undefined) && (
          <div className={styles.testRow}>
            {task.test_pass !== undefined && (
              <span className={styles.testPass}>✓ {task.test_pass} {t('pipeline.test_pass')}</span>
            )}
            {task.test_fail !== undefined && (
              <span className={styles.testFail}> &nbsp;✗ {task.test_fail} {t('pipeline.test_fail')}</span>
            )}
            {task.status === 'developing' && (
              <span> &nbsp;{t('pipeline.test_running')}</span>
            )}
          </div>
        )}

        {/* Preview */}
        <PreviewPanel
          taskId={task.id}
          preview={previewSvc}
          onStarted={setPreviewSvc}
        />

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.btnGhost}>{t('pipeline.card_log')}</button>
          <button className={styles.btnGhost}>{t('pipeline.card_diff')}</button>

          {task.status === 'pending_review' && (
            <button
              className={`${styles.btnPrimary} ${styles.btnPrimaryAlone}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              ✓ {t('pipeline.card_approve')}
            </button>
          )}

          {task.status === 'ready_to_merge' && (
            <div className={styles.mergeGroup}>
              <button
                className={styles.btnPrimary}
                onClick={() => mergeMutation.mutate(defaultBranch)}
                disabled={mergeMutation.isPending}
              >
                {t('pipeline.card_mergeInto')} {defaultBranch}
              </button>
              <button
                className={styles.btnDropdown}
                onClick={() => setShowBranchMenu((v) => !v)}
              >
                ▾
              </button>
            </div>
          )}
        </div>

        {/* Branch dropdown（简易实现，点击后选择） */}
        {showBranchMenu && (
          <div style={{ marginTop: 4, background: 'var(--tc-bg-primary)', border: '1px solid var(--tc-border)', borderRadius: 4, padding: 4 }}>
            {['main', 'develop', 'staging'].filter(b => b !== task.branch_name).map(b => (
              <div
                key={b}
                style={{ padding: '3px 8px', fontSize: 10, cursor: 'pointer', color: 'var(--tc-text-primary)' }}
                onClick={() => { setShowBranchMenu(false); mergeMutation.mutate(b) }}
              >
                {b}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

> **注意**：`api.updateTask` 使用已有的任务更新端点（`PATCH /api/tasks/{id}`），需确认 http.ts 中已有该方法，若无则参照 `startPreview` 方式添加：`async updateTask(id, data) { return this.fetch('/api/tasks/'+id, { method: 'PATCH', body: JSON.stringify(data) }) }`

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep "PipelineCard\|pipeline/card" | head -5
# 期望：无 error
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/pipeline/PipelineCard.tsx tauri/src/features/pipeline/card.module.css
git commit -m "feat(frontend): add PipelineCard component with expand/collapse and merge actions"
```

---

## Task 10: PipelinePage（Kanban 主页面）

**Files:**
- Create: `tauri/src/features/pipeline/index.tsx`
- Create: `tauri/src/features/pipeline/pipeline.module.css`

- [ ] **Step 1: 编写页面 CSS**

```css
/* tauri/src/features/pipeline/pipeline.module.css */
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--tc-bg-primary);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 40px;
  border-bottom: 1px solid var(--tc-border);
  flex-shrink: 0;
}

.title {
  font-size: 12px;
  font-weight: 700;
  color: var(--tc-text-primary);
}

.filterGroup {
  display: flex;
  gap: 3px;
  margin-left: 8px;
}

.filterBtn {
  font-size: 10px;
  background: none;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  color: var(--tc-text-muted);
  padding: 1px 8px;
  cursor: pointer;
}

.filterBtn[data-active="true"] {
  background: var(--tc-bg-hover);
  color: var(--tc-text-primary);
}

.newBtn {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  background: var(--tc-accent, #2563eb);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
}

.board {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.col {
  flex: 1;
  border-right: 1px solid var(--tc-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.col:last-child {
  border-right: none;
}

.colHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tc-border);
  flex-shrink: 0;
}

.colLabel {
  font-size: 9px;
  font-weight: 500;
  color: var(--tc-text-muted);
  letter-spacing: 0.3px;
}

.colCount {
  margin-left: auto;
  font-size: 9px;
  background: var(--tc-bg-hover);
  color: var(--tc-text-muted);
  padding: 0 6px;
  border-radius: 3px;
}

.colBody {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty {
  color: var(--tc-text-muted);
  font-size: 10px;
  text-align: center;
  margin-top: 20px;
}
```

- [ ] **Step 2: 编写 PipelinePage**

```tsx
// tauri/src/features/pipeline/index.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { PipelineCard } from './PipelineCard'
import type { PipelineTask, PreviewService } from '../../lib/api/types'
import styles from './pipeline.module.css'

const COLUMNS: Array<{ key: string; i18nKey: string }> = [
  { key: 'developing',     i18nKey: 'pipeline.col_developing' },
  { key: 'pending_review', i18nKey: 'pipeline.col_review' },
  { key: 'ready_to_merge', i18nKey: 'pipeline.col_ready' },
]

export default function PipelinePage() {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const [expandedId, setExpandedId] = useState<Record<string, number | null>>({
    developing: null, pending_review: null, ready_to_merge: null,
  })

  const { data: tasks = [], refetch } = useQuery({
    queryKey: ['pipeline', projectId],
    queryFn: () => api.getPipelineTasks(Number(projectId!)),
    enabled: !!projectId,
    refetchInterval: 5_000,
  })

  const { data: previews = [] } = useQuery({
    queryKey: ['previews'],
    queryFn: () => api.listPreviews(),
    refetchInterval: 3_000,
  })

  // 从 tc-config 读取默认合并分支
  const { data: tcConfig } = useQuery({
    queryKey: ['tc-config'],
    queryFn: () => api.getTcConfig(),
    staleTime: 60_000,
  })
  const defaultBranch: string = (tcConfig as any)?.pipeline?.default_merge_branch ?? 'main'

  const previewMap = new Map<number, PreviewService>(
    previews.map((p) => [p.task_id, p])
  )

  function handleExpand(colKey: string, taskId: number) {
    setExpandedId((prev) => ({
      ...prev,
      [colKey]: prev[colKey] === taskId ? null : taskId,
    }))
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span className={styles.title}>{t('pipeline.title')}</span>
        <button className={styles.newBtn}>{t('pipeline.newTask')}</button>
      </div>

      <div className={styles.board}>
        {COLUMNS.map(({ key, i18nKey }) => {
          const colTasks = tasks.filter((t) => t.status === key)
          return (
            <div key={key} className={styles.col}>
              <div className={styles.colHeader}>
                <span className={styles.colLabel}>{t(i18nKey)}</span>
                <span className={styles.colCount}>{colTasks.length}</span>
              </div>
              <div className={styles.colBody}>
                {colTasks.length === 0 && (
                  <div className={styles.empty}>—</div>
                )}
                {colTasks.map((task) => (
                  <PipelineCard
                    key={task.id}
                    task={task}
                    preview={previewMap.get(task.id)}
                    defaultBranch={defaultBranch}
                    expanded={expandedId[key] === task.id}
                    onExpand={() => handleExpand(key, task.id)}
                    onMerged={() => refetch()}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

> **注意**：`api.getTcConfig()` 需在 http.ts 中添加：`async getTcConfig() { return this.fetch('/api/tc-config') }`，若已存在则复用。

- [ ] **Step 3: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep "pipeline/index\|PipelinePage" | head -5
# 期望：无 error
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/pipeline/
git commit -m "feat(frontend): add PipelinePage kanban with three-column layout"
```

---

## Task 11: 路由 + 侧边栏注册

**Files:**
- Modify: `tauri/src/app/Router.tsx`
- Modify: `tauri/src/layouts/Sidebar/Sidebar.tsx`

- [ ] **Step 1: 在 Router.tsx 注册懒加载路由**

找到现有路由定义文件 `tauri/src/app/Router.tsx`，在已有 lazy import 列表中添加：

```typescript
const PipelinePage = lazy(() => import('../features/pipeline'))
```

在路由配置中添加（与 git、settings 等同级）：

```tsx
<Route path="/pipeline" element={<PipelinePage />} />
```

- [ ] **Step 2: 在 Sidebar.tsx 添加流水线入口**

在 `tauri/src/layouts/Sidebar/Sidebar.tsx` 中，找到 git 入口所在行，在其后添加：

```tsx
<SidebarItem
  to="/pipeline"
  icon={<Icon name="git-branch" size={16} />}
  label={t('pipeline.title')}
/>
```

> 若 Sidebar 使用 nav items 数组配置而非 JSX 直写，在数组中插入 `{ path: '/pipeline', icon: 'git-branch', labelKey: 'pipeline.title' }`。

- [ ] **Step 3: 验证页面可访问**

```bash
cd tauri && pnpm dev
# 浏览器访问 http://localhost:7071/#/pipeline
# 期望：显示三列 Kanban，无控制台 error
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/app/Router.tsx tauri/src/layouts/Sidebar/Sidebar.tsx
git commit -m "feat(frontend): register /pipeline route and sidebar entry"
```

---

## Task 12: 设置页 ServicesPanel

**Files:**
- Create: `tauri/src/features/settings/components/ServicesPanel.tsx`
- Modify: `tauri/src/features/settings/index.tsx`

- [ ] **Step 1: 编写 ServicesPanel**

```tsx
// tauri/src/features/settings/components/ServicesPanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { PreviewService } from '../../../lib/api/types'

export function ServicesPanel() {
  const qc = useQueryClient()

  const { data: previews = [] } = useQuery({
    queryKey: ['previews'],
    queryFn: () => api.listPreviews(),
    refetchInterval: 3_000,
  })

  const stopOne = useMutation({
    mutationFn: (taskId: number) => api.stopPreview(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['previews'] }),
  })

  const stopAll = useMutation({
    mutationFn: () => api.stopAllPreviews(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['previews'] }),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>运行中的预览服务</span>
        {previews.length > 0 && (
          <button
            onClick={() => stopAll.mutate()}
            disabled={stopAll.isPending}
            style={{ fontSize: 11, color: 'var(--tc-text-danger, #f87171)', background: 'none', border: '1px solid var(--tc-border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
          >
            全部关闭
          </button>
        )}
      </div>

      {previews.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--tc-text-muted)', padding: '8px 0' }}>
          暂无运行中的服务
        </div>
      )}

      {previews.map((svc: PreviewService) => (
        <div
          key={svc.task_id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--tc-bg-secondary)', borderRadius: 4, marginBottom: 4, border: '1px solid var(--tc-border)' }}
        >
          <span style={{ width: 6, height: 6, background: '#4ade80', borderRadius: '50%', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 11 }}>任务 #{svc.task_id}</span>
          <span style={{ fontSize: 10, color: 'var(--tc-text-muted)', fontFamily: 'monospace' }}>
            localhost:{svc.port}
          </span>
          <button
            onClick={() => stopOne.mutate(svc.task_id)}
            style={{ fontSize: 10, color: 'var(--tc-text-danger, #f87171)', background: 'none', border: '1px solid var(--tc-border)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}
          >
            关闭
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 在 settings/index.tsx 引入 ServicesPanel**

在 `tauri/src/features/settings/index.tsx` 顶部导入：
```typescript
import { ServicesPanel } from './components/ServicesPanel'
```

在 `SettingsPage` 返回的 JSX 中，在现有第一个 `<SectionCard>` 之前插入：

```tsx
<SectionCard title="预览服务管理">
  <ServicesPanel />
</SectionCard>
```

- [ ] **Step 3: TypeScript 检查 + 验证**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep "ServicesPanel\|settings" | head -5
# 期望：无 error
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/settings/components/ServicesPanel.tsx tauri/src/features/settings/index.tsx
git commit -m "feat(frontend): add ServicesPanel to settings for preview process management"
```

---

## 完成验收

所有任务完成后，执行以下验收检查：

```bash
# 1. 后端启动无报错
cd backend && uvicorn app.main:app --port 8765 &
curl -s http://localhost:8765/api/previews       # → []
curl -s http://localhost:8765/api/tc-config | python3 -c "import sys,json; print(json.load(sys.stdin)['pipeline'])"
# → {'default_merge_branch': 'main'}

# 2. 前端启动无报错
cd tauri && pnpm dev
# 访问 http://localhost:7071/#/pipeline → 三列 Kanban 显示
# 访问 http://localhost:7071/#/settings → 「预览服务管理」区块显示

# 3. 类型检查通过
cd tauri && npx tsc --noEmit
# → 无 error
```

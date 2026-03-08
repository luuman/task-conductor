# Git Source Control 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 Files 页面集成完整的 Git Source Control 视图（Changes/Diff/Commit/Log/Branch/Stash）

**Architecture:** 后端新增 `routers/git.py` 提供 Git 操作 API（基于 subprocess 调用 git CLI）；前端在 ProjectFiles 页面顶部增加 Tab 切换，新增 `SourceControl.tsx` 组件实现 Changes/Log 双面板 + Diff 查看器

**Tech Stack:** FastAPI + subprocess(git CLI) / React + Tailwind + highlight.js + SVG(分支图谱)

---

### Task 1: 后端 Git API 路由 — 状态与 Diff

**Files:**
- Create: `backend/app/routers/git.py`
- Modify: `backend/app/main.py:11-288` (注册路由)

**Step 1: 创建 `backend/app/routers/git.py` 基础结构 + status/diff 端点**

```python
"""Git 操作 API：状态、diff、stage/unstage、commit、分支、stash"""
import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Project

router = APIRouter(prefix="/api/projects", tags=["Git"])

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

def _run_git(cwd: Path, *args: str, timeout: int = 15) -> subprocess.CompletedProcess:
    """执行 git 命令，返回 CompletedProcess"""
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd), capture_output=True, text=True, timeout=timeout,
    )
    return result

def _ensure_git(cwd: Path):
    if not (cwd / ".git").exists():
        raise HTTPException(400, "不是 Git 仓库")
```

实现两个端点：

**GET `/{project_id}/git/status`** — 返回 staged/unstaged/untracked 三组文件列表：
```python
@router.get("/{project_id}/git/status")
def git_status(project_id: int, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    # git status --porcelain=v1
    result = _run_git(base, "status", "--porcelain=v1")
    staged, unstaged, untracked = [], [], []
    for line in result.stdout.splitlines():
        if len(line) < 4: continue
        x, y = line[0], line[1]
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if x == "?" and y == "?":
            untracked.append({"path": path, "status": "untracked"})
        else:
            if x != " " and x != "?":
                status_map = {"M":"modified","A":"added","D":"deleted","R":"renamed","C":"copied"}
                staged.append({"path": path, "status": status_map.get(x, "changed")})
            if y != " " and y != "?":
                status_map = {"M":"modified","D":"deleted"}
                unstaged.append({"path": path, "status": status_map.get(y, "changed")})
    # branch
    br = _run_git(base, "rev-parse", "--abbrev-ref", "HEAD")
    branch = br.stdout.strip() if br.returncode == 0 else None
    return {"branch": branch, "staged": staged, "unstaged": unstaged, "untracked": untracked}
```

**GET `/{project_id}/git/diff`** — 返回 unified diff 文本：
```python
@router.get("/{project_id}/git/diff")
def git_diff(
    project_id: int,
    file: str = Query(None),
    staged: bool = Query(False),
    commit: str = Query(None),
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    args = ["diff"]
    if commit:
        args.append(f"{commit}~1..{commit}")
    elif staged:
        args.append("--cached")
    if file:
        args += ["--", file]
    result = _run_git(base, *args, timeout=30)
    return {"diff": result.stdout}
```

**Step 2: 在 `main.py` 注册路由**

在 import 区添加：
```python
from .routers import git as git_router
```
在 `app.include_router` 区添加：
```python
app.include_router(git_router.router)  # Git 操作 API
```

**Step 3: 手动测试**

启动后端，用 curl 验证：
```bash
curl http://localhost:8765/api/projects/1/git/status
curl "http://localhost:8765/api/projects/1/git/diff?file=README.md"
```

**Step 4: Commit**
```bash
git add backend/app/routers/git.py backend/app/main.py
git commit -m "feat: add git status and diff API endpoints"
```

---

### Task 2: 后端 Git API — Stage/Unstage/Discard/Commit

**Files:**
- Modify: `backend/app/routers/git.py`

**Step 1: 添加 stage/unstage/discard/commit 端点**

```python
class GitFilesBody(BaseModel):
    files: list[str] = []
    all: bool = False

class GitCommitBody(BaseModel):
    message: str

@router.post("/{project_id}/git/stage")
def git_stage(project_id: int, body: GitFilesBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    if body.all:
        _run_git(base, "add", "-A")
    else:
        for f in body.files:
            _run_git(base, "add", "--", f)
    return {"ok": True}

@router.post("/{project_id}/git/unstage")
def git_unstage(project_id: int, body: GitFilesBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    if body.all:
        _run_git(base, "reset", "HEAD")
    else:
        for f in body.files:
            _run_git(base, "reset", "HEAD", "--", f)
    return {"ok": True}

@router.post("/{project_id}/git/discard")
def git_discard(project_id: int, body: GitFilesBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    for f in body.files:
        _run_git(base, "checkout", "--", f)
    return {"ok": True}

@router.post("/{project_id}/git/commit")
def git_commit(project_id: int, body: GitCommitBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "commit", "-m", body.message)
    if result.returncode != 0:
        raise HTTPException(400, f"Commit 失败: {result.stderr.strip()}")
    return {"ok": True, "output": result.stdout.strip()}
```

**Step 2: Commit**
```bash
git add backend/app/routers/git.py
git commit -m "feat: add git stage, unstage, discard, commit endpoints"
```

---

### Task 3: 后端 Git API — Log/Branches/Push/Pull/Fetch

**Files:**
- Modify: `backend/app/routers/git.py`

**Step 1: 添加 log 端点（含 parents 用于图谱绘制）**

```python
@router.get("/{project_id}/git/log")
def git_log(
    project_id: int,
    limit: int = Query(100, le=500),
    branch: str = Query(None),
    all_branches: bool = Query(True),
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    # format: hash|parents|author|date|ref_names|subject
    fmt = "%H|%P|%an|%aI|%D|%s"
    args = ["log", f"--format={fmt}", f"-n{limit}"]
    if all_branches:
        args.append("--all")
    if branch:
        args.append(branch)
    result = _run_git(base, *args, timeout=30)
    commits = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("|", 5)
        if len(parts) < 6: continue
        commits.append({
            "hash": parts[0],
            "parents": parts[1].split() if parts[1] else [],
            "author": parts[2],
            "date": parts[3],
            "refs": [r.strip() for r in parts[4].split(",") if r.strip()] if parts[4] else [],
            "message": parts[5],
        })
    return {"commits": commits}
```

**Step 2: 添加 branches/checkout/push/pull/fetch 端点**

```python
@router.get("/{project_id}/git/branches")
def git_branches(project_id: int, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "branch", "-a", "--format=%(refname:short)|%(HEAD)")
    branches = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("|", 1)
        name = parts[0].strip()
        current = len(parts) > 1 and parts[1].strip() == "*"
        is_remote = name.startswith("origin/")
        branches.append({"name": name, "current": current, "remote": is_remote})
    return {"branches": branches}

class GitCheckoutBody(BaseModel):
    branch: str
    create: bool = False

@router.post("/{project_id}/git/checkout")
def git_checkout(project_id: int, body: GitCheckoutBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    args = ["checkout"]
    if body.create:
        args.append("-b")
    args.append(body.branch)
    result = _run_git(base, *args)
    if result.returncode != 0:
        raise HTTPException(400, f"Checkout 失败: {result.stderr.strip()}")
    return {"ok": True}

@router.post("/{project_id}/git/push")
def git_push(project_id: int, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "push", timeout=60)
    if result.returncode != 0:
        raise HTTPException(400, f"Push 失败: {result.stderr.strip()}")
    return {"ok": True, "output": result.stderr.strip()}

@router.post("/{project_id}/git/pull")
def git_pull(project_id: int, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "pull", timeout=60)
    if result.returncode != 0:
        raise HTTPException(400, f"Pull 失败: {result.stderr.strip()}")
    return {"ok": True, "output": result.stdout.strip()}

@router.post("/{project_id}/git/fetch")
def git_fetch(project_id: int, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "fetch", "--all", timeout=60)
    return {"ok": True}
```

**Step 3: 添加 commit 详情端点（查看单个 commit 变更的文件）**

```python
@router.get("/{project_id}/git/commit/{sha}")
def git_commit_detail(project_id: int, sha: str, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    # 获取变更文件列表
    result = _run_git(base, "diff-tree", "--no-commit-id", "-r", "--name-status", sha)
    files = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2:
            status_map = {"M":"modified","A":"added","D":"deleted","R":"renamed"}
            files.append({"status": status_map.get(parts[0][0], "changed"), "path": parts[1]})
    # commit info
    info = _run_git(base, "log", "-1", f"--format=%H|%P|%an|%aI|%s", sha)
    meta = {}
    if info.stdout.strip():
        p = info.stdout.strip().split("|", 4)
        if len(p) >= 5:
            meta = {"hash": p[0], "parents": p[1].split(), "author": p[2], "date": p[3], "message": p[4]}
    return {"commit": meta, "files": files}
```

**Step 4: Commit**
```bash
git add backend/app/routers/git.py
git commit -m "feat: add git log, branches, push/pull/fetch, commit detail endpoints"
```

---

### Task 4: 后端 Git API — Stash

**Files:**
- Modify: `backend/app/routers/git.py`

**Step 1: 添加 stash CRUD 端点**

```python
@router.get("/{project_id}/git/stash")
def git_stash_list(project_id: int, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "stash", "list", "--format=%gd|%gs|%aI")
    items = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("|", 2)
        if len(parts) >= 2:
            items.append({"index": parts[0], "message": parts[1], "date": parts[2] if len(parts) > 2 else ""})
    return {"stashes": items}

class StashSaveBody(BaseModel):
    message: str = ""

@router.post("/{project_id}/git/stash/save")
def git_stash_save(project_id: int, body: StashSaveBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    args = ["stash", "push"]
    if body.message:
        args += ["-m", body.message]
    result = _run_git(base, *args)
    if result.returncode != 0:
        raise HTTPException(400, f"Stash 失败: {result.stderr.strip()}")
    return {"ok": True}

class StashActionBody(BaseModel):
    index: int = 0

@router.post("/{project_id}/git/stash/apply")
def git_stash_apply(project_id: int, body: StashActionBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "stash", "apply", f"stash@{{{body.index}}}")
    if result.returncode != 0:
        raise HTTPException(400, f"Apply 失败: {result.stderr.strip()}")
    return {"ok": True}

@router.post("/{project_id}/git/stash/drop")
def git_stash_drop(project_id: int, body: StashActionBody, db: Session = Depends(_get_db)):
    base = _get_project_path(project_id, db)
    _ensure_git(base)
    result = _run_git(base, "stash", "drop", f"stash@{{{body.index}}}")
    if result.returncode != 0:
        raise HTTPException(400, f"Drop 失败: {result.stderr.strip()}")
    return {"ok": True}
```

**Step 2: Commit**
```bash
git add backend/app/routers/git.py
git commit -m "feat: add git stash list/save/apply/drop endpoints"
```

---

### Task 5: 前端 API 类型定义

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: 添加 Git API 类型和方法**

在 `api.ts` 的类型区添加：
```typescript
export interface GitFileEntry { path: string; status: string }
export interface GitStatus {
  branch: string | null;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
}
export interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  refs: string[];
  message: string;
}
export interface GitBranch { name: string; current: boolean; remote: boolean }
export interface GitStashEntry { index: string; message: string; date: string }
```

在 `api` 对象中添加 `git` 命名空间：
```typescript
git: {
  status: (projectId: number) => get<GitStatus>(`/api/projects/${projectId}/git/status`),
  diff: (projectId: number, params: { file?: string; staged?: boolean; commit?: string }) =>
    get<{ diff: string }>(`/api/projects/${projectId}/git/diff`, params),
  stage: (projectId: number, body: { files?: string[]; all?: boolean }) =>
    post(`/api/projects/${projectId}/git/stage`, body),
  unstage: (projectId: number, body: { files?: string[]; all?: boolean }) =>
    post(`/api/projects/${projectId}/git/unstage`, body),
  discard: (projectId: number, body: { files: string[] }) =>
    post(`/api/projects/${projectId}/git/discard`, body),
  commit: (projectId: number, body: { message: string }) =>
    post(`/api/projects/${projectId}/git/commit`, body),
  log: (projectId: number, params?: { limit?: number; branch?: string; all_branches?: boolean }) =>
    get<{ commits: GitCommit[] }>(`/api/projects/${projectId}/git/log`, params),
  branches: (projectId: number) =>
    get<{ branches: GitBranch[] }>(`/api/projects/${projectId}/git/branches`),
  checkout: (projectId: number, body: { branch: string; create?: boolean }) =>
    post(`/api/projects/${projectId}/git/checkout`, body),
  push: (projectId: number) => post(`/api/projects/${projectId}/git/push`, {}),
  pull: (projectId: number) => post(`/api/projects/${projectId}/git/pull`, {}),
  fetch: (projectId: number) => post(`/api/projects/${projectId}/git/fetch`, {}),
  stashList: (projectId: number) =>
    get<{ stashes: GitStashEntry[] }>(`/api/projects/${projectId}/git/stash`),
  stashSave: (projectId: number, body?: { message?: string }) =>
    post(`/api/projects/${projectId}/git/stash/save`, body || {}),
  stashApply: (projectId: number, index: number) =>
    post(`/api/projects/${projectId}/git/stash/apply`, { index }),
  stashDrop: (projectId: number, index: number) =>
    post(`/api/projects/${projectId}/git/stash/drop`, { index }),
  commitDetail: (projectId: number, sha: string) =>
    get<{ commit: GitCommit; files: GitFileEntry[] }>(`/api/projects/${projectId}/git/commit/${sha}`),
},
```

**Step 2: Commit**
```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add git API types and methods to api.ts"
```

---

### Task 6: 前端 Diff 查看器组件

**Files:**
- Create: `frontend/src/components/DiffViewer.tsx`

**Step 1: 实现 unified diff 解析器 + 双模式渲染**

组件接收 `diff: string` 和 `fileName: string`，解析 unified diff 格式，支持 inline / side-by-side 切换。

关键实现：
- 解析 `@@` hunk headers 提取行号
- 按 `+` `-` ` ` 前缀分类行
- inline 模式：单列，增行绿色背景 `bg-emerald-500/10`，删行红色背景 `bg-red-500/10`
- side-by-side 模式：左旧右新，两列 table
- 行号显示，语法高亮用 highlight.js
- 右上角切换按钮：`Columns2` / `List` 图标

```typescript
interface DiffLine {
  type: "add" | "del" | "ctx" | "hunk";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

function parseDiff(raw: string): DiffLine[] { ... }
```

**Step 2: Commit**
```bash
git add frontend/src/components/DiffViewer.tsx
git commit -m "feat: add DiffViewer component with inline/side-by-side modes"
```

---

### Task 7: 前端 Changes 面板组件

**Files:**
- Create: `frontend/src/components/git/ChangesPanel.tsx`

**Step 1: 实现 Changes 面板**

三组可折叠列表（Staged / Unstaged / Untracked），每个文件条目有：
- 文件图标 + 文件名 + 状态 badge (M/A/D/U/R)
- Stage(`+`) / Unstage(`-`) 按钮
- Discard 按钮（仅 unstaged，带 confirm）
- Stage All / Unstage All 批量按钮

底部 Commit 区域：
- message textarea（支持 Ctrl+Enter 提交）
- Commit 按钮
- Push / Pull / Fetch 按钮组

Props：
```typescript
interface ChangesPanelProps {
  projectId: number;
  onSelectFile: (path: string, staged: boolean) => void;
  selectedFile: string | null;
  onRefresh: () => void;
}
```

**Step 2: Commit**
```bash
git add frontend/src/components/git/ChangesPanel.tsx
git commit -m "feat: add ChangesPanel with stage/unstage/commit UI"
```

---

### Task 8: 前端 Git Graph 分支图谱组件

**Files:**
- Create: `frontend/src/components/git/GitGraph.tsx`

**Step 1: 实现分支图谱 SVG 绘制**

输入：`commits: GitCommit[]`（含 parents 数组）

算法：
1. 为每个 commit 分配 column（"泳道"），基于 parents 关系
2. 同一分支的连续 commit 在同一列
3. 合并 commit 画连接线到 parent 所在列
4. 每列不同颜色（预定义 6-8 种颜色循环）

SVG 渲染：
- 每行高度固定 32px
- 圆点半径 4px，线宽 2px
- commit 信息在圆点右侧：短 hash(7位) + message + refs badges + author + 相对时间
- 点击 commit → `onSelectCommit(sha)`

```typescript
interface GitGraphProps {
  commits: GitCommit[];
  selectedCommit: string | null;
  onSelectCommit: (sha: string) => void;
}
```

**Step 2: Commit**
```bash
git add frontend/src/components/git/GitGraph.tsx
git commit -m "feat: add GitGraph component with SVG branch visualization"
```

---

### Task 9: 前端 Log 面板组件（图谱 + Branches + Stash）

**Files:**
- Create: `frontend/src/components/git/LogPanel.tsx`

**Step 1: 实现 Log 面板**

布局：
- 顶部：GitGraph 组件（占主要空间，可滚动）
- 底部折叠区域 1：Branches 列表
  - 当前分支标 `*`，本地/远程分组
  - 点击分支 → checkout（带确认）
  - "新建分支" 按钮
- 底部折叠区域 2：Stash 列表
  - 每条显示 index + message + 相对时间
  - Apply / Drop 按钮
  - "Stash 当前更改" 按钮

Props：
```typescript
interface LogPanelProps {
  projectId: number;
  onSelectCommit: (sha: string) => void;
  selectedCommit: string | null;
  onRefresh: () => void;
}
```

**Step 2: Commit**
```bash
git add frontend/src/components/git/LogPanel.tsx
git commit -m "feat: add LogPanel with branches list and stash management"
```

---

### Task 10: 前端 SourceControl 主组件

**Files:**
- Create: `frontend/src/components/git/SourceControl.tsx`

**Step 1: 实现 SourceControl 主组件**

组合 ChangesPanel + LogPanel + DiffViewer：
- 左面板（320px）：顶部 Tab 切换 Changes / Log
- 右面板：DiffViewer
  - Changes 模式：显示选中文件的 working tree diff
  - Log 模式：显示选中 commit 的变更文件列表，点击文件看该 commit 的 diff

Props：
```typescript
interface SourceControlProps {
  project: Project;
}
```

状态管理：
- `tab: "changes" | "log"`
- `selectedFile / selectedCommit`
- `diffContent`：调用 `api.git.diff()` 获取

**Step 2: Commit**
```bash
git add frontend/src/components/git/SourceControl.tsx
git commit -m "feat: add SourceControl main component combining panels"
```

---

### Task 11: 集成到 ProjectFiles 页面

**Files:**
- Modify: `frontend/src/pages/ProjectFiles.tsx:708-828`

**Step 1: 在 ProjectFiles 顶栏添加 Tab 切换**

在 `ProjectFiles` 组件中：
1. 添加 `activeTab: "files" | "source-control"` state
2. 顶栏增加两个 Tab 按钮（📁 Files / 🔀 Source Control）
3. `activeTab === "files"` 渲染现有的 FileTree + CodeViewer
4. `activeTab === "source-control"` 渲染 `<SourceControl project={project} />`

顶栏 Tab 样式：
```tsx
<div className="flex items-center gap-1">
  <button
    onClick={() => setActiveTab("files")}
    className={cn("px-3 py-1.5 text-[12px] rounded-md transition-colors", ...)}
  >
    <FolderSearch size={13} /> Files
  </button>
  <button
    onClick={() => setActiveTab("source-control")}
    className={cn("px-3 py-1.5 text-[12px] rounded-md transition-colors", ...)}
  >
    <GitBranch size={13} /> Source Control
  </button>
</div>
```

**Step 2: 验证**

启动前后端，在 Files 页面测试：
- Tab 切换正常
- Files tab 功能不变
- Source Control tab 显示 Changes / Log / Diff

**Step 3: Commit**
```bash
git add frontend/src/pages/ProjectFiles.tsx frontend/src/components/git/
git commit -m "feat: integrate Source Control tab into ProjectFiles page"
```

---

## 任务依赖关系

```
Task 1-4 (后端 API)  →  Task 5 (前端 API 类型)
                              ↓
                     Task 6 (DiffViewer)
                     Task 7 (ChangesPanel)
                     Task 8 (GitGraph)
                     Task 9 (LogPanel)
                              ↓
                     Task 10 (SourceControl 组合)
                              ↓
                     Task 11 (集成 ProjectFiles)
```

Tasks 1-4 可并行开发（都是后端独立端点）。
Tasks 6-9 可并行开发（独立组件）。
Task 10 依赖 6-9。
Task 11 依赖 10。

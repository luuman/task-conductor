# 文件编辑器 + Git 页实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `/files`（VS Code 风格文件编辑器 + ⌘K AI）和 `/git`（需求关联虚拟分支浏览 + Diff）两个页面。

**Architecture:** 共享基础层（types + API + stores）→ `/files` 页（Monaco Editor）→ `/git` 页（Monaco DiffEditor）。后端先补 5 个新端点（文件 CRUD + Git 虚拟浏览），前端再逐步构建组件。

**Tech Stack:** Monaco Editor (@monaco-editor/react)、TanStack Query 5、Zustand 5、CSS Modules、i18next

**Spec:** `docs/superpowers/specs/2026-03-16-file-editor-git-page-design.md`

---

## Chunk 1: 基础层（Types + API + Stores + i18n + 依赖）

### Task 1: 安装 Monaco Editor 依赖

**Files:**
- Modify: `tauri/package.json`

- [ ] **Step 1: 安装 @monaco-editor/react**

```bash
cd tauri && pnpm add @monaco-editor/react
```

- [ ] **Step 2: 验证安装成功**

```bash
cd tauri && pnpm ls @monaco-editor/react
```

Expected: 显示版本号

- [ ] **Step 3: Commit**

```bash
git add tauri/package.json tauri/pnpm-lock.yaml
git commit -m "chore: add @monaco-editor/react dependency"
```

---

### Task 2: 新增 TypeScript 类型定义

**Files:**
- Modify: `tauri/src/lib/api/types.ts`

- [ ] **Step 1: 在 `types.ts` 末尾（`ApiAdapter` 接口之前）添加新类型**

在 `ProjectComponents` 接口之后、`ApiAdapter` 接口之前插入：

```typescript
// ─── 编辑器 ───

export interface EditorTab {
  path: string
  name: string
  language: string
}

// ─── Git ───

export interface GitStatus {
  branch: string
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
}

export interface GitFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'U'
}

export interface BranchFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
  additions: number
  deletions: number
}

export interface GitCommit {
  hash: string
  parents: string[]
  author: string
  date: string
  refs: string
  message: string
}

export interface GitBranch {
  name: string
  current: boolean
  remote: boolean
}

export interface GitStash {
  ref: string
  message: string
  date: string
}

export interface InlineEditRequest {
  file_path: string
  file_content: string
  selection: { startLine: number; endLine: number }
  instruction: string
}

export interface InlineEditResponse {
  original: string
  modified: string
}
```

- [ ] **Step 2: 在 `ApiAdapter` 接口中添加新方法签名**

在 `ApiAdapter` 接口的 `claudeConfig` 之前添加：

```typescript
  // ─── 文件操作 ───
  getFileContent(projectId: number, path: string): Promise<{ path: string; name: string; size: number; binary: boolean; content: string }>
  saveFile(projectId: number, path: string, content: string): Promise<void>
  createFile(projectId: number, path: string, content?: string): Promise<void>
  createDirectory(projectId: number, path: string): Promise<void>
  renameFile(projectId: number, oldPath: string, newPath: string): Promise<void>
  deleteFile(projectId: number, path: string): Promise<void>
  searchFiles(projectId: number, query: string): Promise<FileItem[]>

  // ─── Git 操作 ───
  gitStatus(projectId: number): Promise<GitStatus>
  gitDiff(projectId: number, opts?: { file?: string; staged?: boolean; commit?: string }): Promise<string>
  gitStage(projectId: number, files?: string[]): Promise<void>
  gitUnstage(projectId: number, files?: string[]): Promise<void>
  gitDiscard(projectId: number, files: string[]): Promise<void>
  gitCommit(projectId: number, message: string): Promise<void>
  gitLog(projectId: number, limit?: number, branch?: string): Promise<GitCommit[]>
  gitBranches(projectId: number): Promise<GitBranch[]>
  gitCheckout(projectId: number, branch: string, create?: boolean): Promise<void>
  gitPush(projectId: number): Promise<void>
  gitPull(projectId: number): Promise<void>
  gitFetch(projectId: number): Promise<void>
  gitStashList(projectId: number): Promise<GitStash[]>
  gitStashSave(projectId: number, message?: string): Promise<void>
  gitStashApply(projectId: number, index: number): Promise<void>
  gitStashDrop(projectId: number, index: number): Promise<void>

  // ─── Git 虚拟浏览 ───
  gitShow(projectId: number, ref: string, path: string): Promise<{ content: string }>
  gitBranchFiles(projectId: number, branch: string, base?: string): Promise<BranchFileChange[]>
  gitBranchDiff(projectId: number, branch: string, file: string, base?: string): Promise<string>

  // ─── AI ───
  aiInlineEdit(req: InlineEditRequest): Promise<InlineEditResponse>
```

- [ ] **Step 3: 运行 tsc 检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | head -20
```

Expected: `HttpAdapter` 缺失方法的错误（预期，后续 Task 实现）

- [ ] **Step 4: Commit**

```bash
git add tauri/src/lib/api/types.ts
git commit -m "feat: add TypeScript types for file editor and git page"
```

---

### Task 3: 实现 HttpAdapter API 方法

**Files:**
- Modify: `tauri/src/lib/api/http.ts`

- [ ] **Step 1: 在 http.ts 的 import 中添加新类型**

在现有 import 行中添加：

```typescript
import type {
  ApiAdapter, ApiMode, Project, Task, AiSession, SessionEvent, Settings, FileItem, ProjectKnowledge,
  Metrics, ClaudeUsage, ClaudeOverview, ClaudeConfig, HookRule, McpServer,
  SkillDetail, CommandInfo, RuleInfo, AgentInfo, PresetItem, ClaudeSystemInfo,
  DisabledItem, ProjectComponents, ProjectDetails,
  GitStatus, GitCommit, GitBranch, GitStash, BranchFileChange,
  InlineEditRequest, InlineEditResponse,
} from './types'
```

- [ ] **Step 2: 在 HttpAdapter 中添加文件操作方法**

在 `getProjectFiles` 方法附近添加：

```typescript
  getFileContent(projectId: number, path: string) {
    return this.fetch<{ path: string; name: string; size: number; binary: boolean; content: string }>(
      `/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`
    )
  }

  saveFile(projectId: number, path: string, content: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    })
  }

  createFile(projectId: number, path: string, content?: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file`, {
      method: 'POST',
      body: JSON.stringify({ path, content: content ?? '' }),
    })
  }

  createDirectory(projectId: number, path: string) {
    return this.fetch<void>(`/api/projects/${projectId}/directory`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  renameFile(projectId: number, oldPath: string, newPath: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file/rename`, {
      method: 'POST',
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    })
  }

  deleteFile(projectId: number, path: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    })
  }

  searchFiles(projectId: number, query: string) {
    return this.fetch<FileItem[]>(
      `/api/projects/${projectId}/files/search?q=${encodeURIComponent(query)}`
    )
  }
```

- [ ] **Step 3: 添加 Git 操作方法**

```typescript
  gitStatus(projectId: number) {
    return this.fetch<GitStatus>(`/api/projects/${projectId}/git/status`)
  }

  gitDiff(projectId: number, opts?: { file?: string; staged?: boolean; commit?: string }) {
    const params = new URLSearchParams()
    if (opts?.file) params.set('file', opts.file)
    if (opts?.staged) params.set('staged', 'true')
    if (opts?.commit) params.set('commit', opts.commit)
    const qs = params.toString()
    return this.fetch<string>(`/api/projects/${projectId}/git/diff${qs ? `?${qs}` : ''}`)
  }

  gitStage(projectId: number, files?: string[]) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stage`, {
      method: 'POST',
      body: JSON.stringify(files ? { files } : { all: true }),
    })
  }

  gitUnstage(projectId: number, files?: string[]) {
    return this.fetch<void>(`/api/projects/${projectId}/git/unstage`, {
      method: 'POST',
      body: JSON.stringify(files ? { files } : { all: true }),
    })
  }

  gitDiscard(projectId: number, files: string[]) {
    return this.fetch<void>(`/api/projects/${projectId}/git/discard`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    })
  }

  gitCommit(projectId: number, message: string) {
    return this.fetch<void>(`/api/projects/${projectId}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  gitLog(projectId: number, limit?: number, branch?: string) {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (branch) params.set('branch', branch)
    const qs = params.toString()
    return this.fetch<GitCommit[]>(`/api/projects/${projectId}/git/log${qs ? `?${qs}` : ''}`)
  }

  gitBranches(projectId: number) {
    return this.fetch<GitBranch[]>(`/api/projects/${projectId}/git/branches`)
  }

  gitCheckout(projectId: number, branch: string, create?: boolean) {
    return this.fetch<void>(`/api/projects/${projectId}/git/checkout`, {
      method: 'POST',
      body: JSON.stringify(create ? { create: branch } : { branch }),
    })
  }

  gitPush(projectId: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/push`, { method: 'POST' })
  }

  gitPull(projectId: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/pull`, { method: 'POST' })
  }

  gitFetch(projectId: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/fetch`, { method: 'POST' })
  }

  gitStashList(projectId: number) {
    return this.fetch<GitStash[]>(`/api/projects/${projectId}/git/stash`)
  }

  gitStashSave(projectId: number, message?: string) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stash/save`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  gitStashApply(projectId: number, index: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stash/apply`, {
      method: 'POST',
      body: JSON.stringify({ index }),
    })
  }

  gitStashDrop(projectId: number, index: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stash/drop`, {
      method: 'POST',
      body: JSON.stringify({ index }),
    })
  }

  // ─── Git 虚拟浏览 ───

  gitShow(projectId: number, ref: string, path: string) {
    return this.fetch<{ content: string }>(
      `/api/projects/${projectId}/git/show?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`
    )
  }

  gitBranchFiles(projectId: number, branch: string, base?: string) {
    const params = new URLSearchParams({ branch })
    if (base) params.set('base', base)
    return this.fetch<BranchFileChange[]>(`/api/projects/${projectId}/git/branch-files?${params}`)
  }

  gitBranchDiff(projectId: number, branch: string, file: string, base?: string) {
    const params = new URLSearchParams({ branch, file })
    if (base) params.set('base', base)
    return this.fetch<string>(`/api/projects/${projectId}/git/branch-diff?${params}`)
  }

  // ─── AI ───

  aiInlineEdit(req: InlineEditRequest) {
    return this.fetch<InlineEditResponse>('/api/ai/inline-edit', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  }
```

- [ ] **Step 4: 运行 tsc 检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | head -10
```

Expected: 无错误或仅后端不存在的端点（前端编译通过）

- [ ] **Step 5: Commit**

```bash
git add tauri/src/lib/api/http.ts
git commit -m "feat: implement HttpAdapter methods for files, git, and AI"
```

---

### Task 4: 创建 Zustand Stores

**Files:**
- Create: `tauri/src/lib/store/editor.ts`
- Create: `tauri/src/lib/store/git.ts`

- [ ] **Step 1: 创建 editor store**

```typescript
// tauri/src/lib/store/editor.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditorTab } from '../api/types'

interface EditorState {
  openTabs: EditorTab[]
  activeTabPath: string | null
  unsavedPaths: string[]
  explorerWidth: number

  openFile: (tab: EditorTab) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  markUnsaved: (path: string) => void
  markSaved: (path: string) => void
  hasUnsaved: () => boolean
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      openTabs: [],
      activeTabPath: null,
      unsavedPaths: [],
      explorerWidth: 220,

      openFile: (tab) => {
        const { openTabs } = get()
        const exists = openTabs.some((t) => t.path === tab.path)
        if (!exists) {
          set({ openTabs: [...openTabs, tab], activeTabPath: tab.path })
        } else {
          set({ activeTabPath: tab.path })
        }
      },

      closeTab: (path) => {
        const { openTabs, activeTabPath, unsavedPaths } = get()
        const filtered = openTabs.filter((t) => t.path !== path)
        const newActive =
          activeTabPath === path
            ? filtered[filtered.length - 1]?.path ?? null
            : activeTabPath
        set({
          openTabs: filtered,
          activeTabPath: newActive,
          unsavedPaths: unsavedPaths.filter((p) => p !== path),
        })
      },

      setActiveTab: (path) => set({ activeTabPath: path }),

      markUnsaved: (path) => {
        const { unsavedPaths } = get()
        if (!unsavedPaths.includes(path)) {
          set({ unsavedPaths: [...unsavedPaths, path] })
        }
      },

      markSaved: (path) => {
        set({ unsavedPaths: get().unsavedPaths.filter((p) => p !== path) })
      },

      hasUnsaved: () => get().unsavedPaths.length > 0,
    }),
    {
      name: 'tc-editor',
      partialize: (state) => ({
        openTabs: state.openTabs,
        activeTabPath: state.activeTabPath,
        explorerWidth: state.explorerWidth,
      }),
    }
  )
)
```

- [ ] **Step 2: 创建 git store**

```typescript
// tauri/src/lib/store/git.ts
import { create } from 'zustand'

interface GitState {
  activeTab: 'changes' | 'branches' | 'log'
  selectedTaskId: number | null
  virtualBranch: string | null
  diffMode: 'side' | 'inline' | 'file'
  selectedFile: string | null

  setActiveTab: (tab: GitState['activeTab']) => void
  setSelectedTask: (taskId: number | null, branch: string | null) => void
  setVirtualBranch: (branch: string | null) => void
  setDiffMode: (mode: GitState['diffMode']) => void
  setSelectedFile: (file: string | null) => void
}

export const useGitStore = create<GitState>()((set) => ({
  activeTab: 'branches',
  selectedTaskId: null,
  virtualBranch: null,
  diffMode: 'side',
  selectedFile: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTask: (taskId, branch) =>
    set({ selectedTaskId: taskId, virtualBranch: branch, selectedFile: null }),
  setVirtualBranch: (branch) => set({ virtualBranch: branch, selectedFile: null }),
  setDiffMode: (mode) => set({ diffMode: mode }),
  setSelectedFile: (file) => set({ selectedFile: file }),
}))
```

- [ ] **Step 3: 运行 tsc**

```bash
cd tauri && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/lib/store/editor.ts tauri/src/lib/store/git.ts
git commit -m "feat: add Zustand stores for editor and git"
```

---

### Task 5: 添加 i18n 翻译

**Files:**
- Modify: `tauri/src/i18n/zh.json`
- Modify: `tauri/src/i18n/en.json`

- [ ] **Step 1: 在 zh.json 中添加 files / editor / git 三个命名空间**

在 `"settings"` 之前添加（注意 JSON 逗号）：

```json
  "files": {
    "explorer": "资源管理器",
    "newFile": "新建文件",
    "newDir": "新建目录",
    "rename": "重命名",
    "delete": "删除",
    "copyPath": "复制路径",
    "openInVscode": "在 VS Code 中打开",
    "searchPlaceholder": "搜索文件...",
    "unsavedConfirm": "有未保存的更改，确定离开吗？",
    "collapseAll": "折叠全部",
    "refresh": "刷新",
    "deleteConfirm": "确定删除？此操作不可撤销。"
  },
  "editor": {
    "unsaved": "未保存",
    "saved": "已保存",
    "aiPlaceholder": "输入修改指令...",
    "aiAccept": "接受",
    "aiReject": "放弃",
    "aiRetry": "重试",
    "aiWorking": "AI 处理中..."
  },
  "git": {
    "changes": "变更",
    "branches": "分支",
    "log": "日志",
    "staged": "已暂存",
    "unstaged": "未暂存",
    "untracked": "未跟踪",
    "stageAll": "全部暂存",
    "unstageAll": "全部取消",
    "discard": "放弃更改",
    "discardConfirm": "确定放弃所选文件的更改？此操作不可撤销。",
    "commitPlaceholder": "提交消息...",
    "commit": "提交",
    "push": "推送",
    "pull": "拉取",
    "fetch": "获取",
    "requirements": "需求关联",
    "virtualBrowse": "虚拟浏览",
    "virtualHint": "不影响工作区",
    "allBranches": "所有分支",
    "checkout": "切换",
    "checkoutConfirm": "有未提交的更改，切换分支可能丢失。确定切换？",
    "changedFiles": "变更文件",
    "vs": "vs",
    "sideBySide": "并排",
    "inline": "行内",
    "file": "文件",
    "stash": "暂存区",
    "stashApply": "应用",
    "stashDrop": "删除",
    "viewCode": "查看代码",
    "noChanges": "无变更",
    "noBranch": "选择分支查看",
    "noCommits": "无提交记录"
  },
```

- [ ] **Step 2: 在 en.json 中添加对应英文翻译**

```json
  "files": {
    "explorer": "Explorer",
    "newFile": "New File",
    "newDir": "New Folder",
    "rename": "Rename",
    "delete": "Delete",
    "copyPath": "Copy Path",
    "openInVscode": "Open in VS Code",
    "searchPlaceholder": "Search files...",
    "unsavedConfirm": "You have unsaved changes. Leave anyway?",
    "collapseAll": "Collapse All",
    "refresh": "Refresh",
    "deleteConfirm": "Are you sure? This cannot be undone."
  },
  "editor": {
    "unsaved": "Unsaved",
    "saved": "Saved",
    "aiPlaceholder": "Enter edit instruction...",
    "aiAccept": "Accept",
    "aiReject": "Reject",
    "aiRetry": "Retry",
    "aiWorking": "AI working..."
  },
  "git": {
    "changes": "Changes",
    "branches": "Branches",
    "log": "Log",
    "staged": "Staged",
    "unstaged": "Unstaged",
    "untracked": "Untracked",
    "stageAll": "Stage All",
    "unstageAll": "Unstage All",
    "discard": "Discard",
    "discardConfirm": "Discard changes to selected files? This cannot be undone.",
    "commitPlaceholder": "Commit message...",
    "commit": "Commit",
    "push": "Push",
    "pull": "Pull",
    "fetch": "Fetch",
    "requirements": "Requirements",
    "virtualBrowse": "Virtual Browse",
    "virtualHint": "Does not affect working directory",
    "allBranches": "All Branches",
    "checkout": "Checkout",
    "checkoutConfirm": "You have uncommitted changes. Switching branches may lose them. Continue?",
    "changedFiles": "Changed Files",
    "vs": "vs",
    "sideBySide": "Side by Side",
    "inline": "Inline",
    "file": "File",
    "stash": "Stash",
    "stashApply": "Apply",
    "stashDrop": "Drop",
    "viewCode": "View Code",
    "noChanges": "No changes",
    "noBranch": "Select a branch to view",
    "noCommits": "No commits"
  },
```

- [ ] **Step 3: Commit**

```bash
git add tauri/src/i18n/zh.json tauri/src/i18n/en.json
git commit -m "feat: add i18n keys for files, editor, and git pages"
```

---

### Task 6: 新增后端端点 — 文件 CRUD

**Files:**
- Modify: `backend/app/routers/files.py`

- [ ] **Step 1: 添加 POST /api/projects/{id}/file（创建文件）**

在 `files.py` 中已有的 `save_file`（PUT）路由之后添加：

```python
@router.post("/{project_id}/file")
async def create_file(project_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    rel = body.get("path", "")
    content = body.get("content", "")
    target = safe_resolve(project.repo_url, rel)
    if target is None:
        raise HTTPException(400, "invalid path")
    if target.exists():
        raise HTTPException(409, "file already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"ok": True}
```

- [ ] **Step 2: 添加 POST /api/projects/{id}/directory（创建目录）**

```python
@router.post("/{project_id}/directory")
async def create_directory(project_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    rel = body.get("path", "")
    target = safe_resolve(project.repo_url, rel)
    if target is None:
        raise HTTPException(400, "invalid path")
    if target.exists():
        raise HTTPException(409, "directory already exists")
    target.mkdir(parents=True, exist_ok=True)
    return {"ok": True}
```

- [ ] **Step 3: 添加 POST /api/projects/{id}/file/rename（重命名）**

```python
@router.post("/{project_id}/file/rename")
async def rename_file(project_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    old_rel = body.get("old_path", "")
    new_rel = body.get("new_path", "")
    old_target = safe_resolve(project.repo_url, old_rel)
    new_target = safe_resolve(project.repo_url, new_rel)
    if old_target is None or new_target is None:
        raise HTTPException(400, "invalid path")
    if not old_target.exists():
        raise HTTPException(404, "source not found")
    if new_target.exists():
        raise HTTPException(409, "target already exists")
    new_target.parent.mkdir(parents=True, exist_ok=True)
    old_target.rename(new_target)
    return {"ok": True}
```

- [ ] **Step 4: 添加 DELETE /api/projects/{id}/file（删除）**

```python
@router.delete("/{project_id}/file")
async def delete_file(project_id: int, path: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    target = safe_resolve(project.repo_url, path)
    if target is None:
        raise HTTPException(400, "invalid path")
    if not target.exists():
        raise HTTPException(404, "not found")
    if target.is_dir():
        if any(target.iterdir()):
            raise HTTPException(400, "directory not empty")
        target.rmdir()
    else:
        target.unlink()
    return {"ok": True}
```

- [ ] **Step 5: 确认 safe_resolve 函数存在**

检查 `files.py` 顶部是否已有 `safe_resolve` 辅助函数。它应该做路径遍历防护：确保 resolved path 在项目根目录内。

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/files.py
git commit -m "feat: add file create, directory, rename, delete endpoints"
```

---

### Task 7: 新增后端端点 — Git 虚拟浏览

**Files:**
- Modify: `backend/app/routers/git.py`

- [ ] **Step 1: 添加 ref 参数校验辅助函数**

在 `git.py` 顶部添加：

```python
import re

_UNSAFE_REF_PATTERN = re.compile(r'[;&|$`\\\'\"<>]|\.\.')

def _validate_ref(ref: str) -> str:
    """校验 git ref 参数，拒绝危险字符。"""
    if not ref or len(ref) > 256 or _UNSAFE_REF_PATTERN.search(ref):
        raise HTTPException(400, f"invalid ref: {ref}")
    return ref
```

- [ ] **Step 2: 添加 GET /git/show（虚拟读取文件）**

```python
@router.get("/{project_id}/git/show")
async def git_show(project_id: int, ref: str, path: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    ref = _validate_ref(ref)
    result = await _run_git(project.repo_url, ["show", f"{ref}:{path}"])
    if result["code"] != 0:
        raise HTTPException(404, result.get("stderr", "not found"))
    return {"content": result["stdout"]}
```

- [ ] **Step 3: 添加 GET /git/branch-files（分支变更文件列表）**

```python
@router.get("/{project_id}/git/branch-files")
async def git_branch_files(project_id: int, branch: str, base: str = "main", db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    branch = _validate_ref(branch)
    base = _validate_ref(base)
    # --numstat 获取增删行数，--name-status 获取状态
    numstat = await _run_git(project.repo_url, ["diff", "--numstat", f"{base}...{branch}"])
    namestatus = await _run_git(project.repo_url, ["diff", "--name-status", f"{base}...{branch}"])
    if numstat["code"] != 0:
        raise HTTPException(400, numstat.get("stderr", "diff failed"))

    status_map = {}
    for line in namestatus["stdout"].strip().splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2:
            status_map[parts[1]] = parts[0][0]

    files = []
    for line in numstat["stdout"].strip().splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            add_str, del_str, fpath = parts
            files.append({
                "path": fpath,
                "status": status_map.get(fpath, "M"),
                "additions": int(add_str) if add_str != "-" else 0,
                "deletions": int(del_str) if del_str != "-" else 0,
            })
    return files
```

- [ ] **Step 4: 添加 GET /git/branch-diff（分支单文件 diff）**

```python
@router.get("/{project_id}/git/branch-diff")
async def git_branch_diff(project_id: int, branch: str, file: str, base: str = "main", db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    branch = _validate_ref(branch)
    base = _validate_ref(base)
    result = await _run_git(project.repo_url, ["diff", f"{base}...{branch}", "--", file])
    if result["code"] != 0:
        raise HTTPException(400, result.get("stderr", "diff failed"))
    return {"diff": result["stdout"]}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/git.py
git commit -m "feat: add git show, branch-files, branch-diff endpoints for virtual browsing"
```

---

### Task 8: 新增后端端点 — AI 内联编辑

**Files:**
- Create: `backend/app/routers/ai.py`
- Modify: `backend/app/main.py`（注册路由）

- [ ] **Step 1: 创建 ai.py 路由**

```python
# backend/app/routers/ai.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.claude.pool import ClaudePool

router = APIRouter(prefix="/api/ai", tags=["ai"])


class InlineEditRequest(BaseModel):
    file_path: str
    file_content: str
    selection: dict  # {startLine, endLine}
    instruction: str


@router.post("/inline-edit")
async def inline_edit(req: InlineEditRequest):
    start = req.selection.get("startLine", 1)
    end = req.selection.get("endLine", start)
    lines = req.file_content.splitlines()
    selected = "\n".join(lines[start - 1:end])

    prompt = f"""你是代码编辑助手。用户选中了以下代码（文件 {req.file_path} 第 {start}-{end} 行）：

```
{selected}
```

用户指令：{req.instruction}

请直接返回修改后的代码片段（只返回替换选中部分的代码，不要返回整个文件，不要包含 markdown 代码块标记）。"""

    pool = ClaudePool.get()
    result = await pool.ask(prompt)
    if result is None:
        raise HTTPException(500, "AI request failed")

    return {"original": selected, "modified": result.strip()}
```

- [ ] **Step 2: 在 main.py 中注册路由**

在已有的 router include 列表中添加：

```python
from app.routers import ai as ai_router
app.include_router(ai_router.router)
```

- [ ] **Step 3: 确认 ClaudePool.ask() 方法存在**

检查 `backend/app/claude/pool.py`，如果没有 `ask()` 单次问答方法，需要添加。如果只有 `run()`（长任务），则实现一个简单的：

```python
async def ask(self, prompt: str) -> str | None:
    """单次问答，返回文本结果。"""
    import asyncio
    proc = await asyncio.create_subprocess_exec(
        "claude", "-p", prompt, "--output-format", "text",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
    if proc.returncode != 0:
        return None
    return stdout.decode("utf-8")
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/ai.py backend/app/main.py backend/app/claude/pool.py
git commit -m "feat: add AI inline-edit endpoint"
```

---

## Chunk 2: /files 页面 — 文件编辑器

### Task 9: 文件页骨架 + 路由注册

**Files:**
- Create: `tauri/src/features/files/index.tsx`
- Create: `tauri/src/features/files/FilesPage.tsx`
- Create: `tauri/src/features/files/files-page.module.css`
- Modify: `tauri/src/app/Router.tsx`（替换 PlaceholderPage）

- [ ] **Step 1: 创建 index.tsx（lazy export）**

```typescript
// tauri/src/features/files/index.tsx
export { FilesPage as default } from './FilesPage'
```

- [ ] **Step 2: 创建 FilesPage.tsx 骨架**

```typescript
// tauri/src/features/files/FilesPage.tsx
import { useTranslation } from 'react-i18next'
import styles from './files-page.module.css'

export function FilesPage() {
  const { t } = useTranslation()

  return (
    <div className={styles.container}>
      <div className={styles.explorer}>
        <div className={styles.explorerHeader}>
          <span className={styles.explorerTitle}>{t('files.explorer')}</span>
        </div>
        <div className={styles.explorerBody}>
          {/* FileExplorer 组件待实现 */}
        </div>
      </div>
      <div className={styles.editorArea}>
        <div className={styles.placeholder}>
          {t('files.searchPlaceholder')}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 files-page.module.css**

```css
/* tauri/src/features/files/files-page.module.css */
.container {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.explorer {
  width: 220px;
  min-width: 160px;
  max-width: 400px;
  background: var(--tc-sidebar-bg);
  border-right: 1px solid var(--tc-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.explorerHeader {
  padding: 8px 10px;
  border-bottom: 1px solid var(--tc-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.explorerTitle {
  font-size: 11px;
  font-weight: 600;
  color: var(--tc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.explorerBody {
  flex: 1;
  overflow-y: auto;
}

.editorArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tc-text-muted);
  font-size: 13px;
}
```

- [ ] **Step 4: 更新 Router.tsx 注册路由**

替换 `/files` 的 `PlaceholderPage`：

```typescript
const FilesPage = lazy(() => import('../features/files'))
```

并更新路由：

```tsx
<Route path="/files" element={<FilesPage />} />
```

- [ ] **Step 5: 运行 tsc + 浏览器验证**

```bash
cd tauri && npx tsc --noEmit
```

启动 dev server 访问 `/files` 确认骨架渲染。

- [ ] **Step 6: Commit**

```bash
git add tauri/src/features/files/ tauri/src/app/Router.tsx
git commit -m "feat: add /files page skeleton with explorer + editor layout"
```

---

### Task 10: FileTree 组件

**Files:**
- Create: `tauri/src/features/files/components/FileTree.tsx`
- Create: `tauri/src/features/files/components/file-tree.module.css`
- Create: `tauri/src/features/files/hooks/useFileTree.ts`

- [ ] **Step 1: 创建 useFileTree hook（TanStack Query）**

```typescript
// tauri/src/features/files/hooks/useFileTree.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useFileTree(subPath?: string) {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['files', projectId, subPath ?? ''],
    queryFn: () => api.getProjectFiles(Number(projectId)),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}
```

注意：现有 `getProjectFiles` 返回 `{path, items}`，目前不支持子目录。如果后端 `GET /api/projects/{id}/files` 支持 `?path=` 参数获取子目录，则修改 queryFn。需先检查后端实现。

- [ ] **Step 2: 创建 FileTree 组件**

```typescript
// tauri/src/features/files/components/FileTree.tsx
import { useState, useCallback } from 'react'
import type { FileItem } from '../../../lib/api/types'
import styles from './file-tree.module.css'

interface FileTreeProps {
  items: FileItem[]
  onFileClick: (path: string, name: string) => void
  activePath?: string | null
}

const EXT_ICONS: Record<string, string> = {
  ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨',
  css: '🟪', json: '⬜', md: '📝', py: '🐍',
  html: '🌐', svg: '🎨',
}

function getIcon(name: string, isDir: boolean): string {
  if (isDir) return '📂'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? '📄'
}

export function FileTree({ items, onFileClick, activePath }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const sorted = [...items].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className={styles.tree}>
      {sorted.map((item) => (
        <div
          key={item.path}
          className={`${styles.item} ${item.path === activePath ? styles.active : ''}`}
          onClick={() => {
            if (item.is_dir) toggle(item.path)
            else onFileClick(item.path, item.name)
          }}
          role="button"
          tabIndex={0}
        >
          <span className={styles.arrow}>
            {item.is_dir ? (expanded.has(item.path) ? '▾' : '▸') : ''}
          </span>
          <span className={styles.icon}>{getIcon(item.name, item.is_dir)}</span>
          <span className={styles.name}>{item.name}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 创建 file-tree.module.css**

```css
/* tauri/src/features/files/components/file-tree.module.css */
.tree {
  padding: 4px 0;
}

.item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 12px;
  font-size: 12px;
  color: var(--tc-text-secondary);
  cursor: pointer;
  height: 24px;
  user-select: none;
}

.item:hover {
  background: var(--tc-hover-bg);
}

.active {
  background: var(--tc-active-bg);
  color: var(--tc-text-primary);
}

.arrow {
  width: 12px;
  font-size: 9px;
  color: var(--tc-text-muted);
  flex-shrink: 0;
  text-align: center;
}

.icon {
  font-size: 13px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/files/components/FileTree.tsx tauri/src/features/files/components/file-tree.module.css tauri/src/features/files/hooks/useFileTree.ts
git commit -m "feat: add FileTree component with useFileTree hook"
```

---

### Task 11: FileExplorer 组件（搜索 + 工具栏 + FileTree）

**Files:**
- Create: `tauri/src/features/files/components/FileExplorer.tsx`
- Create: `tauri/src/features/files/components/file-explorer.module.css`
- Modify: `tauri/src/features/files/FilesPage.tsx`

- [ ] **Step 1: 创建 FileExplorer**

组合搜索框 + 工具栏按钮 + FileTree。搜索框监听 input 事件，空时显示完整树，非空时调用 `searchFiles`。

- [ ] **Step 2: 创建 CSS**

- [ ] **Step 3: 在 FilesPage 中替换占位为 FileExplorer**

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/files/components/FileExplorer.tsx tauri/src/features/files/components/file-explorer.module.css tauri/src/features/files/FilesPage.tsx
git commit -m "feat: add FileExplorer with search and toolbar"
```

---

### Task 12: EditorTabs 组件

**Files:**
- Create: `tauri/src/features/files/components/EditorTabs.tsx`
- Create: `tauri/src/features/files/components/editor-tabs.module.css`

- [ ] **Step 1: 创建 EditorTabs**

从 `useEditorStore` 读取 `openTabs` / `activeTabPath` / `unsavedPaths`，渲染 Tab 列表。每个 Tab 显示文件名 + 未保存圆点 + 关闭按钮。

- [ ] **Step 2: CSS 样式**

参考线框图：高度 35px，活跃 Tab 底部 2px 紫色线。

- [ ] **Step 3: Commit**

```bash
git add tauri/src/features/files/components/EditorTabs.tsx tauri/src/features/files/components/editor-tabs.module.css
git commit -m "feat: add EditorTabs component with unsaved indicators"
```

---

### Task 13: MonacoWrapper 组件

**Files:**
- Create: `tauri/src/features/files/components/MonacoWrapper.tsx`

- [ ] **Step 1: 创建 Monaco 编辑器包装**

```typescript
// tauri/src/features/files/components/MonacoWrapper.tsx
import { useRef, useCallback } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { useEditorStore } from '../../../lib/store/editor'

interface MonacoWrapperProps {
  path: string
  content: string
  language: string
  onContentChange?: (content: string) => void
}

export function MonacoWrapper({ path, content, language, onContentChange }: MonacoWrapperProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const projectId = useAppStore((s) => s.activeProjectId)
  const { markUnsaved, markSaved } = useEditorStore()

  const handleMount: OnMount = useCallback((ed) => {
    editorRef.current = ed

    // ⌘S 保存
    ed.addAction({
      id: 'tc-save',
      label: 'Save File',
      keybindings: [2048 + 49], // Ctrl/Cmd + S
      run: async () => {
        if (!projectId) return
        const value = ed.getValue()
        await api.saveFile(Number(projectId), path, value)
        markSaved(path)
      },
    })
  }, [projectId, path, markSaved])

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      markUnsaved(path)
      onContentChange?.(value)
    }
  }, [path, markUnsaved, onContentChange])

  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme="vs-dark"
      onMount={handleMount}
      onChange={handleChange}
      options={{
        fontSize: 13,
        minimap: { enabled: true },
        lineNumbers: 'on',
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        automaticLayout: true,
      }}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add tauri/src/features/files/components/MonacoWrapper.tsx
git commit -m "feat: add MonacoWrapper component with save action"
```

---

### Task 14: StatusBar 组件

**Files:**
- Create: `tauri/src/features/files/components/StatusBar.tsx`
- Create: `tauri/src/features/files/components/status-bar.module.css`

- [ ] **Step 1: 创建 StatusBar**

显示：分支名、保存状态、光标位置、文件类型、编码。从 editor store 读取 unsaved 状态。

- [ ] **Step 2: CSS 样式**

高度 24px，底部贴边，左右两区布局。

- [ ] **Step 3: Commit**

```bash
git add tauri/src/features/files/components/StatusBar.tsx tauri/src/features/files/components/status-bar.module.css
git commit -m "feat: add StatusBar component for file editor"
```

---

### Task 15: 组装完整 FilesPage

**Files:**
- Modify: `tauri/src/features/files/FilesPage.tsx`
- Modify: `tauri/src/features/files/files-page.module.css`

- [ ] **Step 1: 整合所有组件**

FilesPage 组装：FileExplorer（左） + EditorTabs + MonacoWrapper + StatusBar（右）。从 `useEditorStore` 获取 activeTabPath，用 TanStack Query 加载文件内容，传给 MonacoWrapper。

- [ ] **Step 2: 实现未保存离开确认**

使用 `react-router-dom` 的 `useBlocker` 或 `window.onbeforeunload` 拦截导航。

- [ ] **Step 3: 验证完整流程**

启动 dev server，打开 `/files`：
1. 左侧显示项目文件树
2. 点击文件 → 右侧 Monaco 编辑器打开
3. 编辑 → Tab 显示未保存圆点
4. ⌘S → 保存成功

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/files/
git commit -m "feat: assemble complete FilesPage with editor, tabs, and save"
```

---

### Task 16: InlineAI 组件（⌘K）

**Files:**
- Create: `tauri/src/features/files/components/InlineAI.tsx`
- Create: `tauri/src/features/files/components/inline-ai.module.css`
- Create: `tauri/src/features/files/hooks/useInlineAI.ts`
- Modify: `tauri/src/features/files/components/MonacoWrapper.tsx`

- [ ] **Step 1: 创建 useInlineAI hook**

```typescript
// tauri/src/features/files/hooks/useInlineAI.ts
import { useMutation } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { InlineEditRequest } from '../../../lib/api/types'

export function useInlineAI() {
  return useMutation({
    mutationFn: (req: InlineEditRequest) => api.aiInlineEdit(req),
  })
}
```

- [ ] **Step 2: 创建 InlineAI 组件**

浮窗组件：输入框 + diff 预览 + 接受/放弃/重试按钮。位置由 Monaco 的 `IContentWidget` API 控制，锚定在选区下方。

- [ ] **Step 3: 在 MonacoWrapper 中注册 ⌘K action**

```typescript
ed.addAction({
  id: 'tc-inline-ai',
  label: 'AI Inline Edit',
  keybindings: [2048 + 37], // Ctrl/Cmd + K
  run: () => {
    const selection = ed.getSelection()
    // 无选区时选中当前行
    // 触发 InlineAI 组件显示
  },
})
```

- [ ] **Step 4: CSS 样式**

- [ ] **Step 5: 验证流程**

框选代码 → ⌘K → 输入指令 → AI 返回 → 预览 diff → 接受

- [ ] **Step 6: Commit**

```bash
git add tauri/src/features/files/components/InlineAI.tsx tauri/src/features/files/components/inline-ai.module.css tauri/src/features/files/hooks/useInlineAI.ts tauri/src/features/files/components/MonacoWrapper.tsx
git commit -m "feat: add ⌘K inline AI editing with diff preview"
```

---

## Chunk 3: /git 页面

### Task 17: Git 页骨架 + 路由注册

**Files:**
- Create: `tauri/src/features/git/index.tsx`
- Create: `tauri/src/features/git/GitPage.tsx`
- Create: `tauri/src/features/git/git-page.module.css`
- Modify: `tauri/src/app/Router.tsx`

- [ ] **Step 1: 创建 index.tsx**

```typescript
export { GitPage as default } from './GitPage'
```

- [ ] **Step 2: 创建 GitPage 骨架**

左右两栏布局。左侧 280px 含三个 Tab（变更/分支/日志）。右侧 Diff 区域。

- [ ] **Step 3: CSS**

与 files-page 类似的 flex 布局，左侧 280px。

- [ ] **Step 4: 更新 Router.tsx**

```typescript
const GitPage = lazy(() => import('../features/git'))
```

```tsx
<Route path="/git" element={<GitPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add tauri/src/features/git/ tauri/src/app/Router.tsx
git commit -m "feat: add /git page skeleton with three-tab layout"
```

---

### Task 18: BranchesTab + RequirementList + FileChangeList

**Files:**
- Create: `tauri/src/features/git/components/BranchesTab.tsx`
- Create: `tauri/src/features/git/components/RequirementList.tsx`
- Create: `tauri/src/features/git/components/FileChangeList.tsx`
- Create: `tauri/src/features/git/components/branches-tab.module.css`
- Create: `tauri/src/features/git/hooks/useBranchFiles.ts`

- [ ] **Step 1: 创建 useBranchFiles hook**

```typescript
// tauri/src/features/git/hooks/useBranchFiles.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useBranchFiles(branch: string | null) {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['branch-files', projectId, branch],
    queryFn: () => api.gitBranchFiles(Number(projectId!), branch!),
    enabled: !!projectId && !!branch,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 2: 创建 RequirementList**

从 `api.getTasks(projectId)` 获取有 `branch_name` 的任务，每个任务显示阶段图标 + 名称 + 分支标签。点击调用 `useGitStore.setSelectedTask()`。

- [ ] **Step 3: 创建 FileChangeList**

接收 `BranchFileChange[]`，渲染文件列表（状态 badge + 文件名 + 增删统计）。点击文件调用 `useGitStore.setSelectedFile()`。

- [ ] **Step 4: 创建 BranchesTab**

组合 RequirementList + FileChangeList + 虚拟浏览 badge。

- [ ] **Step 5: CSS**

- [ ] **Step 6: Commit**

```bash
git add tauri/src/features/git/components/ tauri/src/features/git/hooks/
git commit -m "feat: add BranchesTab with requirement list and file changes"
```

---

### Task 19: DiffViewer 组件（Monaco DiffEditor）

**Files:**
- Create: `tauri/src/features/git/components/DiffViewer.tsx`
- Create: `tauri/src/features/git/components/diff-viewer.module.css`
- Create: `tauri/src/features/git/hooks/useDiff.ts`

- [ ] **Step 1: 创建 useDiff hook**

获取虚拟分支上的文件内容（`gitShow`）+ base 分支的文件内容，供 Monaco DiffEditor 使用。

```typescript
// tauri/src/features/git/hooks/useDiff.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useDiffContent(branch: string | null, file: string | null, base = 'main') {
  const projectId = useAppStore((s) => s.activeProjectId)

  const original = useQuery({
    queryKey: ['git-show', projectId, base, file],
    queryFn: () => api.gitShow(Number(projectId!), base, file!),
    enabled: !!projectId && !!file,
    staleTime: 60_000,
  })

  const modified = useQuery({
    queryKey: ['git-show', projectId, branch, file],
    queryFn: () => api.gitShow(Number(projectId!), branch!, file!),
    enabled: !!projectId && !!branch && !!file,
    staleTime: 60_000,
  })

  return { original, modified }
}
```

- [ ] **Step 2: 创建 DiffViewer**

```typescript
// tauri/src/features/git/components/DiffViewer.tsx
import { DiffEditor } from '@monaco-editor/react'
import { useTranslation } from 'react-i18next'
import { useGitStore } from '../../../lib/store/git'
import { useDiffContent } from '../hooks/useDiff'
import styles from './diff-viewer.module.css'

export function DiffViewer() {
  const { t } = useTranslation()
  const { virtualBranch, selectedFile, diffMode, setDiffMode } = useGitStore()
  const { original, modified } = useDiffContent(virtualBranch, selectedFile)

  if (!selectedFile) {
    return <div className={styles.empty}>{t('git.noBranch')}</div>
  }

  const lang = selectedFile.split('.').pop() ?? 'plaintext'

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.filename}>{selectedFile}</span>
        <div className={styles.modeSwitch}>
          {(['side', 'inline', 'file'] as const).map((m) => (
            <button
              key={m}
              className={`${styles.modeBtn} ${diffMode === m ? styles.active : ''}`}
              onClick={() => setDiffMode(m)}
            >
              {t(`git.${m === 'side' ? 'sideBySide' : m}`)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.body}>
        {diffMode === 'file' ? (
          /* 只读查看分支文件完整内容 — 用普通 Editor */
          null // 后续实现
        ) : (
          <DiffEditor
            height="100%"
            language={lang}
            original={original.data?.content ?? ''}
            modified={modified.data?.content ?? ''}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: diffMode === 'side',
              automaticLayout: true,
            }}
          />
        )}
      </div>
      <div className={styles.status}>
        <span>👁 {t('git.virtualBrowse')} {virtualBranch}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: CSS 样式**

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/components/DiffViewer.tsx tauri/src/features/git/components/diff-viewer.module.css tauri/src/features/git/hooks/useDiff.ts
git commit -m "feat: add DiffViewer with Monaco DiffEditor and mode switching"
```

---

### Task 20: ChangesTab 组件

**Files:**
- Create: `tauri/src/features/git/components/ChangesTab.tsx`
- Create: `tauri/src/features/git/components/changes-tab.module.css`
- Create: `tauri/src/features/git/hooks/useGitStatus.ts`

- [ ] **Step 1: 创建 useGitStatus hook**

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useGitStatus() {
  const projectId = useAppStore((s) => s.activeProjectId)
  return useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () => api.gitStatus(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 0,
  })
}
```

- [ ] **Step 2: 创建 ChangesTab**

三个折叠组（staged/unstaged/untracked）+ stage/unstage 按钮 + commit 区域 + push/pull/fetch。Git 操作后通过 `queryClient.invalidateQueries(['git-status'])` 刷新。

- [ ] **Step 3: CSS**

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/components/ChangesTab.tsx tauri/src/features/git/components/changes-tab.module.css tauri/src/features/git/hooks/useGitStatus.ts
git commit -m "feat: add ChangesTab with stage, commit, push/pull operations"
```

---

### Task 21: LogTab 组件

**Files:**
- Create: `tauri/src/features/git/components/LogTab.tsx`
- Create: `tauri/src/features/git/components/log-tab.module.css`
- Create: `tauri/src/features/git/hooks/useGitLog.ts`

- [ ] **Step 1: 创建 useGitLog hook**

- [ ] **Step 2: 创建 LogTab**

V1 简化版：commit 列表（短 hash + 消息 + 作者 + 时间），点击 commit 在 DiffViewer 中展示。底部 stash 列表。

- [ ] **Step 3: CSS**

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/components/LogTab.tsx tauri/src/features/git/components/log-tab.module.css tauri/src/features/git/hooks/useGitLog.ts
git commit -m "feat: add LogTab with commit list and stash management"
```

---

### Task 22: 组装完整 GitPage + query param 联动

**Files:**
- Modify: `tauri/src/features/git/GitPage.tsx`
- Modify: `tauri/src/features/git/git-page.module.css`

- [ ] **Step 1: 整合 ChangesTab + BranchesTab + LogTab + DiffViewer**

左侧根据 `useGitStore.activeTab` 切换三个 Tab。右侧始终显示 DiffViewer。

- [ ] **Step 2: 实现 query param 联动**

读取 `?task=` URL 参数，自动切换到 Branches Tab 并选中对应任务：

```typescript
const [searchParams] = useSearchParams()
const taskId = searchParams.get('task')
useEffect(() => {
  if (taskId) {
    setActiveTab('branches')
    // 从 tasks 中找到对应 branch_name 并设置
  }
}, [taskId])
```

- [ ] **Step 3: 验证完整流程**

1. 打开 `/git` → 看到三个 Tab
2. 分支 Tab → 点击需求 → 右侧显示 diff
3. 变更 Tab → 显示 git status
4. `/git?task=1` → 自动选中任务

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/
git commit -m "feat: assemble complete GitPage with all tabs and query param routing"
```

---

### Task 23: 任务详情页添加"查看代码"按钮

**Files:**
- 需确认任务详情页组件路径（当前为 PlaceholderPage，如果已实现则修改对应文件）

- [ ] **Step 1: 在任务详情页添加"查看代码"按钮**

如果 Task 有 `branch_name`，显示按钮，点击 `navigate('/git?task=${task.id}')`。

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add 'View Code' button in task detail linking to git page"
```

---

## Chunk 4: 收尾

### Task 24: TypeScript 全量检查 + 清理

- [ ] **Step 1: 运行 tsc --noEmit**

```bash
cd tauri && npx tsc --noEmit
```

修复所有类型错误。

- [ ] **Step 2: 清理未使用的 import**

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: fix type errors and clean up unused imports"
```

---

### Task 25: 手动端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd backend && uvicorn app.main:app --port 8765 --reload
```

- [ ] **Step 2: 启动前端**

```bash
cd tauri && pnpm dev
```

- [ ] **Step 3: 验证 /files 页**

1. 左侧文件树显示项目目录
2. 点击 .tsx 文件 → Monaco 编辑器打开，语法高亮正确
3. 编辑内容 → Tab 显示 ●
4. ⌘S → 保存成功，● 消失
5. 多 Tab 切换正常
6. 框选代码 → ⌘K → 输入指令 → AI 返回 diff

- [ ] **Step 4: 验证 /git 页**

1. 分支 Tab 显示有分支的任务列表
2. 点击任务 → 右侧 Monaco DiffEditor 显示 diff
3. 变更 Tab 显示 git status
4. 日志 Tab 显示 commit 列表

- [ ] **Step 5: Final commit**

```bash
git commit -m "feat: complete file editor and git page implementation"
```

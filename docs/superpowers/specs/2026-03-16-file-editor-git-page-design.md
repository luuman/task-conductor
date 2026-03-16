# 文件编辑器 + Git 页设计规格

## 概述

为 TaskConductor Tauri 桌面客户端实现两个核心页面：

1. **`/files` 文件编辑器**：VS Code 风格的文件浏览 + Monaco 代码编辑器，支持 ⌘K 内联 AI 修改
2. **`/git` Git 页**：需求/分支关联、虚拟分支浏览（不 checkout）、Side-by-side Diff 查看

---

## `/files` 文件编辑器

### 布局

```
┌─────────────────────────────────────────────────────┐
│ TopBar                                              │
├────┬──────────┬─────────────────────────────────────┤
│ Nav│ Explorer  │  Editor (Monaco)                    │
│ Bar│ 220px     │                                     │
│ 44 │           │  [Tab: Layout.tsx ● | Router.tsx]   │
│ px │ 🔍 搜索   │  src › app › Layout.tsx              │
│    │           │                                     │
│    │ ▾ src/    │  1│ import { useState } from 'react'│
│    │   ▾ app/  │  2│ ...                             │
│    │     ■ Lay │  3│                    ┌──────────┐ │
│    │     ■ Rou │  4│  [selected code]   │ minimap  │ │
│    │   ▸ lib/  │     ┌─ ⌘K AI ────────┐│          │ │
│    │   ▸ ui/   │     │ ✨ 修改指令...   ││          │ │
│    │           │     │ diff preview     ││          │ │
│    │           │     │ [✓接受][✗放弃]   ││          │ │
│    │           │     └─────────────────┘│          │ │
│    │           ├─────────────────────────┴──────────┤
│    │           │ ⎇ main · ● 未保存 · Ln 4, Col 42   │
└────┴───────────┴────────────────────────────────────┘
```

### 资源管理器（左侧 220px）

- 顶部工具栏：标题 `t('files.explorer')` + 新建文件 / 刷新 / 折叠全部 按钮
- 文件搜索框（⌘P 快速打开文件）
- 目录树：展开/折叠，文件类型图标（TS=蓝, JS=黄, CSS=紫, JSON=灰 等）
- 点击文件 → 在编辑器中打开新 Tab
- 右键菜单：新建文件、新建目录、重命名、删除、复制路径、在 VS Code 中打开
- 面板宽度可拖拽调整

### Monaco 编辑器（右侧）

- **多 Tab**：打开的文件以 Tab 展示，未保存文件 Tab 显示圆点标记（●），Tab 可通过 Zustand 持久化到 localStorage 跨导航保持
- **面包屑**：`src › app › Layout.tsx` + 文件类型/编码信息
- **代码编辑**：Monaco Editor（@monaco-editor/react，异步加载），包含：
  - 语法高亮（语言从文件扩展名推断，不依赖后端返回 language 字段）
  - 行号 + 当前行高亮
  - Minimap（右侧缩略图）
  - 搜索替换（⌘F / ⌘H）
  - 代码折叠
  - 多光标编辑
- **保存行为**：⌘S 手动保存，切换 Tab 或离开页面时如有未保存内容弹确认框
- **状态栏**：分支名、保存状态、光标位置（Ln/Col）、文件类型、编码

### ⌘K 内联 AI 修改

交互流程：
1. 用户框选一段代码（无选区时按 ⌘K 则选中当前行）
2. 按 ⌘K 弹出内联指令输入框（浮动在选区下方）
3. 输入修改意图（如"提取到自定义 hook"）
4. AI 返回修改建议，以 inline diff 形式展示（绿色增、红色删）
5. 三个操作按钮：接受（应用到编辑器，标记未保存）、放弃（取消）、重试（重新生成）

技术实现：
- Monaco 的 `IContentWidget` API 实现内联浮窗
- 调用新增后端端点 `POST /api/ai/inline-edit`，请求体：

```json
{
  "file_path": "src/app/Layout.tsx",
  "file_content": "...完整文件...",
  "selection": { "startLine": 9, "endLine": 11 },
  "instruction": "提取到自定义 hook useCommandMenu"
}
```

返回：

```json
{
  "original": "const [cmdOpen, setCmdOpen] = useState(false)\n...",
  "modified": "const { cmdOpen, handleCmdClose, toggleCmd } = useCommandMenu()"
}
```

- 前端计算 diff 并展示
- 接受后通过 Monaco 的 `executeEdits` API 替换选区内容

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| ⌘P | 快速打开文件 |
| ⌘S | 保存当前文件 |
| ⌘K | AI 内联修改（无选区时选中当前行） |
| ⌘F | 搜索当前文件 |
| ⌘H | 搜索替换 |
| ⌘W | 关闭当前 Tab |

### 后端 API

**已有（files.py）：**
- `GET /api/projects/{id}/files?path=` — 列出目录内容
- `GET /api/projects/{id}/file?path=` — 读取文件内容（返回 `{path, name, size, binary, content}`）
- `PUT /api/projects/{id}/file` — 保存文件内容
- `GET /api/projects/{id}/files/search?q=` — 搜索文件名（50 结果限制）

**需新增（files.py）：**
- `POST /api/projects/{id}/file` — 创建文件（参数 `{path, content?}`）
- `POST /api/projects/{id}/directory` — 创建目录（参数 `{path}`）
- `POST /api/projects/{id}/file/rename` — 重命名（参数 `{old_path, new_path}`）
- `DELETE /api/projects/{id}/file?path=` — 删除文件或空目录

**需新增（AI 端点）：**
- `POST /api/ai/inline-edit` — 内联 AI 编辑（见上方请求/响应格式）

---

## `/git` Git 页

### 布局

```
┌─────────────────────────────────────────────────────┐
│ TopBar                                              │
├────┬──────────────┬─────────────────────────────────┤
│ Nav│ Left Panel    │  Diff Viewer (Monaco Diff)      │
│ Bar│ 280px         │                                 │
│ 44 │               │  Layout.tsx  +24 -8  src/app/   │
│ px │ [变更|分支|日志]│  [并排 | 行内 | 文件]           │
│    │               │                                 │
│    │ ── 需求关联 ── │  main(base)    │  feat/auth     │
│    │ ⚡ 用户认证    │  - old code    │  + new code    │
│    │   feat/auth   │  - deleted     │  + added       │
│    │ 🔍 数据分析    │               │                 │
│    │   feat/anal.. │               │                 │
│    │               │               │                 │
│    │ ── 变更文件 ── │               │                 │
│    │ M Layout.tsx  │               │                 │
│    │ A AuthPage.tsx│               │                 │
│    │ A useAuth.ts  │               │                 │
│    │               ├─────────────────────────────────┤
│    │               │ 👁 虚拟浏览 feat/auth · 6 files   │
└────┴───────────────┴─────────────────────────────────┘
```

### 左侧面板（280px）— 三个 Tab

#### Tab 1: 变更 (Changes)

当前工作区的 Git 状态：
- **Staged** 分组：已暂存的文件，每个文件有 unstage 按钮（-）
- **Unstaged** 分组：已修改未暂存，每个文件有 stage 按钮（+）
- **Untracked** 分组：新文件，每个文件有 stage 按钮（+）
- Stage All / Unstage All 批量操作
- Discard changes（带确认对话框）
- Commit 区域：消息输入框 + Commit 按钮
- Push / Pull / Fetch 按钮组
- 数据刷新策略：进入页面时自动获取一次，手动刷新按钮，git 操作（stage/commit/pull 等）后自动刷新

#### Tab 2: 分支 (Branches) — 核心功能

**需求关联区**（上半部分）：
- 从 Task 模型的 `branch_name` 字段关联，列出所有有分支的任务
- 每个任务显示：阶段图标 + 任务名 + 分支标签 + 阶段标签
- 点击任务 → **虚拟浏览**该分支（不 checkout），下方显示 branch vs main 的变更文件列表
- "虚拟浏览"标识（👁 badge），明确提示不影响工作区

**变更文件列表**（下半部分）：
- 选中需求后，显示该分支相对于 main 的所有变更文件
- 每个文件：状态标记（M/A/D）+ 文件名 + 目录 + 增删统计（+24 -8）
- 点击文件 → 右侧 Diff 查看器展示该文件的 diff

**所有分支列表**（折叠区域）：
- 需求关联区下方，折叠展示本地 + remote 分支
- 点击分支 → 默认为虚拟浏览（与需求关联区行为一致）
- 切换分支（实际 checkout）：需通过显式的"切换"按钮，且有未提交变更时弹确认对话框

**任务详情页联动**：
- 任务详情页（TaskPipeline）添加"查看代码"按钮
- 点击后 `navigate('/git?task={id}')` 跳转，Git 页读取 query param 自动选中该任务

#### Tab 3: 日志 (Log)

- Commit 历史列表：短 hash + 消息 + 作者 + 相对时间
- **V1 简化方案**：纯列表展示（不含分支图谱 SVG），每个 commit 显示分支标签；分支图谱作为后续迭代
- 点击 commit → 右侧展示该 commit 的 diff
- Stash 列表：ref + 消息 + 时间，apply / drop 操作

### 右侧 Diff 查看器

使用 **Monaco DiffEditor**（`@monaco-editor/react` 的 `DiffEditor` 组件），开箱获得语法高亮 + 同步滚动 + 一致主题。

三种模式切换（右上角）：
1. **并排 (Side-by-side)**：Monaco DiffEditor 默认模式
2. **行内 (Inline)**：Monaco DiffEditor 的 `renderSideBySide={false}` 模式
3. **文件 (File)**：切换为普通 Monaco Editor，只读展示分支上该文件完整内容

功能：
- 语法高亮（与主编辑器同主题）
- 行号 + 增删行统计
- 底部状态栏：虚拟浏览提示 + 文件变更汇总

### 虚拟分支浏览 — 技术实现

核心原理：通过 `git show ref:path` 和 `git diff ref1..ref2` 读取分支内容，不执行 `git checkout`。

后端 `ref` 参数安全校验：
- 拒绝包含 `..`、`;`、`|`、`&`、`$`、反引号等 shell 元字符的 ref
- 使用 `_run_git()` 以列表形式传参（已有），不经过 shell 解析

### 后端 API

**已有（git.py，20+ 端点，完整路径 `/api/projects/{id}/git/...`）：**
- `GET /api/projects/{id}/git/status` — staged/unstaged/untracked
- `GET /api/projects/{id}/git/diff` — unified diff（?staged / ?commit / ?file）
- `POST /api/projects/{id}/git/stage` / `unstage` / `discard`
- `POST /api/projects/{id}/git/commit` — 提交
- `GET /api/projects/{id}/git/log` — commit 历史
- `GET /api/projects/{id}/git/branches` — 分支列表
- `POST /api/projects/{id}/git/checkout` — 切换分支
- `POST /api/projects/{id}/git/push` / `pull` / `fetch`
- `GET /api/projects/{id}/git/stash` / `POST stash/save` / `stash/apply` / `stash/drop`
- `GET /api/projects/{id}/git/commit/{sha}` — 单 commit 详情

**需新增（git.py，3 个端点）：**

```
GET /api/projects/{id}/git/show?ref=<branch>&path=<file>
```
虚拟读取指定分支上的文件内容。后端执行 `git show <ref>:<path>`，返回文件文本。ref 参数需安全校验。

```
GET /api/projects/{id}/git/branch-files?branch=<name>&base=main
```
获取分支相对于 base 的变更文件列表。后端执行 `git diff --numstat --name-status <base>...<branch>`，返回 `[{path, status, additions, deletions}]`。

```
GET /api/projects/{id}/git/branch-diff?branch=<name>&base=main&file=<path>
```
获取分支相对于 base 的单文件 unified diff。后端执行 `git diff <base>...<branch> -- <file>`。

---

## TypeScript 类型定义

在 `lib/api/types.ts` 中新增：

```typescript
// 编辑器
export interface EditorTab {
  path: string        // 文件完整路径
  name: string        // 文件名
  language: string    // Monaco 语言 ID（从扩展名推断）
}

// Git
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
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 代码编辑器 | Monaco Editor（@monaco-editor/react，异步加载） |
| Diff 查看器 | Monaco DiffEditor（同一包，开箱语法高亮 + 同步滚动） |
| 状态管理 | Zustand store（editor / git），Tab 状态持久化到 localStorage |
| 数据获取 | TanStack Query 5（`useQuery` / `useMutation`，与项目现有 QueryClient 一致） |
| 样式 | CSS Modules + CSS Variables `--tc-` 前缀（项目约定） |
| 国际化 | i18next `t()` 调用，所有用户可见文本走 `zh.json` / `en.json` |

## 组件结构

```
features/
├── files/                          # /files 页
│   ├── index.tsx                   # 页面入口（lazy export）
│   ├── FilesPage.tsx               # 布局：Explorer + Editor
│   ├── files-page.module.css
│   ├── components/
│   │   ├── FileExplorer.tsx        # 左侧资源管理器
│   │   ├── file-explorer.module.css
│   │   ├── FileTree.tsx            # 目录树组件
│   │   ├── file-tree.module.css
│   │   ├── EditorTabs.tsx          # Tab 栏
│   │   ├── editor-tabs.module.css
│   │   ├── MonacoWrapper.tsx       # Monaco 包装（加载/保存/快捷键）
│   │   ├── InlineAI.tsx            # ⌘K 内联 AI 浮窗
│   │   ├── inline-ai.module.css
│   │   └── StatusBar.tsx           # 底部状态栏
│   └── hooks/
│       ├── useFileTree.ts          # useQuery 文件树数据 + 展开状态
│       ├── useEditorTabs.ts        # Tab 管理（Zustand，打开/关闭/切换/未保存检测）
│       └── useInlineAI.ts          # useMutation AI 交互
│
├── git/                            # /git 页
│   ├── index.tsx                   # 页面入口（lazy export）
│   ├── GitPage.tsx                 # 布局：LeftPanel + DiffViewer
│   ├── git-page.module.css
│   ├── components/
│   │   ├── ChangesTab.tsx          # 变更 Tab（stage/unstage/commit）
│   │   ├── BranchesTab.tsx         # 分支 Tab（需求关联 + 文件列表）
│   │   ├── LogTab.tsx              # 日志 Tab（commit 列表，V1 无图谱）
│   │   ├── DiffViewer.tsx          # Monaco DiffEditor 包装（并排/行内/文件）
│   │   ├── diff-viewer.module.css
│   │   ├── RequirementList.tsx     # 需求/任务关联列表
│   │   └── FileChangeList.tsx      # 变更文件列表
│   └── hooks/
│       ├── useGitStatus.ts         # useQuery 工作区状态
│       ├── useBranchFiles.ts       # useQuery 虚拟分支文件列表
│       ├── useDiff.ts              # useQuery Diff 数据
│       └── useGitLog.ts            # useQuery Commit 历史
```

## lib/api 扩展

在 `ApiAdapter` 接口和 `HttpAdapter` 实现中同步新增：

```typescript
// 文件操作
getFileContent(projectId: number, path: string): Promise<{ path: string; name: string; size: number; binary: boolean; content: string }>
saveFile(projectId: number, path: string, content: string): Promise<void>
createFile(projectId: number, path: string, content?: string): Promise<void>
createDirectory(projectId: number, path: string): Promise<void>
renameFile(projectId: number, oldPath: string, newPath: string): Promise<void>
deleteFile(projectId: number, path: string): Promise<void>
searchFiles(projectId: number, query: string): Promise<FileItem[]>

// Git 虚拟浏览（新增端点）
gitShow(projectId: number, ref: string, path: string): Promise<{ content: string }>
gitBranchFiles(projectId: number, branch: string, base?: string): Promise<BranchFileChange[]>
gitBranchDiff(projectId: number, branch: string, file: string, base?: string): Promise<string>

// Git 操作（已有端点，补充前端 API 方法）
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

// AI
aiInlineEdit(filePath: string, fileContent: string, selection: { startLine: number; endLine: number }, instruction: string): Promise<{ original: string; modified: string }>
```

TanStack Query 缓存策略：
- 文件树 / 文件内容：`staleTime: 30s`，编辑保存后 invalidate
- Git status / branches：`staleTime: 0`（always refetch），git 操作后 invalidate
- Git log / branch-files / branch-diff：`staleTime: 60s`

## Zustand Store

```typescript
// lib/store/editor.ts — persist to localStorage
interface EditorStore {
  openTabs: EditorTab[]
  activeTabPath: string | null
  unsavedFiles: Set<string>
  explorerWidth: number           // 默认 220

  openFile: (path: string) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  markUnsaved: (path: string) => void
  markSaved: (path: string) => void
  hasUnsaved: () => boolean       // 供离开页面确认用
}

// lib/store/git.ts
interface GitStore {
  activeTab: 'changes' | 'branches' | 'log'
  selectedTask: number | null
  virtualBranch: string | null
  diffMode: 'side' | 'inline' | 'file'
  selectedFile: string | null
}
```

## i18n Key 规划

```json
{
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
    "refresh": "刷新"
  },
  "editor": {
    "unsaved": "未保存",
    "saved": "已保存",
    "aiPlaceholder": "输入修改指令...",
    "aiAccept": "接受",
    "aiReject": "放弃",
    "aiRetry": "重试"
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
    "viewCode": "查看代码"
  }
}
```

## 线框图参考

设计线框图保存在：
- `.superpowers/brainstorm/3566292-1773672640/file-editor-final.html`
- `.superpowers/brainstorm/3566292-1773672640/git-page-design.html`

# 文件编辑器 + Git 页设计规格

## 概述

为 TaskConductor Tauri 桌面客户端实现两个核心页面：

1. **`/files` 文件编辑器**：VS Code 风格的文件浏览 + Monaco 代码编辑器，支持 ⌘K 内联 AI 修改
2. **`/git` Git 页**：需求/分支关联、虚拟分支浏览（不 checkout）、Side-by-side Diff 查看

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

- 顶部工具栏：标题"资源管理器" + 新建文件 / 刷新 / 折叠全部 按钮
- 文件搜索框（⌘P 快速打开文件）
- 目录树：展开/折叠，文件类型图标（TS=蓝, JS=黄, CSS=紫, JSON=灰 等）
- 点击文件 → 在编辑器中打开新 Tab
- 右键菜单：新建文件、新建目录、重命名、删除、复制路径、在 VS Code 中打开
- 面板宽度可拖拽调整

### Monaco 编辑器（右侧）

- **多 Tab**：打开的文件以 Tab 展示，未保存文件 Tab 显示圆点标记（●）
- **面包屑**：`src › app › Layout.tsx` + 文件类型/编码信息
- **代码编辑**：Monaco Editor（@monaco-editor/react），包含：
  - 语法高亮（所有主流语言自动检测）
  - 行号 + 当前行高亮
  - Minimap（右侧缩略图）
  - 搜索替换（⌘F / ⌘H）
  - 代码折叠
  - 多光标编辑
- **保存行为**：⌘S 手动保存，切换 Tab 或离开页面时如有未保存内容弹确认框
- **状态栏**：分支名、保存状态、光标位置（Ln/Col）、文件类型、编码

### ⌘K 内联 AI 修改

交互流程：
1. 用户框选一段代码
2. 按 ⌘K 弹出内联指令输入框（浮动在选区下方）
3. 输入修改意图（如"提取到自定义 hook"）
4. AI 返回修改建议，以 inline diff 形式展示（绿色增、红色删）
5. 三个操作按钮：接受（应用到编辑器，标记未保存）、放弃（取消）、重试（重新生成）

技术实现：
- Monaco 的 `IContentWidget` API 实现内联浮窗
- 调用后端 AI 接口（POST /api/chat），携带上下文：文件路径 + 完整文件内容 + 选区范围 + 用户指令
- AI 返回修改后的代码片段，前端计算 diff 并展示
- 接受后通过 Monaco 的 `executeEdits` API 替换选区内容

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| ⌘P | 快速打开文件 |
| ⌘S | 保存当前文件 |
| ⌘K | AI 内联修改（需先框选） |
| ⌘F | 搜索当前文件 |
| ⌘H | 搜索替换 |
| ⌘W | 关闭当前 Tab |

### 后端 API（已有）

- `GET /api/projects/{id}/files?path=` — 列出目录内容
- `GET /api/projects/{id}/file?path=` — 读取文件内容（文本/二进制检测，2MB 限制）
- `PUT /api/projects/{id}/file` — 保存文件内容
- `GET /api/projects/{id}/files/search?q=` — 搜索文件名（50 结果限制）

---

## `/git` Git 页

### 布局

```
┌─────────────────────────────────────────────────────┐
│ TopBar                                              │
├────┬──────────────┬─────────────────────────────────┤
│ Nav│ Left Panel    │  Diff Viewer                    │
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

#### Tab 2: 分支 (Branches) — 核心功能

**需求关联区**（上半部分）：
- 从 Task 模型的 `branch_name` 字段关联，列出所有有分支的任务
- 每个任务显示：阶段图标 + 任务名 + 分支标签 + 阶段标签
- 点击任务 → 虚拟浏览该分支（不 checkout），下方显示 branch vs main 的变更文件列表
- "虚拟浏览"标识（👁 badge），明确提示不影响工作区

**变更文件列表**（下半部分）：
- 选中需求后，显示该分支相对于 main 的所有变更文件
- 每个文件：状态标记（M/A/D）+ 文件名 + 目录 + 增删统计（+24 -8）
- 点击文件 → 右侧 Diff 查看器展示该文件的 diff

**所有分支列表**：
- 需求关联区下方，折叠展示本地 + remote 分支
- 当前分支标 `*`，可点击切换（实际 checkout）

**任务详情页联动**：
- 任务详情页（TaskPipeline）添加"查看代码"按钮
- 点击后 `navigate('/git?task={id}')` 跳转，Git 页读取 query param 自动选中该任务

#### Tab 3: 日志 (Log)

- Commit 历史列表：短 hash + 消息 + 作者 + 相对时间
- 分支图谱：SVG 绘制 commit 节点 + 彩色分支连线
- 点击 commit → 右侧展示该 commit 的 diff
- Stash 列表：ref + 消息 + 时间，apply / drop 操作

### 右侧 Diff 查看器

三种模式切换（右上角）：
1. **并排 (Side-by-side)**：左侧 base（main），右侧 target（分支），同步滚动
2. **行内 (Inline)**：单列展示，增行绿色背景、删行红色背景
3. **文件 (File)**：查看分支上该文件的完整内容（只读，语法高亮）

功能：
- 语法高亮（与 Monaco 同主题）
- 行号
- 增删行统计
- 底部状态栏：虚拟浏览提示 + 文件变更汇总

### 虚拟分支浏览 — 技术实现

核心原理：通过 `git show ref:path` 和 `git diff ref1..ref2` 读取分支内容，不执行 `git checkout`。

### 后端 API

**已有（git.py，20+ 端点）：**
- `GET /git/status` — staged/unstaged/untracked
- `GET /git/diff` — unified diff（支持 ?staged / ?commit / ?file）
- `POST /git/stage` / `POST /git/unstage` / `POST /git/discard`
- `POST /git/commit` — 提交
- `GET /git/log` — commit 历史
- `GET /git/branches` — 分支列表
- `POST /git/checkout` — 切换分支
- `POST /git/push` / `POST /git/pull` / `POST /git/fetch`
- `GET /git/stash` / `POST /git/stash/save` / `POST /git/stash/apply` / `POST /git/stash/drop`
- `GET /git/commit/{sha}` — 单 commit 详情

**需新增（3 个端点）：**

```
GET /api/projects/{id}/git/show?ref=<branch>&path=<file>
```
虚拟读取指定分支上的文件内容。后端执行 `git show <ref>:<path>`，返回文件文本。

```
GET /api/projects/{id}/git/branch-files?branch=<name>&base=main
```
获取分支相对于 base 的变更文件列表。后端执行 `git diff --name-status <base>...<branch>`，返回 `[{path, status, additions, deletions}]`。

```
GET /api/projects/{id}/git/branch-diff?branch=<name>&base=main&file=<path>
```
获取分支相对于 base 的单文件 unified diff。后端执行 `git diff <base>...<branch> -- <file>`。

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 代码编辑器 | Monaco Editor（@monaco-editor/react） |
| Diff 渲染 | 解析 unified diff，自定义渲染组件 |
| 语法高亮（Diff） | highlight.js 或 Shiki（与 Monaco 主题一致） |
| 分支图谱 | SVG 自绘（解析 git log --all parents） |
| 状态管理 | Zustand store（openTabs / activeFile / unsavedFiles） |
| 样式 | CSS Modules + CSS Variables（项目约定） |

## 组件结构

```
features/
├── files/                          # /files 页
│   ├── index.tsx                   # 页面入口
│   ├── FilesPage.tsx               # 布局：Explorer + Editor
│   ├── files-page.module.css
│   ├── components/
│   │   ├── FileExplorer.tsx        # 左侧资源管理器
│   │   ├── file-explorer.module.css
│   │   ├── FileTree.tsx            # 目录树组件
│   │   ├── file-tree.module.css
│   │   ├── EditorTabs.tsx          # Tab 栏
│   │   ├── editor-tabs.module.css
│   │   ├── MonacoEditor.tsx        # Monaco 包装（加载/保存/快捷键）
│   │   ├── InlineAI.tsx            # ⌘K 内联 AI 浮窗
│   │   ├── inline-ai.module.css
│   │   └── StatusBar.tsx           # 底部状态栏
│   └── hooks/
│       ├── useFileTree.ts          # 文件树数据加载 + 展开状态
│       ├── useEditorTabs.ts        # Tab 管理（打开/关闭/切换/未保存检测）
│       └── useInlineAI.ts          # AI 交互逻辑
│
├── git/                            # /git 页
│   ├── index.tsx                   # 页面入口
│   ├── GitPage.tsx                 # 布局：LeftPanel + DiffViewer
│   ├── git-page.module.css
│   ├── components/
│   │   ├── ChangesTab.tsx          # 变更 Tab（stage/unstage/commit）
│   │   ├── BranchesTab.tsx         # 分支 Tab（需求关联 + 文件列表）
│   │   ├── LogTab.tsx              # 日志 Tab（commit 列表 + 图谱）
│   │   ├── BranchGraph.tsx         # SVG 分支图谱
│   │   ├── DiffViewer.tsx          # Diff 查看器（并排/行内/文件）
│   │   ├── diff-viewer.module.css
│   │   ├── RequirementList.tsx     # 需求/任务关联列表
│   │   └── FileChangeList.tsx      # 变更文件列表
│   └── hooks/
│       ├── useGitStatus.ts         # 工作区状态
│       ├── useBranchFiles.ts       # 虚拟分支文件列表
│       ├── useDiff.ts              # Diff 数据加载
│       └── useGitLog.ts            # Commit 历史
```

## lib/api 扩展

在 `http.ts` 的 HttpAdapter 中新增方法：

```typescript
// 文件编辑器
getFileContent(projectId: number, path: string): Promise<{ content: string; language: string }>
saveFile(projectId: number, path: string, content: string): Promise<void>
searchFiles(projectId: number, query: string): Promise<FileItem[]>

// Git 虚拟浏览（新增）
gitShow(projectId: number, ref: string, path: string): Promise<{ content: string }>
gitBranchFiles(projectId: number, branch: string, base?: string): Promise<BranchFileChange[]>
gitBranchDiff(projectId: number, branch: string, file: string, base?: string): Promise<string>

// Git 操作（已有端点，补充前端方法）
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
```

## Zustand Store

```typescript
// lib/store/editor.ts
interface EditorStore {
  openTabs: EditorTab[]           // 打开的文件 Tab
  activeTabPath: string | null    // 当前活跃 Tab
  unsavedFiles: Set<string>       // 未保存的文件路径集合
  explorerWidth: number           // 资源管理器宽度

  openFile: (path: string) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  markUnsaved: (path: string) => void
  markSaved: (path: string) => void
}

// lib/store/git.ts
interface GitStore {
  activeTab: 'changes' | 'branches' | 'log'
  selectedTask: number | null      // 选中的需求/任务 ID
  virtualBranch: string | null     // 虚拟浏览的分支名
  diffMode: 'side' | 'inline' | 'file'
  selectedFile: string | null      // 选中查看 diff 的文件
}
```

## 线框图参考

设计线框图保存在：
- `.superpowers/brainstorm/3566292-1773672640/file-editor-final.html`
- `.superpowers/brainstorm/3566292-1773672640/git-page-design.html`

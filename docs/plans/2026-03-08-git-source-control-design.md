# Git Source Control 设计方案

## 概述

在现有 Files 页面基础上集成完整的 Git 客户端视图。通过顶部 Tab 切换"文件浏览"和"Source Control"，跟随侧边栏选中的项目。

## 页面布局

```
┌──────────────────────────────────────────────────────┐
│  [📁 Files]  [🔀 Source Control]    ← 顶部 Tab      │
├──────────────────────────────────────────────────────┤
│  Source Control Tab:                                 │
│  左面板 (320px)              │  右面板 (剩余空间)     │
│                              │                       │
│  [Tab: Changes | Log]        │  Diff 查看器           │
│                              │  [inline | side-by-side]│
│  Changes:                    │                       │
│  ── Staged (3) ──           │  增行绿色 / 删行红色    │
│    file1.ts  M  [-]         │  语法高亮 (highlight.js)│
│  ── Unstaged (2) ──         │  行号显示              │
│    file2.ts  M  [+]         │                       │
│  ── Untracked (1) ──        │                       │
│    file3.ts  U  [+]         │                       │
│                              │                       │
│  [message input]             │                       │
│  [Commit] [Push] [Pull]     │                       │
│                              │                       │
│  Log:                        │                       │
│  分支图谱 (SVG 彩色连线)      │  commit diff          │
│  ○─┐ feat/login              │                       │
│  │ ○ fix: typo               │                       │
│  ├─┘                         │                       │
│  ○ init                      │                       │
│                              │                       │
│  Branches / Stash 列表       │                       │
└──────────────────────────────────────────────────────┘
```

## 功能清单

### Changes Tab
- Staged / Unstaged / Untracked 三组折叠列表
- 每个文件：图标 + 文件名 + 状态 badge (M/A/D/U/R) + stage/unstage 按钮
- Stage All / Unstage All 批量操作
- Discard changes（带确认对话框）
- Commit 区：message textarea + Commit 按钮
- Push / Pull / Fetch 按钮组

### Log Tab
- 分支图谱：SVG 绘制 commit 节点 + 彩色分支连线
- 每个 commit：短 hash + message + author + 相对时间
- Branches 列表：当前分支标 `*`，可点击切换
- Stash 列表：apply / drop 操作

### Diff 查看器（右面板）
- Side-by-side 和 Inline 两种模式，右上角切换
- 语法高亮（highlight.js）
- 增行绿色背景、删行红色背景、行号
- Changes 点击文件 → working tree diff
- Log 点击 commit → commit diff

## 后端 API（routers/git.py）

```
GET    /api/projects/{id}/git/status        → staged/unstaged/untracked 分组
GET    /api/projects/{id}/git/diff           → ?file=path&staged=bool&commit=sha
POST   /api/projects/{id}/git/stage          → {files: [...]} 或 {all: true}
POST   /api/projects/{id}/git/unstage        → {files: [...]} 或 {all: true}
POST   /api/projects/{id}/git/discard        → {files: [...]}
POST   /api/projects/{id}/git/commit         → {message: "..."}
GET    /api/projects/{id}/git/log            → ?limit=100&branch=name
GET    /api/projects/{id}/git/branches       → 本地+远程分支列表
POST   /api/projects/{id}/git/checkout       → {branch: "name"} 或 {create: "name"}
POST   /api/projects/{id}/git/push
POST   /api/projects/{id}/git/pull
POST   /api/projects/{id}/git/fetch
GET    /api/projects/{id}/git/stash          → stash 列表
POST   /api/projects/{id}/git/stash/save     → {message?: "..."}
POST   /api/projects/{id}/git/stash/apply    → {index: 0}
POST   /api/projects/{id}/git/stash/drop     → {index: 0}
GET    /api/projects/{id}/git/commit/{sha}   → 单 commit 变更文件列表
```

## 技术选型

- Diff：后端 `git diff --unified=3` 返回 unified diff，前端解析渲染
- 图谱：后端 `git log --all --format` 返回 commit + parents，前端 SVG 绘制
- 语法高亮：复用 highlight.js
- 前端组件：Tailwind + 现有 ui 组件 + Radix ScrollArea

## 与现有功能关系

- Sidebar "Files" 导航不变
- 现有 ProjectFiles 作为第一个 Tab 完整保留
- 现有 `files.py` 路由保留，Git 操作独立到 `git.py`
- 现有 `api.projects.gitStatus` 保留用于文件浏览器的 Git 标识

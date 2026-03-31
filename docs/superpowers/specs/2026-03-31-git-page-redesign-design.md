# Git 页面重设计 — 设计规范

**日期**: 2026-03-31
**状态**: 已批准
**参考**: GitHub Desktop / Sourcetree / Tower 设计语言
**原型**: `.superpowers/brainstorm/224688-1774927903/content/layout-v12.html`

---

## 1. 背景与目标

当前 Git 页面（`tauri/src/features/git/GitPage.tsx`）采用左栏 + 右侧 diff 的两栏结构，左栏通过 Tab（变更/分支/日志）切换，体验割裂。

**目标**：重设计为三区域布局——提交历史常驻上方、变更文件列表和 diff 在下方并排——参照 GitHub Desktop 折叠交互风格，让历史和工作区状态同时可见。

---

## 2. 布局结构

```
┌─────────────────────────────────────────────────────────┐
│  LEFT NAV (190px, 全高)  │  提交历史 + Graph（剩余宽度）  │
│  · 分支树 (可折叠)        │  · scope filter 切换          │
│  · 远程 / 标签 / 储藏     │  · 彩色 SVG commit graph       │
│  · 子模块 / 子树          │  · 每行：graph + 消息 + meta   │
├──────────────────────────┼──────────────────────────────┤  ← 可拖动分隔线
│  变更文件列表 (240px)     │  Monaco Diff（剩余宽度）       │
│  · 变更 accordion header │  · 文件名芯片（点击展开文件）  │
│  · 已暂存 / 未暂存 / 未追踪 │ · 内联 / 并排切换           │
│  · 提交输入框              │  · Task 关联标签              │
│  · 分支状态底栏           │                              │
└─────────────────────────────────────────────────────────┘
```

### 比例参考
- 左导航列宽：`190px` 固定
- 上下分割比例：约 `280px / 剩余`（上方提交历史区）
- 变更列表宽：`240px` 固定
- Diff 区：`flex: 1`，自适应

---

## 3. 各区域详细设计

### 3.1 左侧导航（全高，贯穿上下）

**结构**
```
[仓库图标] task-conductor
─────────────────────
▼ 本地分支                 4
  ● feat/settings-redesign  [当前]
    ● feat/git-page          [#42]
    ● fix/modal-height       [#39]
    ● main
▼ 远程                     2
  ● origin/main
  ● origin/feat/settings
▶ 标签                     1
▼ 储藏                     1
  ● WIP: fix modal
▶ 子模块                   1
▶ 子树                     1
─────────────────────
⚙ 仓库配置
⎇ feat/settings-redesign  [↑3]
```

**分支树规则**
- 每个分组（本地分支/远程/标签/储藏/子模块/子树）均有 `▶/▼` 折叠按钮
- 本地分支按 `/` 分隔符自动归组为文件夹节点（`feat/`, `fix/` 等）
- 当前分支显示 `[当前]` 绿色徽章；关联任务分支显示 `[#42]` 橙色徽章
- 点击「仓库配置」切换为全屏配置面板（隐藏 diff，2 列卡片布局）
- 底部固定：当前分支名 + ahead 数量 + Push/Pull 按钮

**状态管理**：`useGitStore` — `navSections`（各分组折叠状态），`selectedBranch`

---

### 3.2 提交历史区（右上）

**工具栏**
- 标题"提交历史"
- Scope 切换：`全部` / `当前分支` / `其他分支`（类似 Tab，点击切换）
- 搜索框：过滤提交消息

**Commit 行**
```
[graph SVG 40px] [提交消息 flex:1] [作者] [时间] [task徽章]
                  [sha 7位] [作者名]
```

**Commit Graph（SVG）**
- 每行独立渲染一段 SVG（40×36px）
- 颜色系统：蓝 `#4e9eff`、青 `#4ec9b0`、紫 `#c586c0`、橙 `#f48771`、黄 `#dcdcaa`（按分支序号轮换）
- 节点：实心描边圆，merge commit 用双色描边
- 连接线：直线，merge 用对角线
- Merge commit 用粗描边区分

**点击 commit 行**：右下 diff 区切换为该 commit 的变更 diff（调用 `git show`），变更列表高亮对应文件

**状态管理**：`useGitStore` — `selectedCommit`，`historyScope`（'all'|'current'|'other'），`searchQuery`

---

### 3.3 变更文件列表（左下）

**顶部 Header（可折叠）**
- `▶/▼ 变更  [6]` — 点击折叠整个变更面板（折叠时仅显示 header，diff 区扩展至全高）

**三个子分区（各自可折叠）**
| 分区 | 颜色主题 | 批量操作按钮 |
|------|----------|------------|
| ✅ 已暂存 | 深绿底色 | 全部取消暂存 |
| ⚠ 未暂存 | 深红底色 | 全部暂存 |
| ? 未追踪 | 默认 | 全部暂存 |

**文件行**
```
[checkbox] [路径灰小字]        [状态方块 M/A/D/U]
           [文件名粗体]
```
- checkbox：✅ 已暂存用青色，未暂存用蓝色
- 状态方块在右侧（参照 GitHub Desktop 风格）
- 鼠标悬停显示操作按钮（暂存/取消暂存/丢弃）
- 点击行：右侧 diff 显示该文件 diff，行高亮

**提交区（底部固定）**
```
[头像] [摘要输入框（必填）]
       [描述输入框（可选）]
[⊕ Co-authors]  [提交到 feat/xxx 按钮]
```

**分支状态栏（最底部）**
```
[⎇ feat/settings-redesign  ↑3] | [Push] | [Pull]
```

**状态管理**：`useGitStore` — `stagedFiles`，`unstagedFiles`，`untrackedFiles`，`selectedFile`，`commitMessage`，`commitDescription`

---

### 3.4 Monaco Diff 区（右下）

**顶部工具栏**
```
[📄 settings.module.css  tauri/src/features/settings/  ↗] ... [Task #41] [内联] [并排]
```
- 文件名芯片：仅显示文件名（粗体）+ 目录路径（灰色小字）
- 点击文件名芯片：叠加文件查看器覆盖层（完整文件内容，无 diff 标注）
- Task 关联标签：点击跳转到任务页
- 内联/并排切换：映射到 `diffMode: 'inline' | 'side'`

**Diff 内容**（Monaco Editor，`@monaco-editor/react`）
- 模式：inline diff（DiffEditor 的 renderSideBySide=false）
- 主题：`vs-dark`（VS Code Dark+ 语法色）
- 行高亮色：
  - 新增行：`rgba(78,201,176,.07)` + 左侧 3px 青色竖条
  - 删除行：`rgba(244,135,113,.07)` + 左侧 3px 红色竖条
  - Hunk 分隔：`rgba(255,255,255,.015)` 深色背景
- 行内高亮：新增词 `rgba(78,201,176,.22)`，删除词 `rgba(244,135,113,.22)`

**文件查看器覆盖层**
- 绝对定位覆盖 diff 区（`position: absolute; inset: 0`）
- 顶部显示完整路径 + 关闭按钮
- 完整文件内容（只读，带行号，语法高亮）
- 点击 ✕ 或按 Escape 关闭

**状态管理**：`useGitStore` — `selectedFile`，`diffMode`，`fileViewerOpen`

---

## 4. 数据流与 API 调用

```
useGitStore
  ├── selectedRepo (来自 URL param ?task=)
  ├── selectedCommit → git show {sha}
  ├── workingDiff   → git diff HEAD (未暂存)
  ├── stagedDiff    → git diff --cached (已暂存)
  ├── historyLog    → git log --graph (上方历史)
  ├── branches      → git branch -a
  └── stashes       → git stash list

Tauri Commands（新增）
  git_log(repo, scope, limit) → CommitEntry[]
  git_diff_file(repo, sha, path) → string
  git_stage(repo, paths[])
  git_unstage(repo, paths[])
  git_discard(repo, paths[])
  git_commit(repo, message, description)
  git_push(repo)
  git_pull(repo)
  git_stash_list(repo) → StashEntry[]
  git_stash_pop(repo, index)
```

---

## 5. 组件拆分

```
tauri/src/features/git/
├── GitPage.tsx                 ← 布局容器（3区域）
├── git-page.module.css
├── components/
│   ├── GitNavCol.tsx           ← 左侧导航（分支树 + 底部）
│   ├── GitNavCol.module.css
│   ├── CommitHistory.tsx       ← 上方提交历史 + graph
│   ├── CommitHistory.module.css
│   ├── CommitGraph.tsx         ← SVG graph 渲染（纯计算）
│   ├── ChangesPanel.tsx        ← 变更文件列表 + 提交框
│   ├── ChangesPanel.module.css
│   ├── DiffViewer.tsx          ← Monaco diff + 文件查看器
│   └── DiffViewer.module.css
└── lib/
    ├── git-store.ts            ← useGitStore (Zustand)
    ├── git-api.ts              ← Tauri command 封装
    └── graph-layout.ts         ← commit graph 布局算法
```

---

## 6. 主题适配

所有颜色通过 CSS 变量定义，遵循项目现有 `--tc-` 前缀规范：

```css
/* 在 settings.module.css 中已有的变量基础上扩展 */
--git-branch-cur:    var(--tc-accent-teal);
--git-branch-loc:    var(--tc-text-muted);
--git-branch-rem:    var(--tc-accent-cyan);
--git-diff-add-bg:   rgba(78, 201, 176, 0.07);
--git-diff-del-bg:   rgba(244, 135, 113, 0.07);
--git-diff-add-bar:  var(--tc-accent-teal);
--git-diff-del-bar:  var(--tc-accent-red);
```

亮色/深色主题通过 `data-theme` 属性切换，与设置页面主题系统统一。

---

## 7. 不在本次范围内

- Git 冲突解决界面
- Blame 视图
- Cherry-pick / rebase 操作
- 子模块的深层操作
- SSH key 管理（归属「仓库配置」页，独立功能）

# CLAUDE.md

TaskConductor Tauri 桌面客户端 — 项目指导文档。

## 项目概述

TaskConductor 的桌面端，基于 Tauri 2 + React 19 + TypeScript 构建。采用自建 UI 组件库（CSS Modules + CSS Variables），不使用 Tailwind。

两个页面上下文：
- **项目工作台**（主页）：聚焦当前项目，侧边栏展示项目内容列表
- **管理后台**（独立页面）：仪表盘、会话监控、Claude 配置、设置等

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 5.8 |
| 桌面 | Tauri 2（Rust） |
| 构建 | Vite 7 |
| 路由 | React Router 6（桌面 HashRouter / Web BrowserRouter） |
| 状态 | Zustand 5（auth / app / tasks / sessions） |
| 数据 | TanStack Query 5（HTTP 缓存） |
| 国际化 | i18next（中文默认） |
| 样式 | CSS Modules + CSS Variables（无 Tailwind） |
| 字体 | Geist Variable |

## 开发命令

```bash
# 前端开发（Web 模式）
cd tauri && pnpm dev          # http://localhost:7071

# Tauri 桌面模式
cd tauri && pnpm tauri dev

# TypeScript 检查
cd tauri && npx tsc --noEmit

# 后端 API（需同时运行）
cd backend && uvicorn app.main:app --port 8765 --reload
```

## 目录结构

```
tauri/
├── src/
│   ├── main.tsx                    # 入口：挂载 Providers → Router
│   │
│   ├── app/                        # 应用层
│   │   ├── Providers.tsx           # QueryClient + ThemeProvider + Auth 同步
│   │   ├── Router.tsx              # 路由定义（lazy loading）
│   │   ├── Layout.tsx              # 主布局：组合 AppShell + TopBar + Sidebar + Panel
│   │   └── PageLoading.tsx         # 加载占位
│   │
│   ├── ui/                         # 自建 UI 组件库
│   │   ├── theme/
│   │   │   ├── tokens.ts           # Design Token 定义 + 语义映射（SEMANTIC_MAP）
│   │   │   ├── themes/
│   │   │   │   ├── dark-plus.json  # VS Code Dark+ 配色
│   │   │   │   └── light-plus.json # VS Code Light+ 配色
│   │   │   ├── ThemeProvider.tsx    # Context + CSS Variables 注入 + localStorage
│   │   │   └── useTheme.ts         # useTheme() hook
│   │   ├── button/
│   │   │   ├── Button.tsx          # variant: default/ghost/outline, size: sm/md/lg/icon
│   │   │   └── button.module.css
│   │   ├── icon/
│   │   │   ├── Icon.tsx            # 基础 SVG 包装（size/color props）
│   │   │   └── icons/              # 15 个图标组件（chevron-left, search, bell 等）
│   │   └── index.ts                # 统一导出
│   │
│   ├── layouts/                    # 骨架布局组件
│   │   ├── AppShell/
│   │   │   ├── AppShell.tsx        # CSS Grid 容器 + ShellContext Provider
│   │   │   ├── ShellContext.ts     # sidebar/panel 状态 Context
│   │   │   └── app-shell.module.css
│   │   ├── TopBar/
│   │   │   ├── TopBar.tsx          # 三区布局：Logo | 面包屑 | 工具栏+用户
│   │   │   └── top-bar.module.css
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx         # 可折叠（240px → 48px 图标模式）
│   │   │   └── sidebar.module.css
│   │   ├── Panel/
│   │   │   ├── Panel.tsx           # 可折叠底部面板，拖拽调高度
│   │   │   └── panel.module.css
│   │   └── index.ts
│   │
│   ├── features/                   # 业务页面
│   │   ├── auth/                   # PIN 登录页
│   │   └── dashboard/              # 仪表盘（P2 占位）
│   │
│   ├── lib/                        # 工具层
│   │   ├── api/                    # ApiAdapter 接口 + HttpAdapter（Bearer 鉴权）
│   │   ├── store/                  # Zustand stores（auth/app/tasks/sessions）
│   │   ├── ws/                     # WebSocket（browser Web Worker / tauri Event）
│   │   ├── window-bus/             # 跨窗口事件（BroadcastChannel / Tauri Event）
│   │   └── tauri.ts                # isTauri() 检测
│   │
│   ├── i18n/                       # 国际化
│   │   ├── zh.json                 # 中文（默认）
│   │   └── en.json                 # 英文
│   │
│   └── styles/
│       ├── reset.css               # CSS Reset
│       └── global.css              # 全局样式（字体、滚动条、focus-visible）
│
├── src-tauri/                      # Rust 后端
│   ├── src/lib.rs                  # Tauri 命令（目前仅 greet 占位）
│   └── tauri.conf.json             # 窗口 800×600, devUrl localhost:1420
│
├── ws-core/                        # Rust WASM WebSocket 库
│   └── src/                        # 双传输：browser(web-sys) + native(tokio)
│
├── vite.config.ts                  # port 7071, API proxy → 8765, WASM 插件
├── tsconfig.json                   # strict, @ → src/, resolveJsonModule
└── package.json
```

## 架构要点

### 主题系统（两层 Token）

```
基础层（JSON 定义）           →  语义层（组件消费）
base.bg-primary: "#1e1e1e"   →  --tc-sidebar-bg
base.accent: "#007acc"       →  --tc-focus-ring, --tc-border-active
```

- `tokens.ts` 中的 `SEMANTIC_MAP` 定义映射关系
- `resolveTheme()` 将 JSON → CSS Variables
- `ThemeProvider` 注入 `document.documentElement.style`
- 新增主题：添加 JSON 文件 + `registerTheme()` 注册

### 布局系统（CSS Grid + Context）

```
┌────────────────────────────────────────────────┐
│ TopBar（48px）                                  │
│ Logo区（对齐Sidebar宽度）│ 面包屑  │ 工具栏+用户│
├──────────────┬─────────────────────────────────┤
│ Sidebar      │          Content                │
│ 240px/48px   │         (Outlet)                │
│              ├─────────────────────────────────┤
│              │    Panel（可折叠，默认收起）      │
└──────────────┴─────────────────────────────────┘
```

- `AppShell` 提供 `ShellContext`（sidebar/panel 状态）
- `useShell()` hook 在子组件中获取/操作布局状态
- Sidebar 折叠时 Grid 列宽从 240px → 48px，文字隐藏只显示图标
- TopBar 左区宽度同步跟随 Sidebar，右边界有竖分割线

### 路由

```
/login              → AuthPage
/                   → Layout > DashboardPage
/tasks/:id          → Layout > PlaceholderPage（项目内容）
/admin              → Layout > PlaceholderPage（管理后台入口）
/sessions, /chat... → Layout > PlaceholderPage
```

### API 代理（开发模式）

Vite dev server 代理到后端：
- `/api/*`, `/auth/*`, `/health` → `http://localhost:8765`
- `/ws/*` → `ws://localhost:8765`

## 关键约定

- **样式**：CSS Modules（`.module.css`），CSS Variables 以 `--tc-` 前缀
- **图标**：`ui/icon/icons/` 下每个图标一个 TSX 文件，使用 `Icon` 基础组件包装
- **导出**：每个模块目录有 `index.ts` barrel export
- **国际化**：默认中文，`t('key')` 调用，key 在 `zh.json` / `en.json` 同步维护
- **状态**：Zustand store 按领域拆分，持久化到 localStorage
- **新增主题**：在 `ui/theme/themes/` 下新增 JSON，在 ThemeProvider 中注册
- **新增图标**：在 `ui/icon/icons/` 下创建组件，在 `ui/icon/index.ts` 中导出
- **新增页面**：在 `features/` 下创建模块，在 `Router.tsx` 中添加路由

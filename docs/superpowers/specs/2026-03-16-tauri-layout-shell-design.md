# Tauri Layout Shell 设计规格

> 日期: 2026-03-16
> 范围: tauri/src 下的骨架布局组件、自建 UI 组件库、主题系统

## 1. 概述

为 TaskConductor Tauri 桌面端实现 VS Code 风格的布局骨架，包含：
- 自建 UI 组件库（CSS Modules + CSS Variables，无 Tailwind）
- 可扩展主题引擎（内置 Dark+/Light+，支持 JSON 自定义主题）
- 骨架布局组件（TopBar + Sidebar + Content + 可折叠 Panel）

## 2. 应用页面上下文

应用分为两个独立页面上下文：

- **项目工作台**（主页面）：聚焦当前项目，Sidebar 展示项目相关导航
- **管理后台**（独立页面）：仪表盘、Sessions 监控、Claude 配置、设置等通用功能

两者通过 Sidebar 底部按钮互相跳转。

### 路由架构

两个页面上下文共享同一个 `AppShell`，通过不同的路由前缀区分：

- `/workspace/*` — 项目工作台，`Sidebar` 渲染项目导航项
- `/admin/*` — 管理后台，`Sidebar` 渲染管理导航项（仪表盘、Sessions、设置等）

`AppShell` 根据当前路由前缀决定传给 `Sidebar` 的 `items` 和 `header`。两个上下文使用同一个 `AppShell` 实例，不需要两套布局组件。

## 3. 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar（46px）                                               │
│ ┌──────────┬─────────────────────────┬─────────────────────┐ │
│ │ Logo  ‹  │  面包屑 / 页面标题       │  🔍 ⚙ 💬 🔔  👤   │ │
│ └──────────┴─────────────────────────┴─────────────────────┘ │
├────────────┬────────────────────────────────────────────────┤
│ Sidebar    │                                                │
│ (240px)    │           Content Area                         │
│            │          （Outlet 渲染）                        │
│ ┌────────┐ │                                                │
│ │ 分组标题 │ │                                                │
│ │ + 按钮  │ │                                                │
│ ├────────┤ │                                                │
│ │ 导航项1  │ │                                                │
│ │ 导航项2  │ │                                                │
│ │ 导航项3  │ │                                                │
│ │ ...    │ ├────────────────────────────────────────────────┤
│ │        │ │ Panel（可折叠，默认收起）                        │
│ ├────────┤ │   日志流 / 终端输出                              │
│ │[管理后台]│ │                                                │
│ └────────┘ │                                                │
└────────────┴────────────────────────────────────────────────┘
```

## 4. 主题系统

### 4.1 Design Token 分层

两层 token 架构：

**基础层**（主题 JSON 定义的原始颜色值）：
```
base.bg-primary, base.bg-secondary, base.bg-hover,
base.fg-primary, base.fg-secondary,
base.accent, base.accent-bg, base.accent-fg,
base.border, base.border-active,
base.error, base.warning, base.success, base.info
```

**语义层**（组件直接消费的 CSS Variables）：
```
--tc-topbar-bg         → base.bg-secondary
--tc-topbar-fg         → base.fg-primary
--tc-topbar-border     → base.border
--tc-sidebar-bg        → base.bg-primary
--tc-sidebar-fg        → base.fg-primary
--tc-sidebar-item-hover → base.bg-hover
--tc-sidebar-item-active-bg → base.accent-bg
--tc-sidebar-item-active-fg → base.accent-fg
--tc-content-bg        → base.bg-primary
--tc-panel-bg          → base.bg-secondary
--tc-panel-border      → base.border
--tc-border            → base.border
--tc-focus-ring        → base.accent
```

### 4.2 主题 JSON 格式

```json
{
  "name": "Dark+",
  "type": "dark",
  "colors": {
    "base.bg-primary": "#1e1e1e",
    "base.bg-secondary": "#252526",
    "base.bg-hover": "#2a2d2e",
    "base.fg-primary": "#cccccc",
    "base.fg-secondary": "#969696",
    "base.accent": "#007acc",
    "base.accent-bg": "#094771",
    "base.accent-fg": "#ffffff",
    "base.border": "#3c3c3c",
    "base.border-active": "#007acc",
    "base.error": "#f44747",
    "base.warning": "#cca700",
    "base.success": "#89d185",
    "base.info": "#75beff"
  }
}
```

### 4.3 ThemeProvider

```typescript
interface ThemeContextValue {
  theme: string              // 当前主题名称
  themeType: 'dark' | 'light'
  setTheme: (name: string) => void
  themes: string[]           // 已注册主题名称列表
  registerTheme: (json: ThemeJSON) => void
}
```

工作流程：
1. 读取主题 JSON
2. 基础层 token → 语义层 token 映射（通过 tokens.ts 中的映射表）
3. 注入 `document.documentElement.style` 为 CSS Variables
4. 设置 `data-theme="dark"` 属性
5. 持久化到 localStorage（key: `tc-theme`）

错误处理：
- `setTheme()` 传入未注册的主题名称时，忽略操作并 `console.warn`
- 主题 JSON 缺少必要 color key 时，缺失项回退到 Dark+ 对应值

### 4.4 内置主题

初始提供 2 套：
- **Dark+**：VS Code 默认深色主题配色
- **Light+**：VS Code 默认浅色主题配色

后续添加主题只需新增一个 JSON 文件 + 在 ThemeProvider 中注册。

## 5. 骨架组件设计

### 5.1 AppShell

顶层布局容器，使用 CSS Grid：

```css
.shell {
  display: grid;
  grid-template-rows: var(--tc-topbar-height, 46px) 1fr;
  grid-template-columns: var(--tc-sidebar-width, 240px) 1fr;
  grid-template-areas:
    "topbar  topbar"
    "sidebar main";
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* Sidebar 折叠时：完全隐藏（0px），展开按钮位于 TopBar 左区 */
.shell[data-sidebar-collapsed="true"] {
  grid-template-columns: 0 1fr;
}
```

Props：
```typescript
interface AppShellProps {
  children: ReactNode
}
```

AppShell 内部通过 Context 管理：
- `sidebarCollapsed: boolean`
- `panelOpen: boolean`
- `panelHeight: number`

**Panel 位置**：Panel 是 Content Area（`main` grid 区域）的子元素，不是独立的 grid 行。Content Area 内部使用 flexbox 纵向布局：`<Outlet>` 占据 `flex: 1`，Panel 在底部按 `panelHeight` 固定高度渲染。Sidebar 折叠/展开不影响 Panel。

### 5.2 TopBar

固定高度 46px，三区布局（flexbox）：

**左区**：
- Logo（项目标识）
- Sidebar 折叠/展开按钮（`‹` / `›`）

**中区**：
- 面包屑导航（`项目名 / 当前页面`）

**右区**：
- 工具图标组：搜索、设置、消息、通知
- 用户头像

Props：
```typescript
interface TopBarProps {
  logo?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  actions?: ReactNode
}

interface BreadcrumbItem {
  label: string
  href?: string
  icon?: ReactNode
}
```

### 5.3 Sidebar

宽度 240px，可折叠到 0px（完全隐藏，不保留图标轨道），带过渡动画（200ms ease）。折叠/展开按钮始终在 TopBar 左区，不随 Sidebar 隐藏。

三区纵向布局：

**头部**：分组标题 + 操作按钮（如 "Pages" + "+"）

**列表区**（flex: 1，可滚动）：导航项列表

**底部**：跳转管理后台按钮

Props：
```typescript
interface SidebarProps {
  header?: ReactNode
  items: SidebarItem[]
  footer?: ReactNode
  activeKey?: string
  onSelect?: (key: string) => void
}

interface SidebarItem {
  key: string
  label: string
  icon?: ReactNode
}
```

导航项状态样式：
- 默认：透明背景
- Hover：`--tc-sidebar-item-hover`
- Active：`--tc-sidebar-item-active-bg` + `--tc-sidebar-item-active-fg`

### 5.4 Panel

可折叠底部面板，默认收起。

特性：
- 展开时从底部向上推出
- 顶部拖拽条可调整高度（min 150px，max 400px）
- 关闭按钮收起面板
- 收起时完全隐藏（height: 0）

Props：
```typescript
interface PanelProps {
  children: ReactNode
  minHeight?: number    // 默认 150（px）
  maxHeight?: number    // 默认 400（px），所有高度值均为像素
}
```

## 6. 图标系统

### 6.1 方案

SVG 组件化，每个图标一个 TSX 文件，导出为 React 组件。

### 6.2 Icon 基础组件

```typescript
interface IconProps extends React.SVGAttributes<SVGElement> {
  size?: number        // 默认 16
  color?: string       // 默认 currentColor
}
```

### 6.3 初始图标清单

骨架组件所需（约 12 个）：

| 图标 | 用途 |
|------|------|
| chevron-left | Sidebar 折叠按钮 |
| chevron-right | Sidebar 展开按钮 |
| search | TopBar 搜索 |
| bell | TopBar 通知 |
| settings | TopBar 设置 |
| message | TopBar 消息 |
| plus | Sidebar 新建按钮 |
| file-text | Sidebar 导航项 |
| layout-grid | 管理后台按钮图标 |
| x | Panel 关闭按钮 |
| grip-horizontal | Panel 拖拽条 |
| user | TopBar 用户头像占位 |

## 7. 目录结构

```
src/
├── ui/                              # 自建 UI 组件库
│   ├── theme/
│   │   ├── tokens.ts                # token 定义 & 语义映射表
│   │   ├── themes/
│   │   │   ├── dark-plus.json       # Dark+ 主题
│   │   │   └── light-plus.json      # Light+ 主题
│   │   ├── ThemeProvider.tsx         # Context + CSS Variables 注入
│   │   ├── useTheme.ts              # useTheme() hook
│   │   ├── theme.module.css
│   │   └── index.ts
│   ├── button/                      # 基础按钮（此次仅迁移骨架，详细变体后续迭代）
│   │   ├── Button.tsx
│   │   ├── button.module.css
│   │   └── index.ts
│   ├── icon/
│   │   ├── Icon.tsx                 # 基础 Icon 包装
│   │   ├── icons/                   # 各 SVG 图标组件
│   │   │   ├── chevron-left.tsx
│   │   │   ├── chevron-right.tsx
│   │   │   ├── search.tsx
│   │   │   ├── bell.tsx
│   │   │   ├── settings.tsx
│   │   │   ├── message.tsx
│   │   │   ├── plus.tsx
│   │   │   ├── file-text.tsx
│   │   │   ├── layout-grid.tsx
│   │   │   ├── x.tsx
│   │   │   ├── grip-horizontal.tsx
│   │   │   └── user.tsx
│   │   └── index.ts
│   └── index.ts                     # 统一导出
│
├── layouts/                         # 骨架布局组件
│   ├── AppShell/
│   │   ├── AppShell.tsx
│   │   ├── ShellContext.ts          # Sidebar/Panel 状态 Context
│   │   ├── app-shell.module.css
│   │   └── index.ts
│   ├── TopBar/
│   │   ├── TopBar.tsx
│   │   ├── top-bar.module.css
│   │   └── index.ts
│   ├── Sidebar/
│   │   ├── Sidebar.tsx
│   │   ├── sidebar.module.css
│   │   └── index.ts
│   ├── Panel/
│   │   ├── Panel.tsx
│   │   ├── panel.module.css
│   │   └── index.ts
│   └── index.ts
│
├── features/                        # 业务页面（保留）
├── lib/                             # store/api/ws（保留）
├── app/                             # Router/Providers（保留）
├── i18n/                            # 国际化（保留）
├── styles/
│   ├── reset.css                    # CSS Reset（box-sizing、margin/padding 归零、列表/表单重置）
│   └── global.css                   # 全局样式（@font-face Geist、滚动条美化、body 默认背景/前景）
└── main.tsx
```

## 8. 迁移清单（去除 Tailwind）

### 移除的依赖
- `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`
- `shadcn`, `class-variance-authority`, `clsx`, `tailwind-merge`
- `@base-ui/react`, `lucide-react`

### 保留的依赖
- `react`, `react-dom`, `react-router-dom`
- `@tanstack/react-query`, `zustand`
- `i18next`, `react-i18next`
- `@tauri-apps/api`, `@tauri-apps/plugin-opener`
- `@fontsource-variable/geist`

### 需重写/删除的文件
| 文件 | 处理 |
|------|------|
| `index.css` | 重写为 reset.css + global.css，去掉 Tailwind 指令 |
| `App.tsx` | 删除（Tauri 脚手架残留，已被 Router 取代） |
| `App.css` | 删除（Tauri 脚手架残留，样式迁入 reset.css/global.css） |
| `app/Layout.tsx` | 替换为 AppShell 组件 |
| `components/ui/button.tsx` | 迁移到 `ui/button/`，用 CSS Modules 重写 |
| `features/dashboard/index.tsx` | 去掉 Tailwind class |
| `features/auth/index.tsx` | 去掉 Tailwind class |
| `app/PageLoading.tsx` | 去掉 Tailwind class |
| `vite.config.ts` | 移除 `@tailwindcss/vite` 插件 |
| `lib/utils.ts` | 移除 `cn()` 辅助函数（不再需要 clsx/tailwind-merge）|

## 9. 不在此次范围内

- 业务页面实现（Dashboard、TaskManager、Sessions 等）
- Rust Tauri Commands
- WebSocket 接入
- 管理后台页面布局
- 响应式断点适配（桌面端固定尺寸优先）

# TaskConductor Tauri 桌面客户端 — 技术文档

## 文档索引

### 架构文档（`architecture/`）

| 文件 | 内容 |
|------|------|
| [overview.md](architecture/overview.md) | 项目概述、技术栈、目录结构 |
| [theme-system.md](architecture/theme-system.md) | 主题系统（两层 Token、JSON 配色、ThemeProvider） |
| [layout-system.md](architecture/layout-system.md) | 布局系统（CSS Grid、AppShell、ShellContext） |
| [state-management.md](architecture/state-management.md) | 状态管理（Zustand stores、跨窗口同步） |
| [platform-abstraction.md](architecture/platform-abstraction.md) | 平台抽象层（API、WebSocket、WindowBus、路由） |

### 组件文档（`components/`）

| 文件 | 内容 |
|------|------|
| [topbar.md](components/topbar.md) | TopBar 组件 API、样式、用法 |
| [sidebar.md](components/sidebar.md) | Sidebar 组件 API、折叠行为、样式 |
| [panel.md](components/panel.md) | Panel 组件 API、拖拽调整、样式 |
| [button.md](components/button.md) | Button 组件 API、变体、尺寸 |
| [icon.md](components/icon.md) | 图标系统、Icon 基础组件、图标清单 |

### 开发指南（`guides/`）

| 文件 | 内容 |
|------|------|
| [getting-started.md](guides/getting-started.md) | 环境搭建、启动命令、开发流程 |
| [adding-theme.md](guides/adding-theme.md) | 如何新增自定义主题 |
| [adding-icon.md](guides/adding-icon.md) | 如何新增图标 |
| [adding-page.md](guides/adding-page.md) | 如何新增业务页面 |

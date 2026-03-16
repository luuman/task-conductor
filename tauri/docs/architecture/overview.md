# 项目概述

## 定位

TaskConductor 的桌面客户端，基于 Tauri 2 + React 19 构建。采用自建 UI 组件库（CSS Modules + CSS Variables），不使用 Tailwind。

### 两个页面上下文

- **项目工作台**（主页）：聚焦当前选中的项目，侧边栏展示项目的内容列表（任务/文档），点击切换主内容区
- **管理后台**（独立页面）：仪表盘、会话监控、Claude 配置、全局设置等通用功能

两者通过侧边栏底部的「管理后台」按钮互相跳转。

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| UI 框架 | React | 19.1 |
| 语言 | TypeScript | 5.8 |
| 桌面框架 | Tauri | 2.x |
| 构建工具 | Vite | 7.0 |
| 路由 | React Router | 6.30 |
| 状态管理 | Zustand | 5.0 |
| 数据请求 | TanStack Query | 5.90 |
| 国际化 | i18next | 25.8 |
| 样式方案 | CSS Modules + CSS Variables | — |
| 字体 | Geist Variable | — |

## 目录结构

```
tauri/
├── src/
│   ├── main.tsx                    # 入口：Providers → Router
│   │
│   ├── app/                        # 应用层（路由、布局、Provider）
│   │   ├── Providers.tsx           # QueryClient + ThemeProvider + Auth 同步
│   │   ├── Router.tsx              # 路由定义（lazy loading）
│   │   ├── Layout.tsx              # 主布局：AppShell + TopBar + Sidebar + Panel
│   │   └── PageLoading.tsx         # Suspense 加载占位
│   │
│   ├── ui/                         # 自建 UI 组件库
│   │   ├── theme/                  # 主题系统
│   │   ├── button/                 # 按钮组件
│   │   ├── icon/                   # 图标系统（16 个 SVG 图标）
│   │   └── index.ts               # 统一导出
│   │
│   ├── layouts/                    # 骨架布局组件
│   │   ├── AppShell/               # CSS Grid 容器 + ShellContext
│   │   ├── TopBar/                 # 顶栏（Logo | 面包屑 | 工具栏）
│   │   ├── Sidebar/                # 侧边栏（可折叠 240px → 48px）
│   │   ├── Panel/                  # 底部面板（可折叠、拖拽调高度）
│   │   └── index.ts
│   │
│   ├── features/                   # 业务页面
│   │   ├── auth/                   # PIN 登录页
│   │   └── dashboard/              # 仪表盘（P2 占位）
│   │
│   ├── lib/                        # 工具层
│   │   ├── api/                    # API 适配器（HttpAdapter + 类型定义）
│   │   ├── store/                  # Zustand stores（auth/app/tasks/sessions）
│   │   ├── ws/                     # WebSocket（Browser Worker / Tauri Event）
│   │   ├── window-bus/             # 跨窗口通信（BroadcastChannel / Tauri Event）
│   │   └── tauri.ts                # isTauri() 平台检测
│   │
│   ├── i18n/                       # 国际化（zh.json 默认，en.json）
│   └── styles/                     # 全局样式（reset.css, global.css）
│
├── src-tauri/                      # Rust 后端（Tauri 命令，目前仅 greet 占位）
├── ws-core/                        # Rust WASM WebSocket 库（双传输）
├── vite.config.ts                  # Vite 配置（port 7071, API proxy → 8765）
├── tsconfig.json                   # TS 配置（strict, @ → src/）
└── package.json                    # 依赖管理
```

## 数据流

```
main.tsx
  └→ Providers
       ├→ QueryClientProvider（HTTP 缓存）
       └→ ThemeProvider（CSS Variables 注入）
            └→ AppRouter
                 ├→ /login → AuthPage
                 └→ / → Layout
                      ├→ AppShell（ShellContext Provider）
                      │    ├→ TopBar（useShell 获取折叠状态）
                      │    ├→ Sidebar（useShell 获取折叠状态）
                      │    └→ Content + Panel
                      └→ Outlet → 业务页面
```

## 当前完成度

- ✅ 自建 UI 组件库（theme / button / icon）
- ✅ 骨架布局组件（AppShell / TopBar / Sidebar / Panel）
- ✅ 主题引擎（Dark+ / Light+，可扩展）
- ✅ 国际化（中文默认）
- ✅ 路由 + 懒加载
- ✅ 状态管理（Zustand 4 个 store）
- ✅ 平台抽象层（API / WS / WindowBus）
- ⏳ 业务页面（全部占位）
- ⏳ Tauri Rust 命令（仅 greet 占位）
- ⏳ 后端 API 对接
- ⏳ 管理后台页面

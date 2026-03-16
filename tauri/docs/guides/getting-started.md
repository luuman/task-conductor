# 快速开始

## 环境要求

- Node.js 18+
- pnpm
- Rust（仅 Tauri 桌面模式需要）

## 安装依赖

```bash
cd tauri
pnpm install
```

## 启动开发

### Web 模式（推荐开发用）

```bash
cd tauri
pnpm dev
# → http://localhost:7071
```

需要同时启动后端：

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --port 8765 --reload
```

Vite dev server 自动代理 `/api/*`, `/auth/*`, `/ws/*` 到 `localhost:8765`。

### Tauri 桌面模式

```bash
cd tauri
pnpm tauri dev
```

## 类型检查

```bash
cd tauri
npx tsc --noEmit
```

## 项目结构速览

```
src/
├── app/        # 路由、布局、Provider
├── ui/         # UI 组件库（theme / button / icon）
├── layouts/    # 骨架布局（AppShell / TopBar / Sidebar / Panel）
├── features/   # 业务页面
├── lib/        # 工具层（api / store / ws / window-bus）
├── i18n/       # 国际化
└── styles/     # 全局样式
```

## 关键约定

- 样式用 CSS Modules（`.module.css`），CSS Variables 以 `--tc-` 前缀
- 每个模块目录有 `index.ts` barrel export
- 国际化默认中文，key 在 `zh.json` / `en.json` 同步维护
- `@` 路径别名指向 `src/`

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**TaskConductor** —— AI 驱动的任务流水线编排系统。

将 Claude Code 与 Web 仪表盘集成，提供两层核心能力：
1. **Claude 观测层**：通过 Claude Code Hooks 实时监听任何会话的工具调用，持久化到 DB，推送到前端
2. **任务流水线**：将软件开发任务拆分为 9 个阶段（需求→部署），每个阶段调用 Claude Code 自动执行，需审批时暂停等待人工决策

技术栈：FastAPI + SQLite（后端）、React + Vite + TypeScript + Tailwind（前端）

## 开发命令

```bash
# 一键启动前后端
bash start.sh
# 前端: http://localhost:7070
# 后端: http://localhost:8765
# API 文档: http://localhost:8765/docs

# 后端单独启动
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload

# 前端单独启动
cd frontend && npm run dev

# 安装 Claude Code Hooks（每台机器执行一次）
bash scripts/install-hooks.sh [agent-url]  # 默认 http://localhost:8765

# 前端类型检查
cd frontend && npx tsc --noEmit

# 后端测试
cd backend && pytest
```

## 架构

### 后端（`backend/app/`）

```
main.py              # FastAPI 应用、生命周期（PIN生成/Tunnel启动）、路由注册
                     # 核心 endpoint: POST /hooks/claude（Hook接收）
                     # WebSocket: /ws/task/{id}, /ws/sessions, /ws/session/{id}
models.py            # SQLAlchemy ORM（Mapped style）
                     #   Project, Task, StageArtifact, ClaudeInstance, Notification
                     #   ClaudeSession, ClaudeEvent（Hook观测层）
database.py          # SQLite，文件: backend/task_conductor.db
hooks.py             # parse_hook_event()、serialize_json_field()
session.py           # PIN 生成与 token 验证（内存存储）
tunnel.py            # Cloudflare Tunnel 集成（TC_TUNNEL=1 时启动）
tmux_manager.py      # tmux 会话管理

routers/
  projects.py        # GET/POST /api/projects
  tasks.py           # GET/POST /api/tasks, approve, advance
  pipeline.py        # POST /api/pipeline/{id}/run-analysis（唯一已实现阶段）
  sessions.py        # GET /api/sessions, /api/sessions/{id}/events
  metrics.py         # GET /api/metrics（KPI + Claude 性能 + 周报）

claude/
  pool.py            # ClaudePool 单例：asyncio 子进程运行 claude -p，stream-json 流式输出
  stream.py          # JSON 行解析
  metrics_store.py   # MetricsStore 单例：内存 deque，记录每次 Claude 调用的 TTFT/时长/成功率

pipeline/
  engine.py          # PipelineEngine：STAGE_ORDER 状态机，requires_approval/can_proceed
  stages/analysis.py # 分析阶段 prompt 构建 + 结构化解析（3 方案 A/B/C）

ws/manager.py        # ConnectionManager：channel → [WebSocket] 的 pub/sub 广播

notify/
  dispatcher.py      # notify_human_required()：调用 TTS + webhook 通知
  tts.py             # 写入 speak-pipe
  webhook.py         # POST 到外部 webhook URL
```

### 前端（`frontend/src/`）

```
App.tsx              # 根组件：状态提升（projects/connectionStatus）、页面路由、健康检查
                     # 页面类型: "dashboard" | "project" | "task" | "sessions" | "settings"

pages/
  Login.tsx          # PIN 输入 → POST /auth/pin → 保存 token 到 localStorage
  Dashboard.tsx      # 概览（KPI卡片 + Gauge + 周报 + 项目列表）/ 项目任务列表
  TaskPipeline.tsx   # 任务详情（artifacts/日志/审批）+ 流程图切换（detail/flow视图）

components/
  AppShell.tsx       # 三栏布局容器：Sidebar + Main + 新建项目 Modal
  Sidebar.tsx        # 左侧导航（仪表盘/会话/设置）+ 项目列表
  TaskWorkflow.tsx   # @xyflow/react 流程图，两行蛇形布局（input→plan / dev→done）
  ClaudeMonitorPanel.tsx  # 右侧滑出面板：实时工具调用日志（连接 /ws/sessions）
  LogStream.tsx      # 日志滚动显示组件
  StageProgress.tsx  # 阶段进度条
  OptionCards.tsx    # 分析方案卡片（A/B/C 选择）

hooks/
  useClaudeMonitor.ts  # 连接 /ws/sessions，监听 session_update 事件，适配为 ClaudeHookEvent
  useTaskWs.ts         # 连接 /ws/task/{id}，监听任务级实时更新

lib/api.ts           # 所有 HTTP/WS 接口定义，getConfig/saveConfig/clearConfig
```

## Claude 观测层（核心设计）

```
Claude Code 任意会话（交互式 或 headless -p）
    ↓
Claude Code 调用 hook（9 种事件：PreToolUse/PostToolUse/Stop/SessionStart/SessionEnd/
                                    Notification/SubagentStart/SubagentStop/PostToolUseFailure）
    ↓
~/.claude/hooks/tc-hook.sh（从 stdin 读 JSON → curl POST /hooks/claude）
    ↓
POST /hooks/claude（main.py）
  1. upsert ClaudeSession（按 session_id）
  2. insert ClaudeEvent
  3. broadcast → session:{session_id}  （供 SessionDetail 消费）
  4. broadcast → sessions              （供 ClaudeMonitorPanel 消费）
    ↓
ClaudeMonitorPanel / Sessions 页面 实时展示
```

**Hook 安装**（写入 `~/.claude/settings.json`，格式示例）：
```json
"PreToolUse": [{"matcher":"","hooks":[{"type":"command","command":"tc-hook.sh","timeout":5}]}]
```

**Headless 模式**（pipeline 驱动，不经过 hooks）：
`ClaudePool.run(task_id, prompt, cwd, log_file)` → 子进程 `claude -p "..." --output-format stream-json`

## 流水线阶段

```
input → analysis* → prd* → ui* → plan* → dev → test* → deploy* → monitor → done
```

`*` = 需人工审批（`APPROVAL_REQUIRED` 集合）

| 阶段 | Executor | 状态 |
|------|----------|------|
| analysis | pipeline/stages/analysis.py | ✅ 完整 |
| prd | pipeline/stages/prd.py | ✅ 完整 |
| plan | pipeline/stages/plan.py | ✅ 完整 |
| ui | — | ⏳ 待实现 |
| dev | — | ⏳ 待实现 |
| test | — | ⏳ 待实现 |
| deploy | — | ⏳ 待实现 |
| monitor | — | ⏳ 待实现 |

扩展指南：`docs/development/how-to-add-stage.md`

- 审批流：`POST /api/tasks/{id}/approve` → `POST /api/tasks/{id}/advance`

## API 端点速查

```
认证
  POST /auth/pin          → {token}
  GET  /auth/check        → 401 / {ok:true}

任务 & 项目
  GET  /api/projects
  POST /api/projects
  GET  /api/projects/{id}/tasks
  POST /api/projects/{id}/tasks
  GET  /api/tasks/{id}
  POST /api/tasks/{id}/approve   body: {action, reason}
  POST /api/tasks/{id}/advance

流水线
  POST /api/pipeline/{id}/run-analysis

Claude 会话（观测层）
  GET  /api/sessions                    → 最近 50 个会话（含 event_count）
  GET  /api/sessions/{session_id}/events → 最近 200 条事件

性能指标
  GET  /api/metrics                     → KPI / Claude 调用统计 / 周报

Hook 接收
  POST /hooks/claude                    → Claude Code hook 上报（由 tc-hook.sh 调用）

WebSocket
  WS /ws/task/{task_id}                 → 任务日志 + 状态推送
  WS /ws/sessions                       → 全局会话概览（session_update 事件）
  WS /ws/session/{session_id}           → 单会话工具调用流
```

## 关键约定

- **DB**：SQLite `backend/task_conductor.db`，SQLAlchemy 2.0 Mapped style，不直接拼 SQL
- **前端 API**：全部集中在 `lib/api.ts`，不在组件内散写 fetch
- **WebSocket 消息格式**：`{type: string, data: any, ts: string}`（由 `ws/manager.py` 统一封装）
- **状态提升**：`projects[]` 和 `connectionStatus` 在 `App.tsx` 管理，向下传 props
- **UI 风格**：Linear.app 三栏布局，Tailwind + CVA 变体，深色主题
- **tc-hook.sh**：超时 2s、静默失败（`|| true`），不阻塞 Claude Code 主流程
- **ClaudePool**：单例，`_processes` dict 跟踪活跃子进程，`kill(task_id)` 可中止
- **MetricsStore**：单例，内存 deque(maxlen=500)，不持久化，重启后清零
- **环境变量**：`TC_TUNNEL=0` 禁用 Tunnel，`TC_PIN=123456` 固定 PIN，`TC_AGENT_URL` 覆盖 hook 上报地址

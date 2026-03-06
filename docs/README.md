# TaskConductor 技术文档

> 版本：2026-03-05 | 技术栈：FastAPI + SQLite + React + Vite + TypeScript + Tailwind

## 文档结构

```
docs/
├── README.md                  # 本文件 — 文档索引
├── architecture/
│   ├── overview.md            # 项目定位、核心价值、系统架构图
│   ├── data-model.md          # 数据模型 ER 图 + 表字段详解
│   └── directory-structure.md # 代码目录结构说明
├── backend/
│   ├── claude-interaction.md  # Claude 底层交互（Hooks 被动观测 + ClaudePool 主动执行）
│   ├── pipeline.md            # 流水线系统（阶段状态机 + Executor + Runner + Scheduler）
│   ├── websocket.md           # WebSocket 实时通信（ConnectionManager + 三端点）
│   ├── auth.md                # 认证鉴权（PIN + JWT + localhost 免认证）
│   └── api-reference.md       # API 接口速查（全部端点 + 请求/响应格式）
├── frontend/
│   ├── architecture.md        # 前端架构（路由、状态管理、核心页面交互）
│   └── websocket-hooks.md     # 前端 WebSocket Hooks（useTaskWs + useClaudeMonitor）
├── operations/
│   ├── deployment.md          # 部署运维（启动、环境变量、Tunnel、数据库维护）
│   ├── monitoring.md          # 性能监控（MetricsStore + KPI 算法 + 通知告警）
│   └── status.md              # 当前完成度与待开发项
└── plans/                     # 设计方案归档
    ├── 2026-03-02-reliable-pipeline.md
    ├── 2026-03-03-conversation-history-design.md
    ├── 2026-03-03-conversation-history.md
    └── 2026-03-03-fix-pipeline-issues.md
```

## 快速入门

```bash
# 一键启动
bash start.sh

# 前端: http://localhost:7070
# 后端: http://localhost:8765
# API 文档: http://localhost:8765/docs
```

详见 [部署运维](operations/deployment.md)。

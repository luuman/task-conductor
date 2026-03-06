# 项目定位与系统架构

## 是什么

**TaskConductor** 是一个 AI 驱动的软件开发任务编排系统，将 Claude Code 的智能能力与可视化 Web 仪表盘深度集成。

## 解决什么问题

| 痛点 | TaskConductor 的解法 |
|------|---------------------|
| Claude Code 执行过程黑盒，无法实时监控 | Hook 机制：所有工具调用实时上报、持久化、可视化 |
| 复杂任务需要人工拆分、逐步执行 | 9 阶段流水线自动推进，关键节点暂停等待人工决策 |
| AI 输出质量不稳定，难以保障 | Validator + Critic 双层验证 + 自动重试 + 知识库积累 |
| 多任务并发执行缺乏管理 | Smart/Queue/Parallel 三种调度模式，支持依赖关系 |

## 两个核心能力层

```
┌─────────────────────────────────────────────────┐
│              Claude 观测层（被动）                │
│  监听任意 Claude Code 会话 → 持久化 → 实时推送    │
├─────────────────────────────────────────────────┤
│              任务流水线层（主动）                  │
│  驱动 Claude 自动完成9阶段软件开发任务            │
└─────────────────────────────────────────────────┘
```

## 系统需求

### 功能需求

**F1. Claude Code 观测**
- 实时监听本机所有 Claude Code 会话的工具调用（Read/Write/Bash/Grep 等）
- 9 种事件类型：PreToolUse / PostToolUse / PostToolUseFailure / Stop / SessionStart / SessionEnd / Notification / SubagentStart / SubagentStop
- 事件持久化到 SQLite，支持历史回放
- 前端实时展示，支持过滤、暂停、清空

**F2. 软件开发任务流水线**
- 将开发任务拆解为 9 个阶段（input → analysis → prd → ui → plan → dev → test → deploy → monitor → done）
- 每个阶段由 Claude 自动执行，产出结构化输出
- 关键阶段（analysis/prd/ui/plan/test/deploy）需人工审批后才能推进
- 支持任务驳回（附原因）并重试

**F3. AI 执行可靠性保障**
- 结构化 JSON 输出验证（Pydantic Schema）
- Critic Pass：第二次 Claude 调用评审输出质量（0-10 分，低于 8 分重试）
- 最多 3 次自动重试
- 知识库积累：失败经验自动保存，注入后续 Prompt

**F4. 多任务调度**
- 三种调度模式：smart（依赖感知）/ queue（串行）/ parallel（并行）
- 可配置每个项目的最大并行数
- 任务间依赖关系（depends_on 字段）

**F5. 前端可视化**
- 仪表盘：KPI 卡片 + 系统健康状态 + 周报统计
- 任务流程图：@xyflow/react 蛇形两行可视化
- 透明度 UI：置信度 Gauge + 假设列表 + Critic 评审 + 重试计数
- 对话历史：展示完整 claude.jsonl 对话记录，气泡样式
- 会话监控：实时日志流 + 历史事件回放

### 非功能需求

| 需求 | 指标 |
|------|------|
| Hook 非阻塞性 | tc-hook.sh 超时 2 秒，失败静默（`|| true`），不阻塞 Claude Code 主流程 |
| 前端实时性 | WebSocket 推送，延迟 < 100ms |
| 数据持久性 | 核心数据写 SQLite；MetricsStore 内存存储（重启清零） |
| 远程访问 | Cloudflare Tunnel 支持（TC_TUNNEL=1 启用） |
| 认证安全 | PIN + JWT 双层，Token 有效期 365 天 |

## 系统组件图

```
                        ┌──────────────────────────────────────┐
                        │            浏览器 (React)             │
                        │                                       │
                        │  Dashboard | TaskPipeline | Sessions  │
                        │  ConversationHistory | Settings ...    │
                        └─────────────────┬────────────────────┘
                                          │ HTTP / WebSocket
                                          │ (Vite proxy → :8765)
                        ┌─────────────────┴────────────────────┐
                        │          FastAPI 后端 (:8765)         │
                        │                                       │
                        │  Routers: projects/tasks/sessions/... │
                        │  WebSocket: /ws/task /ws/sessions     │
                        │  Hook入口: POST /hooks/claude         │
                        │                                       │
                        │  ┌─────────────┐  ┌───────────────┐  │
                        │  │ ClaudePool  │  │  Scheduler    │  │
                        │  │ (Headless)  │  │  (smart/queue)│  │
                        │  └──────┬──────┘  └───────────────┘  │
                        │         │                              │
                        │  ┌──────▼──────┐  ┌───────────────┐  │
                        │  │  Pipeline   │  │  MetricsStore │  │
                        │  │  Engine     │  │  (内存指标)    │  │
                        │  └─────────────┘  └───────────────┘  │
                        │                                       │
                        │  SQLite: task_conductor.db             │
                        └──────────────────────────────────────┘
                              ↑                      ↑
                    HTTP POST /hooks/claude      claude -p
                    (tc-hook.sh curl)           (子进程)
                              ↑
               ┌──────────────────────────────┐
               │   Claude Code（任意会话）      │
               │   ~/.claude/hooks/tc-hook.sh  │
               └──────────────────────────────┘
```

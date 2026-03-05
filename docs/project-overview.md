# TaskConductor 项目全面技术文档

> 版本：2026-03-05 | 技术栈：FastAPI + SQLite + React + Vite + TypeScript + Tailwind

---

## 目录

1. [项目定位与核心价值](#1-项目定位与核心价值)
2. [系统需求](#2-系统需求)
3. [整体架构](#3-整体架构)
4. [数据模型](#4-数据模型)
5. [Claude 底层交互机制](#5-claude-底层交互机制)
   - 5.1 [被动观测：Claude Code Hooks](#51-被动观测claude-code-hooks)
   - 5.2 [主动执行：ClaudePool（Headless 模式）](#52-主动执行claudepool-headless-模式)
   - 5.3 [两种模式对比](#53-两种模式对比)
6. [流水线系统](#6-流水线系统)
   - 6.1 [阶段状态机](#61-阶段状态机)
   - 6.2 [StageExecutor：可靠执行框架](#62-stageexecutor可靠执行框架)
   - 6.3 [已实现的阶段](#63-已实现的阶段)
   - 6.4 [Pipeline Runner：串行驱动](#64-pipeline-runner串行驱动)
   - 6.5 [ProjectScheduler：任务调度](#65-projectscheduler任务调度)
7. [WebSocket 实时通信](#7-websocket-实时通信)
8. [认证与鉴权](#8-认证与鉴权)
9. [API 接口设计](#9-api-接口设计)
10. [前端架构](#10-前端架构)
    - 10.1 [路由与状态管理](#101-路由与状态管理)
    - 10.2 [核心页面交互逻辑](#102-核心页面交互逻辑)
    - 10.3 [WebSocket Hooks](#103-websocket-hooks)
11. [性能监控体系](#11-性能监控体系)
12. [通知与告警](#12-通知与告警)
13. [部署与运维](#13-部署与运维)
14. [当前完成度与待开发项](#14-当前完成度与待开发项)

---

## 1. 项目定位与核心价值

### 是什么

**TaskConductor** 是一个 AI 驱动的软件开发任务编排系统，将 Claude Code 的智能能力与可视化 Web 仪表盘深度集成。

### 解决什么问题

| 痛点 | TaskConductor 的解法 |
|------|---------------------|
| Claude Code 执行过程黑盒，无法实时监控 | Hook 机制：所有工具调用实时上报、持久化、可视化 |
| 复杂任务需要人工拆分、逐步执行 | 9 阶段流水线自动推进，关键节点暂停等待人工决策 |
| AI 输出质量不稳定，难以保障 | Validator + Critic 双层验证 + 自动重试 + 知识库积累 |
| 多任务并发执行缺乏管理 | Smart/Queue/Parallel 三种调度模式，支持依赖关系 |

### 两个核心能力层

```
┌─────────────────────────────────────────────────┐
│              Claude 观测层（被动）                │
│  监听任意 Claude Code 会话 → 持久化 → 实时推送    │
├─────────────────────────────────────────────────┤
│              任务流水线层（主动）                  │
│  驱动 Claude 自动完成9阶段软件开发任务            │
└─────────────────────────────────────────────────┘
```

---

## 2. 系统需求

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

---

## 3. 整体架构

### 系统组件图

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

### 目录结构

```
task-conductor/
├── backend/app/
│   ├── main.py                  # FastAPI 入口，生命周期，所有端点注册
│   ├── models.py                # SQLAlchemy ORM（13个表，Mapped 2.0 style）
│   ├── database.py              # SQLite 引擎，create_all()
│   ├── hooks.py                 # Hook Payload 解析（parse_hook_event）
│   ├── session.py               # PIN 生成与验证（PinSession 单例）
│   ├── auth.py                  # JWT 创建与验证
│   ├── schemas.py               # Pydantic 请求/响应模型
│   ├── scheduler.py             # ProjectScheduler 单例（任务调度）
│   ├── tunnel.py                # Cloudflare Tunnel 集成
│   ├── tmux_manager.py          # tmux 会话管理
│   │
│   ├── claude/
│   │   ├── pool.py              # ClaudePool 单例：子进程 + 流式输出
│   │   ├── stream.py            # stream-json 行解析器
│   │   └── metrics_store.py     # MetricsStore 单例：性能与成本追踪
│   │
│   ├── pipeline/
│   │   ├── engine.py            # STAGE_ORDER 状态机 + APPROVAL_REQUIRED 集合
│   │   ├── executor.py          # StageExecutor 基类（validate→critic→retry）
│   │   ├── runner.py            # run_pipeline() 串行驱动主循环
│   │   ├── schemas.py           # 结构化输出 Pydantic 模型
│   │   └── stages/
│   │       ├── analysis.py      # 需求分析阶段（3方案 A/B/C）
│   │       ├── prd.py           # PRD 生成阶段
│   │       └── plan.py          # 技术规划阶段
│   │
│   ├── routers/                 # 各功能路由
│   │   ├── projects.py
│   │   ├── tasks.py
│   │   ├── sessions.py          # Claude 观测层 API
│   │   ├── pipeline.py
│   │   ├── metrics.py
│   │   ├── knowledge.py
│   │   ├── task_manager.py
│   │   └── settings_router.py
│   │
│   ├── ws/manager.py            # ConnectionManager：频道订阅 + 广播
│   └── notify/
│       ├── dispatcher.py        # 通知分发（TTS + webhook）
│       ├── tts.py               # 写入 speak-pipe（小爱音箱）
│       └── webhook.py           # POST 到外部 webhook
│
├── frontend/src/
│   ├── App.tsx                  # 根组件，状态提升，全局 WS 监听
│   ├── lib/api.ts               # 所有 HTTP/WS 接口定义（统一 request()）
│   ├── hooks/
│   │   ├── useClaudeMonitor.ts  # 全局 Claude WS 监听 + 自动重连
│   │   └── useTaskWs.ts         # 单任务实时日志 WS
│   ├── pages/                   # 各页面组件（见第10节）
│   └── components/              # 复用组件（AppShell/Sidebar/TaskWorkflow 等）
│
├── scripts/install-hooks.sh     # 向 ~/.claude/settings.json 注册 9 种 Hook 事件
└── start.sh                     # 一键启动（安装 Hook → 启动后端 → 启动前端）
```

---

## 4. 数据模型

### 完整 ER 图

```
Project ─────────────< Task >──────────────── StageArtifact
   │                    │
   │                    │  depends_on (JSON, self-ref)
   │                    │
   └──────────────< ProjectKnowledge
                        │ (错误经验库，注入 Prompt)

ClaudeSession ────────< ClaudeEvent
      │
      └──────────────< ConversationNote (alias/tags/notes)

ClaudeInstance (Claude 进程跟踪)
Notification   (审批通知)
```

### 表字段详解

#### `Project`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| name | str | 项目名称 |
| description | str? | 项目描述 |
| workspace_path | str? | 本地工作区路径 |
| max_parallel | int | 最大并行任务数（默认 2） |
| execution_mode | str | smart / queue / parallel |
| created_at | datetime | 创建时间 |

#### `Task`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| project_id | int FK | 所属项目 |
| title | str | 任务标题 |
| description | str? | 任务描述 |
| stage | str | 当前阶段（input/analysis/.../done） |
| status | str | pending/queued/running/waiting_review/done/failed |
| depends_on | JSON | 依赖的 task_id 列表 |
| worktree_path | str? | git worktree 路径 |
| created_at / updated_at | datetime | 时间戳 |

#### `StageArtifact`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| task_id | int FK | 所属任务 |
| stage | str | 阶段名称 |
| content | JSON | 阶段结构化输出（AnalysisOutput 等） |
| confidence | float? | AI 置信度 [0-1] |
| assumptions | JSON | 明确假设列表 |
| critic_notes | str? | Critic Pass 评审意见 |
| retry_count | int | 重试次数 |
| error_log | str? | 错误记录 |
| approved | bool | 是否已审批 |
| approval_action | str? | approve / reject |
| approval_reason | str? | 审批原因/驳回原因 |
| created_at | datetime | 创建时间 |

#### `ClaudeSession`（观测层）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| session_id | str UNIQUE | Claude 内部 session_id（UUID） |
| cwd | str | 工作目录 |
| status | str | active / idle / stopped |
| linked_task_id | int? | 关联的 Task（如果是 headless 模式） |
| started_at | datetime | 首次 Hook 上报时间 |
| last_seen_at | datetime | 最后活跃时间 |

#### `ClaudeEvent`（观测层）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| claude_session_id | int FK | 所属 ClaudeSession |
| session_id | str | 冗余保存，方便查询 |
| event_type | str | PreToolUse / PostToolUse / Stop / ... |
| tool_name | str? | 工具名称（Bash/Read/Write/Grep...） |
| tool_input | JSON? | 工具输入参数 |
| tool_result | JSON? | 工具执行结果 |
| extra | JSON? | 其他字段（Notification message 等） |
| created_at | datetime | 事件时间 |

#### `ProjectKnowledge`（知识库）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| project_id | int FK | 所属项目 |
| stage | str | 来源阶段 |
| category | str | error_pattern / validation_fail / wrong_tech_choice / rejected_assumption |
| content | str | 经验内容（注入 Prompt 的文本） |
| source_task_id | int? | 来源任务 |
| created_at | datetime | 创建时间 |

---

## 5. Claude 底层交互机制

TaskConductor 与 Claude 的交互分为两种完全独立的模式：**被动观测**（Hook）和**主动执行**（ClaudePool）。

### 5.1 被动观测：Claude Code Hooks

#### 工作原理

Claude Code 提供 Hook 机制：在特定事件发生时，将 Payload JSON 传入 stdin 执行指定命令。TaskConductor 利用这一机制实现零侵入的实时监控。

```
Claude Code 内部执行某工具
          ↓
将 Hook Payload 写入 stdin
          ↓
执行 ~/.claude/hooks/tc-hook.sh
          ↓
tc-hook.sh: cat stdin | curl POST /hooks/claude（2秒超时）
          ↓
后端接收 → 持久化 → 广播 → 前端实时展示
```

#### Hook Payload 格式（9 种事件）

**PreToolUse**（工具调用前）：
```json
{
  "session_id": "abc123",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" },
  "cwd": "/home/user/project"
}
```

**PostToolUse**（工具调用后）：
```json
{
  "session_id": "abc123",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" },
  "tool_response": "file1.txt\nfile2.txt",
  "cwd": "/home/user/project"
}
```

**Stop**（回合结束，Claude 完成一次响应）：
```json
{
  "session_id": "abc123",
  "hook_event_name": "Stop",
  "stop_reason": "end_turn"
}
```

**SessionEnd**（整个会话结束）：
```json
{
  "session_id": "abc123",
  "hook_event_name": "SessionEnd"
}
```

**Notification**（通知/提醒）：
```json
{
  "session_id": "abc123",
  "hook_event_name": "Notification",
  "message": "Waiting for user input..."
}
```

#### tc-hook.sh 脚本

```bash
#!/bin/bash
# ~/.claude/hooks/tc-hook.sh
# 由 install-hooks.sh 自动生成

AGENT_URL="${TC_AGENT_URL:-http://localhost:8765}"
PAYLOAD=$(cat)  # 从 stdin 读取完整 JSON payload

curl -s -X POST "$AGENT_URL/hooks/claude" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 2 \
  2>/dev/null || true  # 静默失败，不阻塞 Claude Code
```

关键设计：
- `--max-time 2`：最多等 2 秒，超时放弃（不阻塞 Claude 主流程）
- `|| true`：即使 curl 失败也返回 0，Claude Code 不感知错误
- 读 stdin 而非命令行参数：安全传递大 payload（工具结果可能很长）

#### ~/.claude/settings.json 格式

安装后的 Hook 注册格式（Claude Code 要求的嵌套结构）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/.claude/hooks/tc-hook.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [ /* 同上 */ ],
    "Stop": [ /* 同上 */ ],
    "SessionStart": [ /* 同上 */ ],
    "SessionEnd": [ /* 同上 */ ],
    "Notification": [ /* 同上 */ ],
    "SubagentStart": [ /* 同上 */ ],
    "SubagentStop": [ /* 同上 */ ],
    "PostToolUseFailure": [ /* 同上 */ ]
  }
}
```

注意：`matcher: ""` 表示匹配所有工具，`timeout: 5` 是 Claude Code 级别的超时（脚本自身的 curl 还有 2 秒限制）。

#### 后端接收逻辑（`POST /hooks/claude`）

```python
# main.py
@app.post("/hooks/claude")
async def receive_claude_hook(request: Request):
    payload = await request.json()

    # 1. 解析事件
    event = parse_hook_event(payload)
    # event = {session_id, event_type, tool_name, tool_input, tool_result, extra}

    # 2. Upsert ClaudeSession（按 session_id）
    session = db.query(ClaudeSession).filter_by(session_id=event.session_id).first()
    if not session:
        session = ClaudeSession(session_id=event.session_id, cwd=payload.get("cwd", ""), ...)
        db.add(session)
    else:
        session.last_seen_at = datetime.utcnow()
        # 状态更新：SessionEnd → stopped, Stop → idle, 否则 active

    # 3. Insert ClaudeEvent
    db_event = ClaudeEvent(
        claude_session_id=session.id,
        session_id=event.session_id,
        event_type=event.event_type,
        tool_name=event.tool_name,
        tool_input=json.dumps(event.tool_input),
        tool_result=json.dumps(event.tool_result),
        extra=json.dumps(event.extra),
    )
    db.add(db_event)
    db.commit()

    # 4. 双频道广播
    await ws_manager.broadcast(f"session:{event.session_id}", "claude_event", {...})
    await ws_manager.broadcast("sessions", "session_update", {...})

    return {"ok": True}
```

#### hooks.py 解析逻辑

```python
def parse_hook_event(payload: dict) -> HookEvent:
    event_type = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "")

    tool_name = payload.get("tool_name") or payload.get("tool")
    tool_input = payload.get("tool_input") or payload.get("input")
    tool_result = payload.get("tool_response") or payload.get("output")

    # extra 存储事件特有字段
    extra = {}
    if event_type == "Notification":
        extra["message"] = payload.get("message")
    elif event_type in ("Stop", "SessionEnd"):
        extra["stop_reason"] = payload.get("stop_reason")

    return HookEvent(
        session_id=session_id,
        event_type=event_type,
        tool_name=tool_name,
        tool_input=serialize_json_field(tool_input),
        tool_result=serialize_json_field(tool_result),
        extra=serialize_json_field(extra),
    )
```

### 5.2 主动执行：ClaudePool（Headless 模式）

#### 工作原理

流水线执行时，TaskConductor 通过 `ClaudePool.run()` 启动 Claude Code 子进程，以 `claude -p` headless 模式运行，获取结构化输出。

```
Pipeline Runner 调用 executor.run()
          ↓
executor._call_claude(task_id, prompt, cwd, log_file)
          ↓
ClaudePool.run() 启动子进程：
  claude -p "<prompt>" --output-format stream-json
  在 cwd 目录下运行
          ↓
实时读取 stdout（stream-json 格式，每行一个 JSON 事件）
          ↓
日志写入 log_file（持久化）
          ↓
广播文本内容给前端（/ws/task/{task_id}）
          ↓
收集完整输出，返回给 executor
```

#### stream-json 输出格式

Claude Code 的 `--output-format stream-json` 会逐行输出 JSON 事件：

```json
{"type": "system", "subtype": "init", "session_id": "xxx", ...}
{"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": "分析开始..."}]}}
{"type": "assistant", "message": {"role": "assistant", "content": [{"type": "tool_use", "name": "Read", "input": {...}}]}}
{"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "..."}]}}
{"type": "result", "subtype": "success", "result": "最终输出文本", "usage": {...}}
```

#### ClaudePool 核心实现

```python
class ClaudePool:
    _processes: dict[int, asyncio.subprocess.Process] = {}

    async def run(self, task_id: int, prompt: str, cwd: str, log_file: str) -> str:
        """
        启动 claude -p 子进程，流式收集输出。
        返回：最终完整文本输出
        """
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", prompt,
            "--output-format", "stream-json",
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._processes[task_id] = proc

        full_output = []
        ttft_recorded = False
        start_time = time.time()

        async for line in proc.stdout:
            line = line.decode().strip()
            if not line:
                continue

            # 写入日志文件
            with open(log_file, "a") as f:
                f.write(line + "\n")

            # 解析 stream-json 行
            event = parse_stream_line(line)

            if event.type == "assistant":
                text = extract_text(event)
                if text:
                    if not ttft_recorded:
                        ttft = time.time() - start_time
                        metrics_store.record_ttft(ttft)
                        ttft_recorded = True

                    # 广播给前端
                    await ws_manager.broadcast(f"task:{task_id}", "log", {"text": text})
                    full_output.append(text)

            elif event.type == "result":
                # 记录 Token 使用量
                if event.usage:
                    metrics_store.record_tokens(task_id, event.usage)

        await proc.wait()
        del self._processes[task_id]
        return "".join(full_output)

    def kill(self, task_id: int):
        """中止运行中的任务"""
        if task_id in self._processes:
            self._processes[task_id].terminate()
            del self._processes[task_id]
```

#### Headless 模式与 Hook 的交叉

值得注意：**通过 ClaudePool 启动的 headless claude 会话，如果本机已安装 Hook，也会触发 Hook 事件**。这意味着：
- Pipeline 执行的会话也会出现在 Sessions 监控页面
- 但其 `tool_input`/`tool_result` 可能为空（headless 模式下 Claude 直接执行任务，不一定有工具调用日志经过 Hook）

### 5.3 两种模式对比

| 维度 | Hook 被动观测 | ClaudePool 主动执行 |
|------|-------------|-------------------|
| 触发方式 | Claude Code 自动触发 | TaskConductor 主动调用 |
| 适用场景 | 监控任意交互式会话 | Pipeline 自动化任务 |
| 数据完整性 | 100%（所有工具调用） | 最终输出文本 |
| 执行控制 | 无（只观测） | 完全控制（可 kill） |
| 实时性 | 事件级实时推送 | 文本流实时广播 |
| 历史记录 | ClaudeEvent 表持久化 | log_file 文件 + StageArtifact |
| 会话来源 | 用户手动运行 claude | API 触发的 `claude -p` |

---

## 6. 流水线系统

### 6.1 阶段状态机

#### 阶段顺序（STAGE_ORDER）

```
input → analysis → prd → ui → plan → dev → test → deploy → monitor → done
```

- `input`：初始状态，等待用户触发
- `done`：最终状态，任务完成
- 中间 8 个阶段均由 Claude 自动执行

#### 审批节点（APPROVAL_REQUIRED）

```python
APPROVAL_REQUIRED = {"analysis", "prd", "ui", "plan", "test", "deploy"}
```

这 6 个阶段执行完成后，任务状态变为 `waiting_review`，等待人工：
1. 查看结构化输出（置信度/假设/Critic 评分）
2. 决定 approve（继续）或 reject（给出原因，触发重试或终止）

无需审批的阶段（`dev`, `monitor`）执行完成后自动推进到下一阶段。

#### 任务状态流转

```
pending
  ↓ scheduler.enqueue()
queued（等待执行槽位）
  ↓ 条件满足
running（执行中）
  ↓ 阶段完成 + 需审批
waiting_review（等待人工）
  ↓ POST /api/tasks/{id}/approve
  ├─ action=approve → POST /api/tasks/{id}/advance
  │                      ↓ 继续 running → 下一阶段
  └─ action=reject  → failed（或重新 enqueue）

  ↓ 所有阶段完成
done

  ↓ 执行异常
failed
```

### 6.2 StageExecutor：可靠执行框架

`pipeline/executor.py` 中的 `StageExecutor` 是所有阶段的基类，定义了标准化的执行流程：

#### 完整执行流程

```
executor.run(task_id, title, description, worktree_path, context_artifacts)
  │
  ├─ 1. 知识库注入
  │   └─ 查询 ProjectKnowledge（最近5条同项目错误）
  │       → 注入到 Prompt 末尾："以下是历史错误经验，请避免重蹈覆辙：..."
  │
  ├─ 2. build_prompt()
  │   └─ 子类实现：组合任务描述 + 上一阶段输出 + 知识库 + 格式要求
  │
  ├─ 3. _call_claude(task_id, prompt, log_file, cwd)
  │   └─ ClaudePool.run() → 流式日志 → 广播 → 返回完整文本
  │
  ├─ 4. extract_json(raw_output)
  │   └─ 去除 ```json...``` 包裹 → 提取纯 JSON 字符串
  │
  ├─ 5. 结构化验证
  │   └─ get_output_schema() 返回子类的 Pydantic 模型
  │       → model.model_validate_json(json_str)
  │       → 失败 → 记录 error_log，进入重试
  │
  ├─ 6. Critic Pass（第二次 Claude 调用）
  │   └─ 构建 Critic Prompt：
  │       "请作为严格的技术评审，对以下输出打分（0-10）并给出评审意见：
  │        [stage_output_json]
  │        返回 JSON：{score, issues, suggestions, pass_review}"
  │       → _call_claude() 获取 CriticOutput
  │       → score < 8 或 pass_review=false → 触发重试
  │       → 失败经验自动写入 ProjectKnowledge
  │
  ├─ 7. 重试循环（MAX_RETRIES = 3）
  │   └─ 每次重试，Prompt 附加上一次的错误信息和 Critic 评审
  │       retry_count 记录到 StageArtifact
  │
  └─ 8. 返回 (output: Pydantic模型, metadata: dict)
      metadata = {
        confidence, assumptions, critic_notes,
        retry_count, error_log
      }
```

#### CriticOutput 数据结构

```python
class CriticOutput(BaseModel):
    score: float        # 0-10 的质量评分
    issues: list[str]   # 发现的问题列表
    suggestions: list[str]  # 改进建议
    pass_review: bool   # 是否通过评审（决定是否继续或重试）
```

#### 知识库的工作机制

```
某次执行失败（校验不通过 or Critic 评分 < 8）
          ↓
ProjectKnowledge 写入一条记录：
  {
    project_id: 123,
    stage: "analysis",
    category: "validation_fail",  # or "wrong_tech_choice" etc.
    content: "分析阶段输出缺少 recommended 字段，请确保在 options 中指定推荐方案",
    source_task_id: 456
  }
          ↓
下一次执行同项目的任务时
build_prompt() 注入：
  "历史经验（请务必参考）：
   1. [validation_fail] 分析阶段输出缺少 recommended 字段...
   2. [wrong_tech_choice] 不要建议使用 Redis 作为持久化方案..."
```

### 6.3 已实现的阶段

#### AnalysisExecutor（需求分析）

**输出结构（AnalysisOutput）**：
```python
class AnalysisOption(BaseModel):
    label: str          # "A" | "B" | "C"
    title: str          # 方案标题
    effort: str         # "low" | "medium" | "high"
    risk: str           # "low" | "medium" | "high"
    description: str    # 方案详细描述

class AnalysisOutput(BaseModel):
    understanding: str       # 核心理解（1-2句话）
    assumptions: list[str]   # 明确列出的假设
    risks: list[str]         # 主要风险点
    options: list[AnalysisOption]  # 3个实现方案
    recommended: str         # "A" | "B" | "C"
    confidence: float        # 置信度 [0-1]
    blockers: list[str]      # 阻塞问题（如有，触发人工介入）
```

**Prompt 策略**：
- 要求输出3个方案（minimal/standard/advanced 或按任务特点区分）
- 明确要求识别假设和阻塞问题
- 强调输出纯 JSON，不附加说明

#### PrdExecutor（产品需求文档）

**输出结构（PrdOutput）**：
```python
class PrdOutput(BaseModel):
    title: str
    background: str               # 背景和目的
    user_stories: list[str]       # "As a X, I want Y, so that Z" 格式
    acceptance_criteria: list[str]  # 可测试的验收标准
    out_of_scope: list[str]       # 明确不在范围内的功能
    assumptions: list[str]
    confidence: float
    blockers: list[str]
```

**上下文注入**：从 `context_artifacts` 中取 analysis 阶段的 recommended 方案详情注入 Prompt。

#### PlanExecutor（技术规划）

**输出结构（PlanOutput）**：
```python
class TechDecision(BaseModel):
    decision: str       # 技术决策内容
    rationale: str      # 决策理由
    alternatives: list[str]  # 备选方案

class PlanOutput(BaseModel):
    architecture: str             # 架构设计概述
    components: list[dict]        # 组件列表 [{name, responsibility, tech}]
    milestones: list[dict]        # 里程碑 [{name, tasks:[str], estimate}]
    tech_decisions: list[TechDecision]
    assumptions: list[str]
    confidence: float
    blockers: list[str]
```

### 6.4 Pipeline Runner：串行驱动

`pipeline/runner.py` 中的 `run_pipeline()` 负责驱动阶段推进：

```python
async def run_pipeline(task_id: int, worktree_path: str):
    """
    从 task.stage 开始自动推进，遇到审批节点或错误时暂停。

    循环条件：
      while task.stage != "done" and task.stage not in TERMINAL_STAGES:
        1. 找到当前阶段对应的 Executor
        2. 加载上一阶段产物（context_artifacts）
        3. executor.run() 执行
        4. 保存 StageArtifact
        5. task.stage = next_stage（engine.next_stage()）
        6. 如果 next_stage 需审批 → 设置 waiting_review → 通知 → return
        7. 如果无需审批 → 继续循环
    """
```

#### 状态广播时机

每次阶段状态变化时，通过 `ws_manager.broadcast()` 通知前端：
```python
await ws_manager.broadcast(f"task:{task_id}", "stage_update", {
    "stage": task.stage,
    "status": task.status,
    "artifact": artifact_dict,
})
```

### 6.5 ProjectScheduler：任务调度

`scheduler.py` 中的 `ProjectScheduler` 单例管理项目内所有任务的执行顺序：

#### 三种调度模式

**smart 模式**（默认，依赖感知）：
```
enqueue(task_id):
  依赖未完成 → queued
  依赖完成 + running_count < max_parallel → running（立即执行）
  依赖完成 + 已满 → queued
```

**queue 模式**（严格串行）：
```
enqueue(task_id):
  有任务运行中 → queued
  无任务运行 → running
```

**parallel 模式**（忽略依赖）：
```
enqueue(task_id):
  running_count < max_parallel → running
  已满 → queued
```

#### 依赖满足检测

```python
def _check_dependencies(task: Task, db: Session) -> bool:
    """检查 task.depends_on 中的所有任务是否已完成"""
    if not task.depends_on:
        return True
    dep_ids = json.loads(task.depends_on)
    for dep_id in dep_ids:
        dep = db.query(Task).get(dep_id)
        if not dep or dep.status != "done":
            return False
    return True
```

---

## 7. WebSocket 实时通信

### ConnectionManager（ws/manager.py）

所有 WebSocket 连接由 `ConnectionManager` 单例统一管理，采用频道订阅模型：

```python
class ConnectionManager:
    active_connections: dict[str, list[WebSocket]] = {}
    # key = channel name, value = [WebSocket, ...]

    async def connect(self, ws: WebSocket, channel: str):
        await ws.accept()
        self.active_connections.setdefault(channel, []).append(ws)

    def disconnect(self, ws: WebSocket, channel: str):
        self.active_connections[channel].remove(ws)

    async def broadcast(self, channel: str, msg_type: str, data: dict):
        msg = json.dumps({
            "type": msg_type,
            "data": data,
            "ts": datetime.utcnow().isoformat(),
        })
        dead = []
        for ws in self.active_connections.get(channel, []):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        # 清理断连
        for ws in dead:
            self.active_connections[channel].remove(ws)
```

### 三个 WebSocket 端点

#### `/ws/task/{task_id}` — 任务日志

**订阅时机**：TaskPipeline 页面打开时

**消息类型**：
| type | data 字段 | 说明 |
|------|-----------|------|
| `log` | `{text: str}` | Claude 流式输出文本 |
| `stage_update` | `{stage, status, artifact}` | 阶段状态变化 |
| `task_done` | `{status: "done"}` | 任务完成 |
| `error` | `{message: str}` | 执行出错 |

#### `/ws/sessions` — 全局会话概览

**订阅时机**：App.tsx 启动后（用 `useClaudeMonitor`），ClaudeMonitorPanel 打开时

**消息类型**：
| type | data 字段 | 说明 |
|------|-----------|------|
| `session_update` | `{session_id, status, event_type, tool_name, tool_input, ...}` | 任意 Claude 会话有新事件 |

**数据流向**：
```
Hook 事件到达 /hooks/claude
        ↓
broadcast("sessions", "session_update", {...})
        ↓
useClaudeMonitor 接收
        ↓
App.tsx liveEvents.push(event) → 最多保留 500 条
        ↓
Sessions 页面"实时"tab 展示
ClaudeMonitorPanel 展示
```

#### `/ws/session/{session_id}` — 单会话详情

**订阅时机**：Sessions 页面切换到某个会话的"实时"视图时（如果该会话仍活跃）

**消息类型**：同 `session_update`，但只包含指定会话的事件

### 前端消息处理流（useClaudeMonitor.ts）

```typescript
export function useClaudeMonitor(enabled: boolean, onEvent: (e: ClaudeHookEvent) => void) {
  const ws = useRef<WebSocket | null>(null);
  const generation = useRef(0);  // 防止 stale callback

  useEffect(() => {
    if (!enabled) return;
    const gen = ++generation.current;

    const connect = () => {
      const url = getWsUrl("/ws/sessions");
      ws.current = new WebSocket(url);

      ws.current.onmessage = (e) => {
        if (gen !== generation.current) return;  // 已失效，丢弃
        const msg = JSON.parse(e.data);
        if (msg.type === "session_update") {
          onEvent({ data: msg.data, ts: msg.ts });
        }
      };

      ws.current.onclose = () => {
        if (gen !== generation.current) return;
        setTimeout(connect, 2000);  // 2秒后重连
      };
    };

    connect();
    return () => { ws.current?.close(); };
  }, [enabled]);
}
```

---

## 8. 认证与鉴权

### 两层认证机制

#### 层一：PIN 认证（获取 Token）

**生成阶段**（服务启动时）：
```python
class PinSession:
    def generate_pin(self):
        pin = os.environ.get("TC_PIN")  # 固定 PIN（开发用）
        if not pin:
            pin = "".join([str(random.randint(0,9)) for _ in range(6)])
        self._pin = pin
        print(f"[Auth] PIN: {pin}")  # 打印到控制台
        return pin
```

**验证阶段**（用户登录时）：
```python
POST /auth/pin
  body: {"pin": "123456", "tunnel_url": "https://xxx.trycloudflare.com"}

→ PinSession.verify_pin(pin)
→ 成功：create_token({"sub": "user"})
→ 返回：{"token": "eyJ..."}
→ 前端保存到 localStorage["tc_token"]
```

#### 层二：JWT Token 验证（请求鉴权）

所有 API 端点（除 /auth/* 和 /hooks/claude）都需要 Token：

```python
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")
```

Token 特性：
- 有效期 365 天
- SECRET_KEY 从环境变量读取（不变则重启后仍有效）
- 无刷新机制（到期需重新登录）

#### 特殊情况：localhost 免 PIN

```python
GET /auth/local
  if request.client.host == "127.0.0.1":
    return {"token": create_token({"sub": "local_user"})}
  else:
    raise HTTPException(403)
```

前端检测到运行在 localhost 时，优先尝试 `/auth/local` 自动登录（3秒超时），失败再跳到 PIN 输入。

### 前端认证流程

```
App.tsx 启动
  ↓
localStorage 中有 token？
  ├─ 有 → GET /auth/check
  │         ├─ 200 → setAuthed(true)，进入主界面
  │         └─ 401 → 清除 token，跳 Login
  └─ 无 → 跳 Login

Login.tsx
  ├─ localhost → GET /auth/local（3秒超时）
  │   ├─ 成功 → 保存 token → setAuthed(true)
  │   └─ 失败 → 显示手动登录表单
  └─ 手动登录：输入 tunnelUrl + PIN
      → POST /auth/pin
      → 保存 token → setAuthed(true)
```

---

## 9. API 接口设计

### 认证接口

```
POST   /auth/pin            # PIN 换 Token
GET    /auth/local          # localhost 自动登录（仅 127.0.0.1）
GET    /auth/check          # Token 有效性检查
```

### 项目与任务

```
GET    /api/projects                       # 项目列表
POST   /api/projects                       # 新建项目
GET    /api/projects/{id}/tasks            # 项目的任务列表
POST   /api/projects/{id}/tasks            # 创建任务
GET    /api/tasks/{id}                     # 任务详情（含 artifacts）
GET    /api/tasks/{id}/artifacts           # 阶段产物列表
POST   /api/tasks/{id}/approve             # 审批
       body: {action: "approve"|"reject", reason?: str}
POST   /api/tasks/{id}/advance             # 推进到下一阶段（触发调度）
```

### 流水线

```
POST   /api/pipeline/{id}/run/{stage}      # 触发指定阶段
POST   /api/pipeline/{id}/run-analysis     # 触发分析阶段（向后兼容）
```

### Claude 观测层

```
GET    /api/sessions                       # 最近50个会话（含事件数，单次 JOIN 查询）
GET    /api/sessions/{id}/events           # 会话历史事件（最近200条，升序）
GET    /api/sessions/{id}/transcript       # 从本地 JSONL 文件读取完整对话
GET    /api/sessions/{id}/note             # 获取会话备注
PATCH  /api/sessions/{id}/note             # 创建或更新会话备注
POST   /hooks/claude                       # Hook 事件接收（仅 tc-hook.sh 调用）
```

### 性能指标

```
GET    /api/metrics              # KPI + Claude 调用统计 + 周报
GET    /api/metrics/system       # CPU/内存/磁盘/网络快照
GET    /api/metrics/claude-usage # Token 消耗 + 成本 + 工具调用分布
```

### 知识库

```
GET    /api/projects/{id}/knowledge              # 项目知识库（最近50条）
DELETE /api/projects/{id}/knowledge/{kid}        # 删除知识条目
```

### 设置

```
GET    /api/settings             # 获取工作区配置
PUT    /api/settings             # 更新工作区根目录
```

### WebSocket

```
WS     /ws/task/{task_id}        # 任务实时日志 + 状态推送
WS     /ws/sessions              # 全局会话概览（Hook 事件流）
WS     /ws/session/{session_id}  # 单会话工具调用流（历史/实时）
```

### API 响应格式约定

所有错误返回 HTTP 4xx/5xx，body 为：
```json
{"detail": "错误描述"}
```

WebSocket 消息统一格式：
```json
{
  "type": "log|stage_update|session_update|...",
  "data": {...},
  "ts": "2026-03-05T12:34:56.789Z"
}
```

---

## 10. 前端架构

### 10.1 路由与状态管理

TaskConductor 前端使用**虚拟路由**（非 react-router），通过 App.tsx 的 `page` state 控制显示哪个页面：

```typescript
type Page =
  | { type: "dashboard" }
  | { type: "project"; projectId: number }
  | { type: "task"; taskId: number }
  | { type: "sessions" }
  | { type: "settings" }
  | { type: "tasks" }
  | { type: "conversations" }
  | { type: "canvas" };
```

**状态提升策略**（避免组件间数据不同步）：

| 状态 | 存放位置 | 理由 |
|------|----------|------|
| `projects[]` | App.tsx | Sidebar 和 Dashboard 都需要，统一来源 |
| `connectionStatus` | App.tsx | AppShell 的连接指示器需要 |
| `liveEvents: ClaudeHookEvent[]` | App.tsx | Sessions 和 ClaudeMonitorPanel 共用 |
| `authed: boolean` | App.tsx | 控制是否显示 Login |
| `page: Page` | App.tsx | 控制路由 |

### 10.2 核心页面交互逻辑

#### Dashboard.tsx（仪表盘）

```
页面加载
  ↓ GET /api/metrics → 更新 KPI 卡片（rating/interactions/uptime）
  ↓ GET /api/metrics/claude-usage → 更新 Gauge + 周报图表
  ↓ 展示 projects[]（从 App.tsx props 传入，不再重复请求）

点击项目
  ↓ setPage({type: "project", projectId})
  ↓ GET /api/projects/{id}/tasks → 任务列表

点击"新建项目"（AppShell Modal）
  ↓ POST /api/projects
  ↓ 刷新 projects[]（通知 App.tsx）

点击"知识库"按钮（项目头部）
  ↓ GET /api/projects/{id}/knowledge
  ↓ KnowledgePanel 滑出展示
```

#### TaskPipeline.tsx（任务详情）

```
页面加载（taskId 来自 page.taskId）
  ↓ GET /api/tasks/{id} → 任务基本信息 + 所有阶段产物
  ↓ useTaskWs(taskId, onMessage) → 连接 WS

WS 接收 "log" 消息
  ↓ LogStream 追加文本行
  ↓ 自动滚动到底部

WS 接收 "stage_update" 消息
  ↓ 更新当前阶段状态（StageProgress 进度条）
  ↓ 更新 artifact（置信度/假设/Critic 评审）
  ↓ OptionCards 展示3个方案（analysis 阶段）

点击"批准"
  ↓ POST /api/tasks/{id}/approve {action: "approve"}
  ↓ POST /api/tasks/{id}/advance
  ↓ 任务状态变 running，WS 开始接收下一阶段日志

点击"驳回"
  ↓ 弹出原因输入框
  ↓ POST /api/tasks/{id}/approve {action: "reject", reason}
  ↓ 任务状态变 failed

切换视图：detail ↔ flow
  ↓ detail: 阶段卡片列表 + LogStream
  ↓ flow: TaskWorkflow（@xyflow/react 蛇形布局）
      每个节点颜色：
        done: 绿色
        running: 蓝色 + 脉冲
        waiting_review: 黄色
        failed: 红色
        pending: 灰色
```

**透明度 UI 组件（阶段卡片内）**：

```
StageArtifact 卡片
  ├─ ConfidenceMeter: 环形 Gauge + 百分比（confidence * 100）
  │   颜色：< 50% 红色，< 80% 黄色，≥ 80% 绿色
  │
  ├─ AssumptionsList: 每个假设一行
  │   └─ 可标记"此假设有误"（触发驳回建议）
  │
  ├─ CriticNotes: Critic Pass 的评审结果
  │   ├─ 评分（0-10）+ 通过/未通过徽章
  │   ├─ 问题列表（红色）
  │   └─ 改进建议（黄色）
  │
  ├─ RetryCount: "第 N 次尝试"（retry_count > 0 时显示）
  │
  └─ [展开] JSON 原始内容（折叠状态，可展开）
```

#### Sessions.tsx（会话监控）

```
页面加载
  ↓ GET /api/sessions → 左栏会话列表（50条，按最后活跃时间倒序）
  ↓ 5秒一次轮询刷新（状态变更同步）
  ↓ liveEvents（App.tsx props）→ 实时 tab 展示

点击会话
  ↓ 若有缓存（transcriptCache）→ 直接显示
  ↓ 否则 GET /api/sessions/{id}/events → 历史 tab

"实时" tab（liveRows）：
  ├─ 全局所有会话的事件（liveEvents 来自 /ws/sessions）
  ├─ 支持暂停（不追加新事件）
  └─ 支持过滤（工具名 / 内容）

"历史" tab（historyRows）：
  ├─ 点击会话后从 DB 加载（API 返回升序，最近200条）
  └─ 相同过滤功能
```

#### ConversationHistory.tsx（对话气泡）

```
页面加载
  ↓ GET /api/sessions → 左栏会话列表

点击会话
  ↓ 检查 transcriptCache（useRef Map）
  ├─ 命中缓存 → 直接渲染，无请求
  └─ 未命中 → GET /api/sessions/{id}/transcript
       ↓ 后端读取 ~/.claude/projects/{cwd}/{session_id}.jsonl
       ↓ 解析为 TranscriptMessage[]
       ↓ 缓存到 Map + 渲染

ConvTranscript 展示：
  ├─ UserBubble（右对齐，蓝紫色气泡）
  │   └─ ReactMarkdown 渲染
  └─ AssistantBubble（左对齐，带 Claude 头像）
      ├─ text 块：ReactMarkdown 渲染
      └─ tool_use 块：InlineToolCard（工具名 + 关键参数）

底部 ConvEditPanel：
  ├─ 别名输入（alias）
  ├─ 标签选择（tags）
  ├─ 关联任务（linked_task_id）
  └─ PATCH /api/sessions/{id}/note 保存
```

### 10.3 WebSocket Hooks

#### useTaskWs（任务实时日志）

```typescript
// 使用方式：
const { connected } = useTaskWs(taskId, (msg) => {
  if (msg.type === "log") appendLog(msg.data.text);
  if (msg.type === "stage_update") updateArtifact(msg.data);
});

// 内部实现：
// - 连接 /ws/task/{taskId}
// - 自动处理 JSON 解析
// - 组件卸载时自动断开
```

#### useClaudeMonitor（全局监听）

```typescript
// 使用方式（App.tsx）：
const { status, url } = useClaudeMonitor(authed, (event) => {
  setLiveEvents(prev => [...prev.slice(-499), event]);
});

// 内部实现：
// - 连接 /ws/sessions
// - 断开自动 2 秒后重连
// - generation counter 防止组件重渲染后的 stale callback
// - 返回 status: "connected"|"connecting"|"disconnected"
```

### lib/api.ts（统一接口层）

所有 HTTP 请求通过统一的 `request<T>()` 函数：

```typescript
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("tc_token");
  const baseUrl = isRemote() ? getTunnelUrl() : "";  // Vite proxy 模式不需要 baseUrl

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

// 导出的 api 对象（类型安全）：
export const api = {
  health: () => request<{ok: boolean}>("/api/health"),
  projects: {
    list: () => request<Project[]>("/api/projects"),
    create: (data) => request<Project>("/api/projects", {method:"POST", body:JSON.stringify(data)}),
    tasks: (id) => request<Task[]>(`/api/projects/${id}/tasks`),
    // ...
  },
  sessions: {
    list: () => request<ClaudeSession[]>("/api/sessions"),
    events: (id) => request<ClaudeEvent[]>(`/api/sessions/${id}/events`),
    transcript: (id) => request<TranscriptResponse>(`/api/sessions/${id}/transcript`),
    getNote: (id) => request<ConversationNote>(`/api/sessions/${id}/note`),
    upsertNote: (id, note) => request<ConversationNote>(`/api/sessions/${id}/note`, {
      method: "PATCH", body: JSON.stringify(note),
    }),
  },
  // ...
};
```

---

## 11. 性能监控体系

### MetricsStore（内存存储，重启清零）

`backend/app/claude/metrics_store.py` 中的 `MetricsStore` 单例采集所有运行时指标：

#### 采集的指标类型

| 指标 | 存储 | 说明 |
|------|------|------|
| TTFT（首字节时间） | deque(20) | 每次 Claude 调用的首字节响应时间 |
| 调用时长 | deque(20) | 完整 Claude 调用时间 |
| 成功率 | deque(50) | 调用成功/失败统计 |
| Token 消耗 | deque(1000) | 每次调用的输入/输出/缓存 token |
| 成本 | 计算字段 | 基于 Token 数量和模型定价计算 |
| 工具调用 | deque(2000) | 按工具类型分类统计 |
| IO 快照 | 实时采集 | CPU/内存/磁盘/网络 |

#### 模型定价配置（USD/百万 Token）

```python
PRICING = {
    "claude-opus-4-6":   {"input": 15,   "output": 75,   "cache_write": 18.75, "cache_read": 1.50},
    "claude-sonnet-4-6": {"input": 3,    "output": 15,   "cache_write": 3.75,  "cache_read": 0.30},
    "claude-haiku-4-5":  {"input": 0.8,  "output": 4,    "cache_write": 1.0,   "cache_read": 0.08},
}
```

#### GET /api/metrics 返回结构

```json
{
  "kpi": {
    "rating": 4.2,              // AI 评分（最高5分）
    "interactions": 156,         // 总交互次数
    "uptime_percent": 98.7,     // 成功率百分比
    "avg_response_ms": 1234     // 平均响应时间
  },
  "claude_stats": {
    "ttft_avg": 0.85,           // 平均首字节时间（秒）
    "total_calls": 234,
    "success_count": 231,
    "total_tokens": 1567890,
    "total_cost_usd": 12.34
  },
  "weekly_stats": [
    {"day": "Mon", "tasks": 5, "success": 4},
    // ...7天
  ]
}
```

#### KPI 评分算法

```python
# AI Rating（满分 5 分）
rating = success_rate * 3.0 + (approval_rate / 100) * 2.0
# success_rate: 0-1，Claude 调用成功率
# approval_rate: 0-100，人工审批通过率
```

---

## 12. 通知与告警

### 触发时机

当 Pipeline 到达审批节点（`waiting_review` 状态）时，自动触发通知：

```python
# dispatcher.py
async def notify_human_required(task: Task, stage: str):
    msg = f"任务 {task.title} 的 {stage} 阶段需要审批"
    await _tts(msg)      # 小爱音箱播报
    await _webhook(msg)  # 外部 webhook
```

### TTS（tts.py）

```python
async def _tts(text: str):
    pipe_path = os.environ.get("SPEAK_PIPE", "/home/user/Documents/code2/speak-pipe")
    if os.path.exists(pipe_path):
        with open(pipe_path, "w") as f:
            f.write(text + "\n")
```

写入 `speak-pipe`（FIFO 管道），由另一进程（小爱音箱客户端）读取并播报。

### Webhook（webhook.py）

```python
async def _webhook(text: str):
    url = os.environ.get("WEBHOOK_URL")
    if url:
        async with httpx.AsyncClient() as client:
            await client.post(url, json={"text": text}, timeout=5)
```

---

## 13. 部署与运维

### 快速启动

```bash
# 一键启动（首次或重启）
bash start.sh

# 访问地址
# 前端: http://localhost:7070
# 后端 API: http://localhost:8765
# API 文档: http://localhost:8765/docs（SwaggerUI）

# 安装 Claude Code Hooks（每台机器执行一次）
bash scripts/install-hooks.sh [agent-url]
# 默认 agent-url = http://localhost:8765
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TC_PIN` | 随机6位 | 固定 PIN（开发/测试用） |
| `TC_TUNNEL` | `0` | 是否启用 Cloudflare Tunnel |
| `TC_AGENT_URL` | `http://localhost:8765` | Hook 上报地址（跨机使用时设置） |
| `TC_LOG_DIR` | `/tmp/tc-logs` | Pipeline 执行日志目录 |
| `SPEAK_PIPE` | `/tmp/speak-pipe` | 小爱音箱 FIFO 路径 |
| `WEBHOOK_URL` | 无 | 审批通知 webhook URL |
| `SECRET_KEY` | 内置默认值 | JWT 签名密钥（生产环境必须修改） |

### Cloudflare Tunnel 远程访问

当 `TC_TUNNEL=1` 时：
1. 服务启动时自动运行 `cloudflared tunnel`
2. 生成唯一的 `https://*.trycloudflare.com` URL
3. 在控制台打印 URL 和 PIN，供远程设备访问
4. 前端 Login 页面需要手动输入该 URL

### 数据库维护

```bash
# 数据库文件位置
backend/task_conductor.db

# 查看表内容（开发调试）
cd backend && source .venv/bin/activate
python -c "
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    rows = conn.execute(text('SELECT * FROM claude_session LIMIT 10')).fetchall()
    print(rows)
"
```

### 测试

```bash
cd backend && source .venv/bin/activate
pytest

# 前端类型检查
cd frontend && npx tsc --noEmit
```

---

## 14. 当前完成度与待开发项

### 已完整实现 ✅

| 模块 | 文件 | 状态 |
|------|------|------|
| Claude 观测层 | hooks.py + models.py + /hooks/claude | ✅ 完整 |
| Hook 安装脚本 | scripts/install-hooks.sh | ✅ 完整 |
| 9种事件接收与持久化 | main.py + routers/sessions.py | ✅ 完整 |
| WebSocket 广播 | ws/manager.py | ✅ 完整 |
| 会话监控前端 | Sessions.tsx + ClaudeMonitorPanel.tsx | ✅ 完整 |
| 对话历史前端 | ConversationHistory.tsx + ConvTranscript.tsx | ✅ 完整 |
| PIN + JWT 认证 | session.py + auth.py | ✅ 完整 |
| 项目/任务 CRUD | routers/projects.py + tasks.py | ✅ 完整 |
| Pipeline 状态机 | pipeline/engine.py | ✅ 完整 |
| StageExecutor 框架 | pipeline/executor.py | ✅ 完整（Critic+Retry+知识库） |
| Analysis 阶段 | pipeline/stages/analysis.py | ✅ 完整 |
| PRD 阶段 | pipeline/stages/prd.py | ✅ 完整 |
| Plan 阶段 | pipeline/stages/plan.py | ✅ 完整 |
| Pipeline Runner | pipeline/runner.py | ✅ 完整 |
| 任务调度器 | scheduler.py | ✅ 完整（smart/queue/parallel） |
| 性能指标采集 | claude/metrics_store.py | ✅ 完整 |
| 知识库管理 | routers/knowledge.py | ✅ 完整 |
| ClaudePool | claude/pool.py | ✅ 完整 |
| 仪表盘前端 | Dashboard.tsx | ✅ 完整 |
| 任务流程图 | TaskWorkflow.tsx | ✅ 完整 |
| 透明度 UI | TaskPipeline.tsx | ✅ 完整 |

### 待实现 ⏳

| 待开发项 | 优先级 | 说明 |
|---------|--------|------|
| UI 阶段 Executor | 高 | UI 设计/原型生成，需要调用 Claude 生成组件代码 |
| Dev 阶段 Executor | 高 | 核心编码阶段，调用 Claude Code 实际修改代码 |
| Test 阶段 Executor | 高 | 生成测试用例并执行（pytest/vitest） |
| Deploy 阶段 Executor | 中 | 触发 CI/CD 或手动部署脚本 |
| Monitor 阶段 Executor | 低 | 部署后监控指标采集 |
| ProjectsCanvas | 低 | 项目任务关系可视化（拖拽布局） |

---

*文档最后更新：2026-03-05*

# 数据模型

## ER 图

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

## 表字段详解

### `Project`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| name | str | 项目名称 |
| description | str? | 项目描述 |
| workspace_path | str? | 本地工作区路径 |
| max_parallel | int | 最大并行任务数（默认 2） |
| execution_mode | str | smart / queue / parallel |
| created_at | datetime | 创建时间 |

### `Task`

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

### `StageArtifact`

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

### `ClaudeSession`（观测层）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| session_id | str UNIQUE | Claude 内部 session_id（UUID） |
| cwd | str | 工作目录 |
| status | str | active / idle / stopped |
| linked_task_id | int? | 关联的 Task（如果是 headless 模式） |
| started_at | datetime | 首次 Hook 上报时间 |
| last_seen_at | datetime | 最后活跃时间 |

### `ClaudeEvent`（观测层）

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

### `ProjectKnowledge`（知识库）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 自增主键 |
| project_id | int FK | 所属项目 |
| stage | str | 来源阶段 |
| category | str | error_pattern / validation_fail / wrong_tech_choice / rejected_assumption |
| content | str | 经验内容（注入 Prompt 的文本） |
| source_task_id | int? | 来源任务 |
| created_at | datetime | 创建时间 |

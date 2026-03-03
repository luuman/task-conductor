# 对话历史功能设计文档

**日期**：2026-03-03
**状态**：已确认，待实现
**范围**：后端 DB + API、前端侧边栏 + 新页面

---

## 背景

TaskConductor 通过 Claude Code Hooks 将所有会话的工具调用事件持久化到 `ClaudeSession` / `ClaudeEvent` 表。现有「实时监听」页面以表格形式展示工具调用流，但缺少：

1. 以对话气泡形式回看历史执行过程
2. 对会话打标签、备注、重命名、关联到具体任务的能力

---

## 目标

- 侧边栏新增「对话历史」入口，进入独立页面
- 以聊天气泡风格展示任意会话的工具调用历史
- 支持对会话添加别名、标签、备注，并关联到 Task

---

## 方案选型

采用 **方案 B：新建 ConversationNote 独立表**。

| 对比维度 | 方案 A（扩展 ClaudeSession） | 方案 B（独立 ConversationNote） |
|---|---|---|
| 数据分离 | Session 承担元数据职责，混用 | 观测数据与用户元数据完全分离 |
| 迁移成本 | 需 ALTER TABLE claude_sessions | 新建表，不动现有表 |
| 查询复杂度 | 单表查询 | 需 LEFT JOIN，略增复杂度 |
| 可扩展性 | 扩展字段会污染 Session 表 | 独立演化 |

**结论**：ClaudeSession 是只读观测数据，不应混入用户写入的元数据，故选方案 B。

---

## 数据层设计

### 新增表：`conversation_notes`

```python
class ConversationNote(Base):
    __tablename__ = "conversation_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("claude_sessions.id"), unique=True, index=True
    )
    alias: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # JSON list[str]
    linked_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tasks.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    session: Mapped["ClaudeSession"] = relationship()
    linked_task: Mapped[Optional["Task"]] = relationship()
```

**字段说明：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `session_id` | FK → claude_sessions | 一对一，一个会话最多一条备注 |
| `alias` | String(100) nullable | 用户自定义名称；显示时优先 alias，无则取 cwd 末段 |
| `notes` | Text nullable | 自由文本备注（Markdown 纯文本） |
| `tags` | String(200) nullable | JSON 数组，如 `["bug", "重要"]` |
| `linked_task_id` | FK → tasks nullable | 关联到某个 Task（可选） |

### ClaudeSession 表

**不做任何改动**，保持只读观测数据。

---

## API 设计

### 已有接口（不改动）

```
GET  /api/sessions                      返回最近 50 条会话
GET  /api/sessions/{session_id}/events  返回最近 200 条事件
```

### 新增接口

```
GET  /api/sessions/{session_id}/note
  → 返回该会话的 ConversationNote，若不存在返回空结构 {alias:null, notes:null, tags:[], linked_task_id:null}

PUT  /api/sessions/{session_id}/note
  Body: { alias?, notes?, tags?, linked_task_id? }
  → Upsert：不存在则 INSERT，存在则 UPDATE
  → 返回更新后的 ConversationNote
```

**已有 GET /api/sessions 接口**：响应中追加 `note` 字段（LEFT JOIN ConversationNote），避免前端在列表渲染时逐条请求。

---

## 前端设计

### 侧边栏变更

在 `NAV_ITEMS` 数组中新增：

```ts
{ id: "conversations", label: "对话历史", Icon: MessageSquare }
```

位置：「实时监听」之后，项目列表之前。

### 页面结构：`ConversationHistory.tsx`

双栏布局（与现有 Sessions 页一致）：

```
┌──────────────────────────────────────────────────────────┐
│ 左栏（260px）         border-r  │  右栏（flex-1）         │
│                                 │                         │
│  [搜索框]                       │  气泡对话区（可滚动）    │
│  ─────────────────────────────  │                         │
│  [会话卡片]                      │  ▶ 会话开始  13:22:01   │
│   alias 或 cwd末段              │                         │
│   [标签 chips]                  │    [Claude] Read        │
│   13:22 · 42 条事件             │            src/App.tsx  │
│   [关联任务 badge]              │            ─────────    │
│                                 │            ✓ 完成(2.1s) │
│  [更多会话...]                  │                         │
│                                 │    [Claude] Bash        │
│                                 │            npm run dev  │
│                                 │            ─────────    │
│                                 │            ✓ 完成(0.8s) │
│                                 │                         │
│                                 │  ◆ 通知: 需要审批       │
│                                 │  ■ 会话结束             │
│                                 │                         │
│                                 │ ┄┄┄┄ 编辑面板 ┄┄┄┄┄┄┄  │
│                                 │  别名      [input     ] │
│                                 │  标签      [chip input] │
│                                 │  关联任务  [select    ] │
│                                 │  备注      [textarea  ] │
│                                 │            [保存]       │
└──────────────────────────────────────────────────────────┘
```

### 气泡渲染规则

| 事件类型 | 渲染方式 |
|---|---|
| `SessionStart` | 居中横幅，显示 cwd + 开始时间 |
| `PreToolUse` + 对应 `PostToolUse` | **合并为一张工具卡片**：工具名称、参数摘要（文件路径/命令/查询）、执行耗时、成功/失败状态 |
| 只有 `PreToolUse` 无对应 `PostToolUse` | 显示为「执行中…」状态 |
| `Notification` | 黄色通知横幅，显示消息内容 |
| `Stop` | 居中「会话结束」横幅 |
| `SubagentStart/Stop` | 缩进 + 灰色子任务折叠卡片 |

**PreToolUse + PostToolUse 合并逻辑**：在前端按 `tool_name` 和时序配对（同一会话内，PostToolUse 紧跟 PreToolUse 之后）。

### 组件拆分

```
pages/
  ConversationHistory.tsx       主页面，管理左右栏状态、note 编辑
components/
  ConvSessionList.tsx            左侧会话卡片列表（含搜索/过滤）
  ConvBubbles.tsx                气泡渲染（events[] → bubbles）
  ConvEditPanel.tsx              alias/tags/notes/linked_task 编辑面板
```

### 状态管理

- 会话列表：`GET /api/sessions`，含 `note` 字段，组件内 useState
- 事件列表：点击会话触发 `GET /api/sessions/{id}/events`，按需加载
- Note 编辑：本地 draft state → 点击「保存」调用 `PUT /api/sessions/{id}/note` → 更新列表缓存

---

## 实现顺序

1. **后端**：新增 `ConversationNote` 模型 → migrate → 新增路由 `/api/sessions/{id}/note` → GET /api/sessions 追加 note 字段
2. **前端 API**：`lib/api.ts` 新增 `getSessionNote` / `upsertSessionNote`
3. **前端页面**：侧边栏导航项 → `ConversationHistory.tsx` 双栏骨架 → `ConvSessionList` → `ConvBubbles` → `ConvEditPanel`
4. **App.tsx**：新增 `conversations` page 路由

---

## 不在本期范围

- 实时接收新事件（对话历史是只读回放，实时监听保留在 Sessions 页）
- 删除/归档会话
- 全文搜索事件内容（当前只搜索 alias/cwd/tags）
- 导出对话记录

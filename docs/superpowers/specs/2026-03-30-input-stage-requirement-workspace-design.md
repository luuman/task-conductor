# Input 阶段需求完善工作台 — 设计文档

**日期**：2026-03-30
**状态**：待实现

---

## 背景

当前任务创建后处于 `input/pending` 状态，用户只填写了标题和简短描述，流水线启动时 AI 执行器拿到的上下文极少，无法产出高质量的后续产物（PRD、架构文档等）。

本设计解决"需求充实"问题：在流水线正式启动前，通过 AI 对话 + 页面协作，帮助用户将模糊想法转化为完整需求文档。

---

## 目标

1. 用户在 AI 面板说出想法，AI 自动创建任务并跳转到任务页
2. 任务页 `input` 阶段展示结构化需求字段（已知 ✅ / 待补充 ⚠️）
3. 用户在页面直接填写，也可继续在 AI 面板补充说明
4. 用户主动触发 AI 审核，AI 检查完整性并追问缺失项
5. 字段填写过程中实时生成 PRD 预览文档
6. AI 确认需求完整后，用户启动流水线

---

## 整体流程

```
用户在 AI 面板说："我想做一个知识库，支持上传文档、全文搜索"
    ↓
AI 调用 MCP: create_task(project_id, title, known_fields)
AI 调用 MCP: navigate_to("/task/{id}")
    ↓
任务页 input 阶段加载
  左侧：需求字段面板（AI 已填 + 待补充高亮）
  右侧：PRD 实时预览（Markdown，随字段同步更新）
    ↓
用户在页面填写 / 在 AI 面板继续说明
AI 面板补充说明 → MCP: update_requirement_field() → 页面实时更新
    ↓
用户在 AI 面板说："填写完成了"
    ↓
AI 审核全部字段：
  - 有缺失 → 在面板追问，用户回答后继续
  - 全部完整 → 面板提示"需求完整，PRD 已生成"
    ↓
用户点击"启动流水线"（按钮此时变为可用）
    ↓
流水线从 discovery 阶段开始，携带完整 requirements + prd_draft
```

---

## 后端改动

### 1. Task 模型新增字段

```python
requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
# 结构化需求字段，JSON 格式存储：
# {
#   "background": "...",       # 背景
#   "target_users": "...",     # 目标用户
#   "core_features": [...],    # 核心功能列表
#   "acceptance_criteria": [...], # 验收标准
#   "tech_constraints": "...", # 技术约束（选填）
# }

prd_draft: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
# AI 实时生成的 PRD Markdown 文档
```

### 2. MCP 工具（新增 router: `backend/app/routers/mcp.py`）

遵循 MCP over HTTP 标准协议，暴露以下工具：

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `create_task` | `project_id, title, known_fields?` | 创建任务，返回 task_id |
| `update_requirement_field` | `task_id, field, value` | 更新单个需求字段 |
| `update_prd_draft` | `task_id, markdown` | 更新 PRD 草稿 |
| `navigate_to` | `path` | 指示前端跳转页面（WS 广播） |
| `start_pipeline` | `task_id` | 启动流水线 |

### 3. 流水线执行器优先读 requirements

```python
# runner.py
req = json.loads(task.requirements) if task.requirements else {}
context = {
    "title": task.title,
    "background": req.get("background", task.description or ""),
    "target_users": req.get("target_users", ""),
    "core_features": req.get("core_features", []),
    "acceptance_criteria": req.get("acceptance_criteria", []),
    "prd_draft": task.prd_draft or "",
}
```

### 4. 数据库迁移

在 `main.py` lifespan 的迁移列表中新增：
```python
"ALTER TABLE tasks ADD COLUMN requirements TEXT",
"ALTER TABLE tasks ADD COLUMN prd_draft TEXT",
```

---

## 前端改动

### 1. 任务页 `input` 阶段新布局

```
┌──────────────────────┬──────────────────────────┐
│ 需求字段（左 50%）    │ PRD 预览（右 50%）        │
│                      │                          │
│ 背景           [填写]│ ## {任务标题}             │
│ 目标用户       [填写]│                          │
│ 核心功能       ✅    │ ### 背景                  │
│ 验收标准       [填写]│ {content}                │
│ 技术约束  [选填]     │                          │
│                      │ ### 目标用户              │
│ ─────────────────── │ {content}                │
│ [完成填写，请AI审核] │                          │
└──────────────────────┴──────────────────────────┘
```

- 已由 AI 填写的字段：显示内容 + 绿色 ✅ + 可编辑
- 待补充字段：橙色 ⚠️ 高亮 + 点击展开输入框
- "完成填写，请 AI 审核"按钮：POST 到 AI 面板触发审核流程

### 2. 启动流水线按钮逻辑变化

```typescript
// 原来：stage === 'input' && status === 'pending' 即可启动
// 现在：还需要 requirements 非空（至少填写了背景和目标用户）

const canStart = task.stage === 'input'
  && task.status === 'pending'
  && !!task.requirements
  && hasMinimumRequirements(task.requirements)
```

### 3. 实时同步

MCP `update_requirement_field` / `update_prd_draft` 调用后：
- 后端通过 WebSocket 广播 `task:{id}` 频道
- 前端 `useTaskDetailData` 收到事件 → 刷新字段和 PRD 预览
- 无需轮询，实时更新

### 4. AI 面板扩展

全局 Panel 组件（`layouts/Panel`）新增 AI 对话模式：
- 消息历史展示
- 输入框
- 当前任务上下文感知（面板知道当前在哪个任务页）

---

## 关键文件

```
backend/app/models.py                    ← requirements / prd_draft 字段
backend/app/routers/mcp.py               ← MCP 工具端点（新建）
backend/app/main.py                      ← 路由注册 + 迁移 SQL
backend/app/pipeline/runner.py           ← 优先读 requirements

tauri/src/features/task-detail/index.tsx ← input 阶段新布局
tauri/src/features/task-detail/components/RequirementWorkspace.tsx  ← 新组件
tauri/src/features/task-detail/components/PrdPreview.tsx            ← 新组件
tauri/src/layouts/Panel/Panel.tsx        ← 扩展 AI 对话模式
tauri/src/lib/api/types.ts               ← Task 类型新增字段
tauri/src/lib/api/http.ts                ← 新增 updateRequirementField 等方法
```

---

## 验收标准

1. 在 AI 面板说"我想做 X"，任务自动创建并跳转到 `/task/{id}`
2. 任务页 input 阶段展示需求字段面板 + PRD 预览双栏布局
3. 字段更新后 PRD 预览在 1 秒内实时更新
4. "启动流水线"按钮在 requirements 未填写时为灰色禁用
5. 流水线启动后，`runner.py` 正确读取 requirements 字段传给执行器

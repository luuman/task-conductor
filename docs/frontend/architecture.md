# 前端架构

## 路由与状态管理

TaskConductor 前端使用**虚拟路由**（非 react-router），通过 App.tsx 的 `page` state 控制：

```typescript
type Page = "dashboard" | "project" | "task" | "sessions" | "settings"
           | "tasks" | "conversations" | "canvas" | "claude-config";
```

### 状态提升策略

| 状态 | 存放位置 | 理由 |
|------|----------|------|
| `projects[]` | App.tsx | Sidebar 和 Dashboard 都需要 |
| `connectionStatus` | App.tsx | AppShell 连接指示器 |
| `liveEvents[]` | App.tsx | Sessions 和 ClaudeMonitorPanel 共用 |
| `authed` | App.tsx | 控制是否显示 Login |
| `page` | App.tsx | 控制路由 |

## 核心页面交互

### Dashboard.tsx（仪表盘）

```
页面加载
  ↓ GET /api/metrics → KPI 卡片
  ↓ GET /api/metrics/claude-usage → Gauge + 周报图表
  ↓ 展示 projects[]（App.tsx props）

点击项目 → 展示项目任务列表
点击"知识库" → KnowledgePanel 滑出
```

### TaskPipeline.tsx（任务详情）

```
加载 → GET /api/tasks/{id} → useTaskWs(taskId) 连接 WS

WS "log"    → LogStream 追加文本
WS "stage_update" → 更新进度条 + artifact

批准 → POST approve + advance
驳回 → POST approve {action:"reject", reason}

视图切换：detail（卡片列表） ↔ flow（@xyflow/react 蛇形图）
```

**透明度 UI 组件**：
- ConfidenceMeter：环形 Gauge（< 50% 红 / < 80% 黄 / >= 80% 绿）
- AssumptionsList：假设清单
- CriticNotes：评审分数 + 问题 + 建议
- RetryCount：重试次数

### Sessions.tsx（会话监控）

```
加载 → GET /api/sessions → 左栏会话列表（5秒轮询）

"实时" tab：liveEvents（来自 /ws/sessions，支持暂停、过滤）
"历史" tab：GET /api/sessions/{id}/events（DB 加载）
```

### ConversationHistory.tsx（对话气泡）

```
加载 → GET /api/sessions → 会话列表

点击会话 → GET /api/sessions/{id}/transcript → 读取 JSONL

UserBubble（右对齐） + AssistantBubble（左对齐，带 Claude 头像）
  ├─ text → ReactMarkdown
  └─ tool_use → InlineToolCard

底部 ConvEditPanel：别名 / 标签 / 关联任务
```

### ClaudeConfig.tsx（Claude 配置）

```
加载 → GET /api/claude-config/overview → 总览面板
     → GET /api/claude-config → 配置编辑

总览：CLI 版本 / 统计 / 活动图表 / 插件 / Skills / MCP / 项目

Tab 编辑器：
  MCP     → 服务器列表 + 添加/删除
  Hooks   → 10种事件 + matcher/command/timeout
  Plugins → 启用/禁用 + 安装详情
  Permissions → JSON 编辑
  Other   → 其他 settings.json 字段
```

## lib/api.ts（统一接口层）

所有 HTTP 请求通过统一的 `request<T>()` 函数：

```typescript
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("tc_token");
  const baseUrl = isRemote() ? getTunnelUrl() : "";

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}
```

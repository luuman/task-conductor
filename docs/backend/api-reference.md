# API 接口参考

> 完整交互式文档：http://localhost:8765/docs（SwaggerUI）

## 认证

```
POST   /auth/pin            # PIN 换 Token
GET    /auth/local          # localhost 自动登录（仅 127.0.0.1）
GET    /auth/check          # Token 有效性检查
GET    /agent/info          # 后端版本 + Tunnel URL
```

## 项目与任务

```
GET    /api/projects                       # 项目列表
POST   /api/projects                       # 新建项目
GET    /api/projects/{id}/tasks            # 项目的任务列表
POST   /api/projects/{id}/tasks            # 创建任务
GET    /api/tasks/{id}                     # 任务详情（含 artifacts）
GET    /api/tasks/{id}/artifacts           # 阶段产物列表
POST   /api/tasks/{id}/approve             # 审批 {action: "approve"|"reject", reason?}
POST   /api/tasks/{id}/advance             # 推进到下一阶段
```

## 流水线

```
POST   /api/pipeline/{id}/run/{stage}      # 触发指定阶段
POST   /api/pipeline/{id}/run-analysis     # 触发分析阶段（向后兼容）
```

## Claude 观测层

```
GET    /api/sessions                       # 最近50个会话（含事件数）
GET    /api/sessions/{id}/events           # 会话历史事件（最近200条）
GET    /api/sessions/{id}/transcript       # 完整对话（从 JSONL 读取）
GET    /api/sessions/{id}/note             # 获取会话备注
PATCH  /api/sessions/{id}/note             # 更新会话备注
POST   /hooks/claude                       # Hook 事件接收
```

## Claude 配置

```
GET    /api/claude-config                  # 读取 settings.json（解析后）
GET    /api/claude-config/overview         # Claude 总览（版本/统计/插件/MCP等）
GET    /api/claude-config/hook-events      # 所有 Hook 事件类型
PUT    /api/claude-config/hooks            # 更新 Hook 规则
DELETE /api/claude-config/hooks/{event}    # 删除某事件所有 Hook
PUT    /api/claude-config/plugins          # 启用/禁用插件
DELETE /api/claude-config/plugins/{id}     # 移除插件
PUT    /api/claude-config/permissions      # 更新权限配置
PUT    /api/claude-config/other/{key}      # 更新其他配置
DELETE /api/claude-config/other/{key}      # 删除其他配置
GET    /api/claude-config/mcp              # 列出 MCP 服务器
POST   /api/claude-config/mcp              # 添加 MCP 服务器
DELETE /api/claude-config/mcp/{name}       # 移除 MCP 服务器
```

## 性能指标

```
GET    /api/metrics              # KPI + Claude 调用统计 + 周报
GET    /api/metrics/system       # CPU/内存/磁盘/网络快照
GET    /api/metrics/claude-usage # Token 消耗 + 成本 + 工具调用分布
```

## 知识库

```
GET    /api/projects/{id}/knowledge              # 项目知识库（最近50条）
DELETE /api/projects/{id}/knowledge/{kid}        # 删除知识条目
```

## 设置

```
GET    /api/settings             # 获取工作区配置
PUT    /api/settings             # 更新工作区根目录
```

## WebSocket

```
WS     /ws/task/{task_id}        # 任务实时日志 + 状态推送
WS     /ws/sessions              # 全局会话概览（Hook 事件流）
WS     /ws/session/{session_id}  # 单会话工具调用流
```

## 响应格式

错误返回 HTTP 4xx/5xx：
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

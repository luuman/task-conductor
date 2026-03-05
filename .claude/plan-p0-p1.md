# P0+P1 Claude Hook 集成计划

## P0 — 修复 Hook 配置格式

### Task 1: 修复 install-hooks.sh
文件：scripts/install-hooks.sh
- 使用正确的 Claude Code hooks 格式（type: command + hooks 数组嵌套 + matcher）
- 扩展事件注册：PreToolUse, PostToolUse, PostToolUseFailure, Stop,
  SessionStart, SessionEnd, Notification, SubagentStart, SubagentStop
- 格式示例：
  ```json
  "PreToolUse": [{"matcher":"","hooks":[{"type":"command","command":"tc-hook.sh"}]}]
  ```

## P1 — 后端 Claude 观测层

### Task 2: 扩展 DB 模型 (models.py)
新增：
- ClaudeSession: id(PK), session_id(str,unique), cwd, status, linked_task_id(nullable FK→tasks),
  started_at, last_seen_at
- ClaudeEvent: id(PK), claude_session_id(FK→claude_sessions.id), event_type, tool_name,
  tool_input(JSON→Text), tool_result(JSON→Text), created_at
使用 SQLAlchemy Mapped style 与现有 models 一致

### Task 3: 重写 hooks.py 解析
- parse_hook_event() 返回结构化字典，覆盖所有事件类型
- 提取：event_type, session_id, cwd, tool_name, tool_input, tool_result, message, prompt

### Task 4: 创建 routers/sessions.py
路由前缀：/api/sessions
- GET /api/sessions → 按 last_seen_at 降序，最近 50 个 session（含 event count）
- GET /api/sessions/{session_id}/events → 该 session 最近 200 条事件（降序）

### Task 5: 重写 main.py 的 /hooks/claude 并新增 WebSocket
- /hooks/claude: 创建/更新 ClaudeSession + 插入 ClaudeEvent + 双频道广播
  - session:{session_id} → 单会话实时流
  - sessions → 全局会话概览
- 新增 /ws/sessions WebSocket endpoint
- 新增 /ws/session/{session_id} WebSocket endpoint
- app.include_router(sessions_router.router)

### Task 6: 更新 frontend/src/lib/api.ts
- 新增 ClaudeSession, ClaudeEvent TypeScript 接口
- 新增 api.sessions.list(), api.sessions.events(sessionId) 方法
- 新增 getWsUrl 相关：sessions WebSocket helper

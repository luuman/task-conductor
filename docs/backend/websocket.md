# WebSocket 实时通信

## ConnectionManager（ws/manager.py）

所有 WebSocket 连接由 `ConnectionManager` 单例统一管理，采用频道订阅模型：

```python
class ConnectionManager:
    active_connections: dict[str, list[WebSocket]] = {}

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
        # 发送给 channel 的所有连接，自动清理断连
```

## 三个 WebSocket 端点

### `/ws/task/{task_id}` — 任务日志

**订阅时机**：TaskPipeline 页面打开时

| type | data 字段 | 说明 |
|------|-----------|------|
| `log` | `{text: str}` | Claude 流式输出文本 |
| `stage_update` | `{stage, status, artifact}` | 阶段状态变化 |
| `task_done` | `{status: "done"}` | 任务完成 |
| `error` | `{message: str}` | 执行出错 |

### `/ws/sessions` — 全局会话概览

**订阅时机**：App.tsx 启动后（`useClaudeMonitor`）

| type | data 字段 | 说明 |
|------|-----------|------|
| `session_update` | `{session_id, status, event_type, tool_name, ...}` | 任意会话有新事件 |

数据流向：
```
Hook 事件 → /hooks/claude → broadcast("sessions", ...) → useClaudeMonitor
  → App.tsx liveEvents（最多 500 条） → Sessions 页面 / ClaudeMonitorPanel
```

### `/ws/session/{session_id}` — 单会话详情

**订阅时机**：Sessions 页面切换到某个会话的实时视图时

消息类型同 `session_update`，但只包含指定会话的事件。

## 消息格式

所有 WebSocket 消息统一格式：
```json
{
  "type": "log|stage_update|session_update|...",
  "data": {...},
  "ts": "2026-03-05T12:34:56.789Z"
}
```

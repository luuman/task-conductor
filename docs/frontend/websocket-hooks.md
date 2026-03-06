# 前端 WebSocket Hooks

## useTaskWs（任务实时日志）

```typescript
const { connected } = useTaskWs(taskId, (msg) => {
  if (msg.type === "log") appendLog(msg.data.text);
  if (msg.type === "stage_update") updateArtifact(msg.data);
});
```

- 连接 `/ws/task/{taskId}`
- 自动处理 JSON 解析
- 组件卸载时自动断开

## useClaudeMonitor（全局监听）

```typescript
const { status } = useClaudeMonitor(authed, (event) => {
  setLiveEvents(prev => [...prev.slice(-499), event]);
});
```

- 连接 `/ws/sessions`
- 断开 2 秒后自动重连
- `generation` counter 防止 stale callback
- 返回 status: `"connected"` | `"connecting"` | `"disconnected"`

### 实现细节

```typescript
export function useClaudeMonitor(enabled: boolean, onEvent: (e: ClaudeHookEvent) => void) {
  const ws = useRef<WebSocket | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const gen = ++generation.current;

    const connect = () => {
      const url = getWsUrl("/ws/sessions");
      ws.current = new WebSocket(url);

      ws.current.onmessage = (e) => {
        if (gen !== generation.current) return;  // 已失效
        const msg = JSON.parse(e.data);
        if (msg.type === "session_update") {
          onEvent({ data: msg.data, ts: msg.ts });
        }
      };

      ws.current.onclose = () => {
        if (gen !== generation.current) return;
        setTimeout(connect, 2000);  // 2秒重连
      };
    };

    connect();
    return () => { ws.current?.close(); };
  }, [enabled]);
}
```

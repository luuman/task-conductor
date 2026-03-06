# Claude 底层交互机制

TaskConductor 与 Claude 的交互分为两种完全独立的模式：**被动观测**（Hook）和**主动执行**（ClaudePool）。

## 被动观测：Claude Code Hooks

### 工作原理

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

### Hook Payload 格式（9 种事件）

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

**Stop**（回合结束）：
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

### tc-hook.sh 脚本

```bash
#!/bin/bash
# ~/.claude/hooks/tc-hook.sh — 由 install-hooks.sh 自动生成

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

### ~/.claude/settings.json 格式

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
    ]
  }
}
```

注意：`matcher: ""` 表示匹配所有工具，`timeout: 5` 是 Claude Code 级别的超时（脚本自身的 curl 还有 2 秒限制）。

### 后端接收逻辑（`POST /hooks/claude`）

```python
@app.post("/hooks/claude")
async def receive_claude_hook(request: Request):
    payload = await request.json()

    # 1. 解析事件
    event = parse_hook_event(payload)

    # 2. Upsert ClaudeSession（按 session_id）
    session = db.query(ClaudeSession).filter_by(session_id=event.session_id).first()
    if not session:
        session = ClaudeSession(session_id=event.session_id, cwd=payload.get("cwd", ""), ...)
        db.add(session)
    else:
        session.last_seen_at = datetime.utcnow()

    # 3. Insert ClaudeEvent
    db_event = ClaudeEvent(...)
    db.add(db_event)
    db.commit()

    # 4. 双频道广播
    await ws_manager.broadcast(f"session:{event.session_id}", "claude_event", {...})
    await ws_manager.broadcast("sessions", "session_update", {...})

    return {"ok": True}
```

### hooks.py 解析逻辑

```python
def parse_hook_event(payload: dict) -> HookEvent:
    event_type = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "")

    tool_name = payload.get("tool_name") or payload.get("tool")
    tool_input = payload.get("tool_input") or payload.get("input")
    tool_result = payload.get("tool_response") or payload.get("output")

    extra = {}
    if event_type == "Notification":
        extra["message"] = payload.get("message")
    elif event_type in ("Stop", "SessionEnd"):
        extra["stop_reason"] = payload.get("stop_reason")

    return HookEvent(...)
```

## 主动执行：ClaudePool（Headless 模式）

### 工作原理

流水线执行时，TaskConductor 通过 `ClaudePool.run()` 启动 Claude Code 子进程，以 `claude -p` headless 模式运行，获取结构化输出。

```
Pipeline Runner 调用 executor.run()
          ↓
executor._call_claude(task_id, prompt, cwd, log_file)
          ↓
ClaudePool.run() 启动子进程：
  claude -p "<prompt>" --output-format stream-json
          ↓
实时读取 stdout（stream-json 格式，每行一个 JSON 事件）
          ↓
日志写入 log_file + 广播文本给前端（/ws/task/{task_id}）
          ↓
收集完整输出，返回给 executor
```

### stream-json 输出格式

```json
{"type": "system", "subtype": "init", "session_id": "xxx", ...}
{"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": "分析开始..."}]}}
{"type": "result", "subtype": "success", "result": "最终输出文本", "usage": {...}}
```

### ClaudePool 核心实现

```python
class ClaudePool:
    _processes: dict[int, asyncio.subprocess.Process] = {}

    async def run(self, task_id: int, prompt: str, cwd: str, log_file: str) -> str:
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", prompt,
            "--output-format", "stream-json",
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._processes[task_id] = proc

        full_output = []
        async for line in proc.stdout:
            # 解析 stream-json → 写日志 → 广播 → 收集
            ...

        await proc.wait()
        del self._processes[task_id]
        return "".join(full_output)

    def kill(self, task_id: int):
        if task_id in self._processes:
            self._processes[task_id].terminate()
```

### Headless 模式与 Hook 的交叉

**通过 ClaudePool 启动的 headless 会话，如果本机已安装 Hook，也会触发 Hook 事件**。这意味着：
- Pipeline 执行的会话也会出现在 Sessions 监控页面
- 但其 `tool_input`/`tool_result` 可能为空

## 两种模式对比

| 维度 | Hook 被动观测 | ClaudePool 主动执行 |
|------|-------------|-------------------|
| 触发方式 | Claude Code 自动触发 | TaskConductor 主动调用 |
| 适用场景 | 监控任意交互式会话 | Pipeline 自动化任务 |
| 数据完整性 | 100%（所有工具调用） | 最终输出文本 |
| 执行控制 | 无（只观测） | 完全控制（可 kill） |
| 实时性 | 事件级实时推送 | 文本流实时广播 |
| 历史记录 | ClaudeEvent 表持久化 | log_file + StageArtifact |
| 会话来源 | 用户手动运行 claude | API 触发的 `claude -p` |

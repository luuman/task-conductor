# 性能监控与通知

## MetricsStore（内存存储，重启清零）

`backend/app/claude/metrics_store.py` 中的单例采集运行时指标：

### 采集的指标类型

| 指标 | 存储 | 说明 |
|------|------|------|
| TTFT（首字节时间） | deque(20) | 每次 Claude 调用的首字节响应时间 |
| 调用时长 | deque(20) | 完整 Claude 调用时间 |
| 成功率 | deque(50) | 调用成功/失败统计 |
| Token 消耗 | deque(1000) | 每次调用的输入/输出/缓存 token |
| 成本 | 计算字段 | 基于 Token 数量和模型定价计算 |
| 工具调用 | deque(2000) | 按工具类型分类统计 |
| IO 快照 | 实时采集 | CPU/内存/磁盘/网络 |

### 模型定价（USD/百万 Token）

```python
PRICING = {
    "claude-opus-4-6":   {"input": 15,   "output": 75,   "cache_write": 18.75, "cache_read": 1.50},
    "claude-sonnet-4-6": {"input": 3,    "output": 15,   "cache_write": 3.75,  "cache_read": 0.30},
    "claude-haiku-4-5":  {"input": 0.8,  "output": 4,    "cache_write": 1.0,   "cache_read": 0.08},
}
```

### GET /api/metrics 返回

```json
{
  "kpi": {
    "rating": 4.2,
    "interactions": 156,
    "uptime_percent": 98.7,
    "avg_response_ms": 1234
  },
  "claude_stats": {
    "ttft_avg": 0.85,
    "total_calls": 234,
    "success_count": 231,
    "total_tokens": 1567890,
    "total_cost_usd": 12.34
  },
  "weekly_stats": [{"day": "Mon", "tasks": 5, "success": 4}, ...]
}
```

### KPI 评分算法

```python
rating = success_rate * 3.0 + (approval_rate / 100) * 2.0
# 满分 5 分
```

## 通知与告警

### 触发时机

当 Pipeline 到达审批节点（`waiting_review`）时自动触发：

```python
async def notify_human_required(task, stage):
    msg = f"任务 {task.title} 的 {stage} 阶段需要审批"
    await _tts(msg)      # 小爱音箱播报
    await _webhook(msg)  # 外部 webhook
```

### TTS（tts.py）

写入 `speak-pipe`（FIFO 管道），由小爱音箱客户端读取并播报：
```python
async def _tts(text):
    pipe_path = os.environ.get("SPEAK_PIPE")
    if os.path.exists(pipe_path):
        with open(pipe_path, "w") as f:
            f.write(text + "\n")
```

### Webhook（webhook.py）

```python
async def _webhook(text):
    url = os.environ.get("WEBHOOK_URL")
    if url:
        await client.post(url, json={"text": text}, timeout=5)
```

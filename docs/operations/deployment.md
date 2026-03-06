# 部署与运维

## 快速启动

```bash
# 一键启动（首次或重启）
bash start.sh

# 访问地址
# 前端: http://localhost:7070
# 后端 API: http://localhost:8765
# API 文档: http://localhost:8765/docs（SwaggerUI）

# 安装 Claude Code Hooks（每台机器执行一次）
bash scripts/install-hooks.sh [agent-url]
# 默认 agent-url = http://localhost:8765
```

## 单独启动

```bash
# 后端
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload

# 前端
cd frontend && npm run dev
```

## 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TC_PIN` | 随机6位 | 固定 PIN（开发/测试用） |
| `TC_TUNNEL` | `0` | 是否启用 Cloudflare Tunnel |
| `TC_AGENT_URL` | `http://localhost:8765` | Hook 上报地址（跨机使用时设置） |
| `TC_LOG_DIR` | `/tmp/tc-logs` | Pipeline 执行日志目录 |
| `SPEAK_PIPE` | `/tmp/speak-pipe` | 小爱音箱 FIFO 路径 |
| `WEBHOOK_URL` | 无 | 审批通知 webhook URL |
| `SECRET_KEY` | 内置默认值 | JWT 签名密钥（生产环境必须修改） |

## Cloudflare Tunnel 远程访问

当 `TC_TUNNEL=1` 时：
1. 服务启动时自动运行 `cloudflared tunnel`
2. 生成唯一的 `https://*.trycloudflare.com` URL
3. 在控制台打印 URL 和 PIN，供远程设备访问
4. 前端 Login 页面需要手动输入该 URL

也支持外部独立启动 cloudflared：
```bash
cloudflared tunnel --url http://localhost:8765
```
此时后端会通过请求 Host header 自动检测公网 URL，在设置页显示。

## 数据库维护

```bash
# 数据库文件位置
backend/task_conductor.db

# 查看表内容
cd backend && source .venv/bin/activate
python -c "
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    rows = conn.execute(text('SELECT * FROM claude_session LIMIT 10')).fetchall()
    print(rows)
"
```

## 测试

```bash
# 后端测试
cd backend && source .venv/bin/activate && pytest

# 前端类型检查
cd frontend && npx tsc --noEmit
```

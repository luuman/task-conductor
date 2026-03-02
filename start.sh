#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "====================================="
echo "  TaskConductor V2 启动"
echo "====================================="
echo ""
echo "V2 新特性："
echo "  - PIN 鉴权：启动后控制台会打印 6 位 PIN 码"
echo "  - Cloudflare Tunnel：自动生成公网 HTTPS URL（需安装 cloudflared）"
echo "  - Claude Code Hooks：安装后可自动同步 Claude 任务状态"
echo "    安装命令: bash $ROOT_DIR/scripts/install-hooks.sh"
echo ""

# 启动后端
echo "[1/2] 启动 FastAPI 后端..."
cd "$ROOT_DIR/backend"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID  → http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo "  PIN 码将在后端启动日志中显示（搜索 'PIN'）"

# 等待后端就绪
sleep 2

# 启动前端
echo "[2/2] 启动 React 前端..."
cd "$ROOT_DIR/frontend"
npm run dev -- --port 3010 &
FRONTEND_PID=$!
echo "  前端 PID: $FRONTEND_PID  → http://localhost:3010"

echo ""
echo "====================================="
echo "  TaskConductor V2 已启动"
echo "  前端: http://localhost:3010"
echo "  后端: http://localhost:8000"
echo "  API:  http://localhost:8000/docs"
echo "  远程访问: 前端 → Connection 页查看 Tunnel URL 和 PIN"
echo "====================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "echo ''; echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait

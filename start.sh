#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "====================================="
echo "  TaskConductor 启动"
echo "====================================="

# 启动后端
echo "[1/2] 启动 FastAPI 后端..."
cd "$ROOT_DIR/backend"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID  → http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"

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
echo "  TaskConductor 已启动"
echo "  前端: http://localhost:3010"
echo "  后端: http://localhost:8000"
echo "  API:  http://localhost:8000/docs"
echo "====================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "echo ''; echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait

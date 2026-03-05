#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "====================================="
echo "  TaskConductor 启动"
echo "====================================="
echo ""

# ── 1. 安装/更新 Claude Code Hooks ────────────────────────────
echo "[1/3] 安装 Claude Code Hooks..."
if bash "$ROOT_DIR/scripts/install-hooks.sh" 2>/dev/null; then
  echo "  ✓ Hooks 已就绪，Claude 会话将自动上报"
else
  echo "  ⚠ Hooks 安装失败（不影响启动，可手动运行 scripts/install-hooks.sh）"
fi
echo ""

# ── 2. 启动后端 ───────────────────────────────────────────────
echo "[2/3] 启动 FastAPI 后端..."
cd "$ROOT_DIR/backend"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID  → http://localhost:8765"

# 等待后端就绪
sleep 2

# ── 3. 启动前端 ───────────────────────────────────────────────
echo "[3/3] 启动 React 前端..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  前端 PID: $FRONTEND_PID  → http://localhost:7070"

echo ""
echo "====================================="
echo "  TaskConductor 已启动"
echo "  前端: http://localhost:7070"
echo "  后端: http://localhost:8765"
echo "  远程: 前端 → Connection 页查看 Tunnel URL 和 PIN"
echo "====================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "echo ''; echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait

#!/bin/bash
# 截取页面完整长图并发送到飞书
#
# 用法:
#   bash scripts/screenshot-to-feishu.sh <URL> [选项]
#
# 示例:
#   # 截图并发送到飞书
#   bash scripts/screenshot-to-feishu.sh http://localhost:7071/admin/server
#
#   # 附带消息
#   bash scripts/screenshot-to-feishu.sh http://localhost:7071/admin/server -m "测试完成"
#
#   # 仅截图保存到本地
#   bash scripts/screenshot-to-feishu.sh http://localhost:7071/admin/server --no-feishu -o screenshot.png
#
#   # 需要登录的页面（传入 token）
#   bash scripts/screenshot-to-feishu.sh http://localhost:7071/admin/server --token "eyJ..."
#
#   # 通过 API 调用（后端需要运行中）
#   curl -X POST http://localhost:8765/api/tools/screenshot \
#     -H "Content-Type: application/json" \
#     -d '{"url": "http://localhost:7071/admin/server", "message": "测试完成"}'

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 加载飞书环境变量（如果 start.sh 中定义了）
export FEISHU_APP_ID="${FEISHU_APP_ID:-cli_a9f48f35d2f89cbb}"
export FEISHU_APP_SECRET="${FEISHU_APP_SECRET:-5cz3PaxWnriPczxKT0h5Sga5wQzFs2Ub}"
export FEISHU_DEFAULT_CHAT_ID="${FEISHU_DEFAULT_CHAT_ID:-oc_8691fff3781dda15c173c85a47ced3c9}"

# 清除 socks 代理（飞书 API 不支持）
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY 2>/dev/null || true
export no_proxy="*"

cd "$ROOT_DIR/backend"
source .venv/bin/activate 2>/dev/null || true

python -m app.utils.page_screenshot "$@"

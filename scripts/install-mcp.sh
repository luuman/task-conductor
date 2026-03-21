#!/usr/bin/env bash
# 将 TaskConductor MCP Server 注册到 Claude Code
# 用法: bash scripts/install-mcp.sh [url]
# 默认: http://localhost:8765

set -euo pipefail

URL="${1:-http://localhost:8765}"
MCP_URL="${URL}/mcp"
CLAUDE_JSON="$HOME/.claude.json"

echo "📡 注册 TaskConductor MCP Server"
echo "   URL: $MCP_URL"
echo "   配置: $CLAUDE_JSON"

# 确保 ~/.claude.json 存在
if [ ! -f "$CLAUDE_JSON" ]; then
    echo '{}' > "$CLAUDE_JSON"
fi

# 用 python 安全地修改 JSON（避免 jq 依赖）
python3 -c "
import json, sys

path = '$CLAUDE_JSON'
url = '$MCP_URL'

with open(path, 'r') as f:
    data = json.load(f)

servers = data.setdefault('mcpServers', {})
servers['task-conductor'] = {
    'url': url + '/sse'
}

with open(path, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f'✅ 已注册 task-conductor → {url}')
"

echo ""
echo "🎉 安装完成！重启 Claude Code 后即可使用 TaskConductor 工具。"
echo "   确保后端已启动: bash start.sh"

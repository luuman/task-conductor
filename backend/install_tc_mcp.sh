#!/usr/bin/env bash
# 将 TaskConductor MCP 工具注册到 Claude Code
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_SCRIPT="$SCRIPT_DIR/tc_mcp_server.py"
CLAUDE_JSON="$HOME/.claude.json"

if [ ! -f "$CLAUDE_JSON" ]; then
  echo '{}' > "$CLAUDE_JSON"
fi

python3 - <<PYEOF
import json, sys
path = "$CLAUDE_JSON"
script = "$MCP_SCRIPT"
with open(path) as f:
    data = json.load(f)
data.setdefault("mcpServers", {})["task-conductor"] = {
    "type": "stdio",
    "command": "python3",
    "args": [script],
    "env": {
        "TC_BASE_URL": "http://localhost:8765",
        "NO_PROXY": "localhost,127.0.0.1",
        "no_proxy": "localhost,127.0.0.1"
    }
}
with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print("✅ TaskConductor MCP 工具已注册到 Claude Code")
print("   重启 Claude Code 后生效")
PYEOF

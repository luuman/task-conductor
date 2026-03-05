#!/usr/bin/env bash
# TaskConductor Claude Code Hooks 安装脚本
# 用法：bash scripts/install-hooks.sh [agent-url]
#   默认 agent-url: http://localhost:8765

set -euo pipefail

AGENT_URL="${1:-http://localhost:8765}"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "=== TaskConductor Hooks Installer ==="
echo "Agent URL: $AGENT_URL"

# 1. 创建 hooks 目录
mkdir -p "$HOOKS_DIR"

# 2. 写入 hook 脚本（从 stdin 读取 Claude Code 的 JSON payload，POST 到 Agent）
cat > "$HOOKS_DIR/tc-hook.sh" << 'HOOK_SCRIPT'
#!/usr/bin/env bash
# TaskConductor Claude Code Hook 上报脚本
# Claude Code 通过 stdin 传入 JSON payload，本脚本转发给 TaskConductor Agent

AGENT_URL="${TC_AGENT_URL:-http://localhost:8765}"

PAYLOAD=$(cat)

# 非阻塞 POST，失败不影响 Claude Code 主流程
# --noproxy "*" 跳过系统代理，确保 localhost 请求直连
curl -s -X POST "$AGENT_URL/hooks/claude" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --noproxy "*" \
  --max-time 2 \
  2>/dev/null || true

exit 0
HOOK_SCRIPT

chmod +x "$HOOKS_DIR/tc-hook.sh"
echo "✓ Hook script installed: $HOOKS_DIR/tc-hook.sh"

# 3. 更新 ~/.claude/settings.json（使用 Claude Code 要求的正确格式）
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

python3 - << PYTHON_SCRIPT
import json

settings_file = "$SETTINGS_FILE"
hook_cmd = "$HOOKS_DIR/tc-hook.sh"

with open(settings_file, 'r') as f:
    settings = json.load(f)

if 'hooks' not in settings:
    settings['hooks'] = {}

hooks = settings['hooks']

# Claude Code 要求的格式：
# "EventName": [{"matcher": "", "hooks": [{"type": "command", "command": "..."}]}]
# 注册所有关键生命周期事件
events = [
    'PreToolUse',        # 工具调用前（可拦截）
    'PostToolUse',       # 工具调用后
    'PostToolUseFailure',# 工具调用失败后
    'Stop',              # Claude 完成响应
    'SessionStart',      # 会话开始/恢复
    'SessionEnd',        # 会话结束
    'Notification',      # Claude 等待用户输入
    'SubagentStart',     # 子 agent 启动
    'SubagentStop',      # 子 agent 结束
]

tc_hook_entry = {
    "type": "command",
    "command": hook_cmd,
    "timeout": 5,
}

for event in events:
    if event not in hooks:
        hooks[event] = []

    # 检查是否已注册（避免重复）
    already_registered = False
    for group in hooks[event]:
        if isinstance(group, dict):
            for h in group.get('hooks', []):
                if isinstance(h, dict) and h.get('command', '').endswith('tc-hook.sh'):
                    already_registered = True
                    break
        if already_registered:
            break

    if not already_registered:
        hooks[event].append({
            "matcher": "",
            "hooks": [tc_hook_entry]
        })

with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)

print(f"✓ Updated {settings_file}")
PYTHON_SCRIPT

echo ""
echo "=== 安装完成 ==="
echo "已注册以下 Claude Code Hook 事件："
echo "  - PreToolUse / PostToolUse / PostToolUseFailure"
echo "  - Stop"
echo "  - SessionStart / SessionEnd"
echo "  - Notification"
echo "  - SubagentStart / SubagentStop"
echo ""
echo "Claude Code 事件将自动上报到: $AGENT_URL/hooks/claude"
echo ""
echo "提示：可通过环境变量覆盖 Agent URL："
echo "  TC_AGENT_URL=https://xxx.trycloudflare.com bash $HOOKS_DIR/tc-hook.sh"
echo ""
echo "验证方式（在另一终端运行 claude 后观察日志）："
echo "  curl $AGENT_URL/api/sessions"

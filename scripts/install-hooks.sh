#!/usr/bin/env bash
# TaskConductor Claude Code Hooks 安装脚本
# 用法：bash scripts/install-hooks.sh [--agent-url http://localhost:8000]

set -euo pipefail

AGENT_URL="${1:-http://localhost:8000}"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "=== TaskConductor Hooks Installer ==="
echo "Agent URL: $AGENT_URL"

# 1. 创建 hooks 目录
mkdir -p "$HOOKS_DIR"

# 2. 写入 hook 脚本
cat > "$HOOKS_DIR/tc-hook.sh" << 'HOOK_SCRIPT'
#!/usr/bin/env bash
# TaskConductor Claude Code Hook
# 将 hook 事件 POST 到 TaskConductor Agent

AGENT_URL="${TC_AGENT_URL:-http://localhost:8000}"

# 从 stdin 读取 hook payload（Claude Code 通过 stdin 传入）
PAYLOAD=$(cat)

# 非阻塞 POST，失败不影响 Claude Code 主流程
curl -s -X POST "$AGENT_URL/hooks/claude" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 2 \
  --silent \
  --fail \
  2>/dev/null || true

exit 0
HOOK_SCRIPT

chmod +x "$HOOKS_DIR/tc-hook.sh"
echo "✓ Hook script installed: $HOOKS_DIR/tc-hook.sh"

# 3. 更新 ~/.claude/settings.json
# 如果文件不存在，创建基础结构
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# 使用 python3 合并 hooks 配置（避免 jq 依赖）
python3 - << PYTHON_SCRIPT
import json
import sys

settings_file = "$SETTINGS_FILE"
hook_script = "$HOOKS_DIR/tc-hook.sh"

with open(settings_file, 'r') as f:
    settings = json.load(f)

# 确保 hooks 键存在
if 'hooks' not in settings:
    settings['hooks'] = {}

hooks = settings['hooks']

# 注册三种 hook 事件
for event in ['PreToolUse', 'PostToolUse', 'Stop']:
    if event not in hooks:
        hooks[event] = []

    # 检查是否已有 tc-hook
    has_tc_hook = any(
        h.get('command', '').endswith('tc-hook.sh')
        for h in hooks[event]
        if isinstance(h, dict)
    )

    if not has_tc_hook:
        hooks[event].append({
            'command': hook_script,
            'description': 'TaskConductor hook reporter'
        })

with open(settings_file, 'w') as f:
    json.dump(settings, f, indent=2)

print(f"✓ Updated {settings_file}")
PYTHON_SCRIPT

echo ""
echo "=== 安装完成 ==="
echo "Hooks 已注册到 Claude Code："
echo "  - PreToolUse"
echo "  - PostToolUse"
echo "  - Stop"
echo ""
echo "Claude Code 工具调用事件将自动 POST 到: $AGENT_URL/hooks/claude"
echo ""
echo "提示：可通过环境变量覆盖 Agent URL："
echo "  TC_AGENT_URL=https://xxx.trycloudflare.com bash $HOOKS_DIR/tc-hook.sh"

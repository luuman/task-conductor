#!/bin/bash
# screenshot-feishu.sh — Stop hook: 从 Claude 回复中提取 [screenshot:URL] 标记，截图发飞书
# 仅在 Stop 事件触发，静默失败不阻塞 Claude

set -o pipefail

# 从 stdin 读取 hook JSON
INPUT=$(cat)

# 只处理 Stop 事件
EVENT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hook_event_name',''))" 2>/dev/null)
[ "$EVENT" != "Stop" ] && exit 0

# 提取 message 字段中的 [screenshot:URL] 标记
URL=$(echo "$INPUT" | python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    msg = data.get('message', '') or ''
    # 也检查 stop_response / transcript 等可能的字段
    if not msg:
        msg = json.dumps(data)
    m = re.search(r'\[screenshot:(https?://[^\]]+)\]', msg)
    if m:
        print(m.group(1))
except:
    pass
" 2>/dev/null)

[ -z "$URL" ] && exit 0

# 获取项目根目录
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 异步执行截图（不阻塞 Claude）
nohup bash "$ROOT_DIR/scripts/screenshot-to-feishu.sh" "$URL" -m "开发完成截图" >/dev/null 2>&1 &

exit 0

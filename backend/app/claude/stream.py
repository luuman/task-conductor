import json
from typing import Optional

def parse_line(line: str) -> Optional[dict]:
    """解析 Claude Code stream-json 格式的单行输出"""
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None

def extract_text(event: dict) -> Optional[str]:
    """从事件中提取可读文本内容"""
    if event.get("type") == "assistant":
        msg = event.get("message", {})
        texts = [b.get("text", "") for b in msg.get("content", [])
                 if isinstance(b, dict) and b.get("type") == "text"]
        return "".join(texts) if texts else None
    if event.get("type") == "text":
        return event.get("content", "")
    if event.get("type") == "result":
        return event.get("result", "")
    return None

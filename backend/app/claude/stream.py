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
    """从事件中提取可读文本内容（支持流式增量）"""
    etype = event.get("type", "")

    # 流式增量文本（最常见，每几个 token 触发一次）
    if etype == "content_block_delta":
        delta = event.get("delta", {})
        if delta.get("type") == "text_delta":
            return delta.get("text", "")

    # 完整助手消息（非流式或最终结果）
    if etype == "assistant":
        msg = event.get("message", {})
        texts = [b.get("text", "") for b in msg.get("content", [])
                 if isinstance(b, dict) and b.get("type") == "text"]
        return "".join(texts) if texts else None

    # 纯文本事件
    if etype == "text":
        return event.get("content", "")

    # 最终结果
    if etype == "result":
        return event.get("result", "")

    return None

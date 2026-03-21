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
    """从事件中提取流式增量文本（仅 chunk，不含最终 result）"""
    etype = event.get("type", "")

    # 流式增量文本（最常见，每几个 token 触发一次）
    if etype == "content_block_delta":
        delta = event.get("delta", {})
        if delta.get("type") == "text_delta":
            return delta.get("text", "")

    # 纯文本事件
    if etype == "text":
        return event.get("content", "")

    # 注意：不处理 "assistant" 和 "result"，它们包含完整文本会导致重复
    return None


def extract_final_text(event: dict) -> Optional[str]:
    """从最终事件中提取完整文本（用于 chat_done 的 full_text 兜底）"""
    etype = event.get("type", "")

    if etype == "result":
        return event.get("result", "")

    if etype == "assistant":
        msg = event.get("message", {})
        texts = [b.get("text", "") for b in msg.get("content", [])
                 if isinstance(b, dict) and b.get("type") == "text"]
        return "".join(texts) if texts else None

    return None

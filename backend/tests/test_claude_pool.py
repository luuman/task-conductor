"""ClaudePool 单元测试（基于 ClaudeSDKClient）"""

from app.claude.pool import ClaudePool
from app.claude.stream import parse_line, extract_text


def test_pool_singleton():
    pool1 = ClaudePool()
    pool2 = ClaudePool()
    assert pool1 is pool2


def test_pool_has_clients_dict():
    pool = ClaudePool()
    assert hasattr(pool, "_clients")
    assert isinstance(pool._clients, dict)


def test_kill_nonexistent_task_is_noop():
    pool = ClaudePool()
    # 不应抛出异常
    pool.kill(999999)


# ── stream.py 工具函数（仍然可用于日志解析等场景）──


def test_parse_stream_json_line_text():
    line = '{"type":"text","content":"hello"}'
    result = parse_line(line)
    assert result is not None
    assert result["type"] == "text"
    assert result["content"] == "hello"


def test_parse_invalid_line_returns_none():
    assert parse_line("not json") is None
    assert parse_line("") is None
    assert parse_line("   ") is None


def test_extract_text_from_text_event():
    event = {"type": "text", "content": "hello world"}
    assert extract_text(event) == "hello world"


def test_extract_text_from_content_block_delta():
    event = {
        "type": "content_block_delta",
        "delta": {"type": "text_delta", "text": "streaming chunk"},
    }
    assert extract_text(event) == "streaming chunk"


def test_extract_text_from_unknown_returns_none():
    event = {"type": "tool_use", "name": "bash"}
    assert extract_text(event) is None

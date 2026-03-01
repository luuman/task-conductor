from app.claude.pool import ClaudePool
from app.claude.stream import parse_line, extract_text

def test_pool_singleton():
    pool1 = ClaudePool()
    pool2 = ClaudePool()
    assert pool1 is pool2

def test_build_claude_command():
    pool = ClaudePool()
    cmd = pool.build_command("实现登录功能", "/tmp/worktree-1")
    assert cmd[0] == "claude"
    assert "-p" in cmd
    assert "实现登录功能" in cmd
    assert "--output-format" in cmd
    assert "stream-json" in cmd
    assert "--dangerously-skip-permissions" in cmd

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

def test_extract_text_from_result_event():
    event = {"type": "result", "result": "done"}
    assert extract_text(event) == "done"

def test_extract_text_from_unknown_returns_none():
    event = {"type": "tool_use", "name": "bash"}
    assert extract_text(event) is None

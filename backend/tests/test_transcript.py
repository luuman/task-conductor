# transcript 解析函数测试
# 测试 app/routers/sessions.py 中的 _extract_tool_result_text 和 _note_to_dict

from app.routers.sessions import _extract_tool_result_text, _note_to_dict


# ── _extract_tool_result_text ────────────────────────────────────

def test_extract_string_input():
    assert _extract_tool_result_text("hello world") == "hello world"


def test_extract_list_with_text_block():
    content = [{"type": "text", "text": "result here"}]
    assert _extract_tool_result_text(content) == "result here"


def test_extract_list_skips_non_text():
    content = [{"type": "image", "url": "x"}, {"type": "text", "text": "found"}]
    assert _extract_tool_result_text(content) == "found"


def test_extract_empty_list():
    assert _extract_tool_result_text([]) == ""


def test_extract_none():
    assert _extract_tool_result_text(None) == ""


def test_extract_int():
    # 非 str 非 list，返回空字符串
    assert _extract_tool_result_text(123) == ""


def test_extract_truncation():
    long_str = "x" * 10000
    result = _extract_tool_result_text(long_str)
    assert len(result) == 5000


def test_extract_list_truncation():
    long_text = "y" * 10000
    content = [{"type": "text", "text": long_text}]
    result = _extract_tool_result_text(content)
    assert len(result) == 5000


# ── _note_to_dict ────────────────────────────────────────────────

def test_note_to_dict_none():
    result = _note_to_dict(None)
    assert result == {"alias": None, "notes": None, "tags": [], "linked_task_id": None}


class FakeNote:
    """模拟 ConversationNote ORM 对象。"""
    def __init__(self, alias=None, notes=None, tags=None, linked_task_id=None):
        self.alias = alias
        self.notes = notes
        self.tags = tags
        self.linked_task_id = linked_task_id


def test_note_to_dict_with_values():
    note = FakeNote(alias="my-session", notes="重要会话", tags='["bug", "fix"]', linked_task_id=5)
    result = _note_to_dict(note)
    assert result["alias"] == "my-session"
    assert result["notes"] == "重要会话"
    assert result["tags"] == ["bug", "fix"]
    assert result["linked_task_id"] == 5


def test_note_to_dict_invalid_tags_json():
    note = FakeNote(tags="not-valid-json")
    result = _note_to_dict(note)
    assert result["tags"] == []


def test_note_to_dict_empty_tags():
    note = FakeNote(tags=None)
    result = _note_to_dict(note)
    assert result["tags"] == []


def test_note_to_dict_empty_string_tags():
    note = FakeNote(tags="")
    result = _note_to_dict(note)
    # 空字符串 → tags 为 falsy，不进入 json.loads 分支
    assert result["tags"] == []

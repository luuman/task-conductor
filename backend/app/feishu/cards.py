"""飞书 MessageCard 模板构建函数。"""

from __future__ import annotations

import json

# ------------------------------------------------------------------
# 颜色常量
# ------------------------------------------------------------------
BLUE = "blue"
RED = "red"
ORANGE = "orange"
GREEN = "green"

MAX_CONTENT_LEN = 3000


def _header(title: str, color: str) -> dict:
    return {"title": {"tag": "plain_text", "content": title}, "template": color}


def _markdown(text: str) -> dict:
    return {"tag": "markdown", "content": text}


def _note(*texts: str) -> dict:
    return {
        "tag": "note",
        "elements": [{"tag": "plain_text", "content": t} for t in texts],
    }


def _divider() -> dict:
    return {"tag": "hr"}


def _action(*buttons: dict) -> dict:
    return {"tag": "action", "actions": list(buttons)}


def _button(text: str, value: dict, *, type: str = "default") -> dict:  # noqa: A002
    return {
        "tag": "button",
        "text": {"tag": "plain_text", "content": text},
        "type": type,
        "value": value,
    }


# ------------------------------------------------------------------
# 卡片模板
# ------------------------------------------------------------------


def build_result_card(content: str, cost_ms: int = 0, cwd: str = "") -> dict:
    """Claude 执行结果卡片。"""
    if len(content) > MAX_CONTENT_LEN:
        content = content[:MAX_CONTENT_LEN] + "\n\n... (内容已截断)"

    note_parts: list[str] = []
    if cost_ms:
        note_parts.append(f"耗时 {cost_ms}ms")
    if cwd:
        note_parts.append(f"目录 {cwd}")

    elements: list[dict] = [_markdown(content)]
    if note_parts:
        elements.append(_divider())
        elements.append(_note(" | ".join(note_parts)))

    return {
        "header": _header("Claude Code", BLUE),
        "elements": elements,
    }


def build_thinking_card() -> dict:
    """思考中占位卡片。"""
    return {
        "header": _header("Claude Code", BLUE),
        "elements": [_markdown("⏳ 正在思考...")],
    }


def build_error_card(error: str) -> dict:
    """错误卡片。"""
    return {
        "header": _header("执行失败", RED),
        "elements": [_markdown(f"```\n{error}\n```")],
    }


def build_approval_card(
    task_id: int,
    stage: str,
    summary: str,
    confidence: int = 0,
) -> dict:
    """Pipeline 审批卡片。"""
    info_lines = [
        f"**任务 ID**: {task_id}",
        f"**置信度**: {confidence}%",
        f"**摘要**: {summary}",
    ]

    approve_value = json.dumps({"action": "approve", "task_id": task_id})
    reject_value = json.dumps({"action": "reject", "task_id": task_id})

    return {
        "header": _header(f"{stage} 阶段完成 - 待审批", ORANGE),
        "elements": [
            _markdown("\n".join(info_lines)),
            _divider(),
            _action(
                _button("✅ 通过", {"value": approve_value}, type="primary"),
                _button("❌ 驳回", {"value": reject_value}, type="danger"),
            ),
        ],
    }


def build_approved_card(task_id: int, stage: str, action: str) -> dict:
    """审批完成后更新的卡片。"""
    if action == "approve":
        color = GREEN
        label = "已通过"
    else:
        color = RED
        label = "已驳回"

    return {
        "header": _header(f"{stage} 阶段 - {label}", color),
        "elements": [
            _markdown(f"**任务 ID**: {task_id}\n**结果**: {label}"),
        ],
    }


def build_task_created_card(task_id: int, title: str, project_name: str) -> dict:
    """任务创建通知卡片。"""
    return {
        "header": _header("新任务已创建", GREEN),
        "elements": [
            _markdown(
                f"**项目**: {project_name}\n**任务**: {title}\n**ID**: {task_id}"
            ),
        ],
    }


def build_welcome_card(project_name: str) -> dict:
    """项目群欢迎卡片。"""
    return {
        "header": _header(f"欢迎加入 {project_name}", BLUE),
        "elements": [
            _markdown(
                "本群已接入 **TaskConductor** AI 任务编排系统。\n\n"
                "**对话模式**：直接发送消息即可与 Claude 对话。\n\n"
                "**创建任务**：发送 `/task 任务描述` 可创建流水线任务。"
            ),
        ],
    }

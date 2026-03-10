"""飞书 MessageCard 模板构建函数（JSON 2.0 schema）。

飞书卡片 markdown 组件支持：加粗、斜体、删除线、链接、代码块、
有序/无序列表（7.6+）、<font color>彩色文本、@用户。
不支持：# 标题、表格语法。
"""

from __future__ import annotations

import json
import re

# ------------------------------------------------------------------
# 颜色常量
# ------------------------------------------------------------------
BLUE = "blue"
RED = "red"
ORANGE = "orange"
GREEN = "green"

MAX_CONTENT_LEN = 3000


def _to_feishu_md(text: str) -> str:
    """将标准 Markdown 转为飞书卡片兼容格式。

    仅转换飞书不支持的语法：# 标题 → 加粗，表格 → 纯文本。
    其余（加粗/列表/代码块/链接等）飞书原生支持，保持不变。
    """
    lines = text.split("\n")
    result: list[str] = []
    in_code_block = False

    for line in lines:
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            result.append(line)
            continue
        if in_code_block:
            result.append(line)
            continue

        # # 标题 → **标题**
        m = re.match(r"^(#{1,6})\s+(.+)$", line)
        if m:
            result.append(f"**{m.group(2).strip()}**")
            continue

        # 跳过表格分隔行 |---|---|
        if re.match(r"^\|[\s\-:|]+\|$", line):
            continue

        # 表格行 | a | b | → a  b
        if line.strip().startswith("|") and line.strip().endswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            result.append("  ".join(cells))
            continue

        result.append(line)

    return "\n".join(result)


# ------------------------------------------------------------------
# JSON 2.0 卡片构建器
# ------------------------------------------------------------------


def _card(header_title: str, color: str, elements: list[dict]) -> dict:
    """构建飞书卡片（兼容 send_card 和 update_card）。"""
    return {
        "header": {
            "title": {"tag": "plain_text", "content": header_title},
            "template": color,
        },
        "elements": elements,
    }


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
    content = _to_feishu_md(content)
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

    return _card("Claude Code", BLUE, elements)


def build_thinking_card() -> dict:
    """思考中占位卡片。"""
    return _card("Claude Code", BLUE, [_markdown("⏳ 正在思考...")])


def build_error_card(error: str) -> dict:
    """错误卡片。"""
    return _card("执行失败", RED, [_markdown(f"```\n{error}\n```")])


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

    return _card(f"{stage} 阶段完成 - 待审批", ORANGE, [
        _markdown("\n".join(info_lines)),
        _divider(),
        _action(
            _button("✅ 通过", {"value": approve_value}, type="primary"),
            _button("❌ 驳回", {"value": reject_value}, type="danger"),
        ),
    ])


def build_approved_card(task_id: int, stage: str, action: str) -> dict:
    """审批完成后更新的卡片。"""
    if action == "approve":
        color = GREEN
        label = "已通过"
    else:
        color = RED
        label = "已驳回"

    return _card(f"{stage} 阶段 - {label}", color, [
        _markdown(f"**任务 ID**: {task_id}\n**结果**: {label}"),
    ])


def build_task_created_card(task_id: int, title: str, project_name: str) -> dict:
    """任务创建通知卡片。"""
    return _card("新任务已创建", GREEN, [
        _markdown(
            f"**项目**: {project_name}\n**任务**: {title}\n**ID**: {task_id}"
        ),
    ])


FRONTEND_URLS = [
    "https://luuman.github.io/task-conductor/",
    "https://192.168.1.12/task-conductor/",
]


def build_startup_card(
    pin: str,
    backend_url: str,
    frontend_urls: list[str] | None = None,
    ssh_host: str = "",
    ssh_port: int = 22,
    ssh_user: str = "",
) -> dict:
    """服务启动通知卡片，含一键连接链接。"""
    import base64

    if frontend_urls is None:
        frontend_urls = FRONTEND_URLS

    config: dict = {"type": "tunnel", "tunnelUrl": backend_url, "pin": pin}
    encoded = base64.b64encode(json.dumps(config).encode()).decode()

    lines = [
        f"**后端地址**: `{backend_url}`",
        f"**PIN 码**: `{pin}`",
    ]
    if ssh_host:
        lines.append(
            f"**SSH 隧道**: `ssh -L 8765:localhost:8765 {ssh_user}@{ssh_host} -p {ssh_port}`"
        )

    labels = ["一键连接（外网）", "一键连接（局域网）"]
    buttons = [
        {
            "tag": "button",
            "text": {"tag": "plain_text", "content": labels[i] if i < len(labels) else "一键连接"},
            "type": "primary" if i == 0 else "default",
            "url": f"{url}?connect={encoded}",
        }
        for i, url in enumerate(frontend_urls)
    ]

    return _card("TaskConductor 已启动 🚀", GREEN, [
        _markdown("\n".join(lines)),
        _divider(),
        {"tag": "action", "actions": buttons},
    ])


def build_shutdown_card() -> dict:
    """服务关闭通知卡片。"""
    return _card("TaskConductor 已关闭 🔴", RED, [
        _markdown("服务已正常关闭。"),
    ])


def build_welcome_card(project_name: str) -> dict:
    """项目群欢迎卡片。"""
    return _card(f"欢迎加入 {project_name}", BLUE, [
        _markdown(
            "本群已接入 **TaskConductor** AI 任务编排系统。\n\n"
            "**对话模式**：直接发送消息即可与 Claude 对话。\n\n"
            "**创建任务**：发送 `/task 任务描述` 可创建流水线任务。"
        ),
    ])

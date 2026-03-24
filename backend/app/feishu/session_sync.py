"""Claude Code 会话 → 飞书话题群同步。

在 Stop Hook 触发时调用，读取会话 JSONL 提取最后一轮对话，
以飞书 post 富文本格式发送到话题群。

用法：
    from app.feishu.session_sync import sync_turn_to_feishu
    await sync_turn_to_feishu(session_id, cwd)
"""

from __future__ import annotations

import ast
import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any

from .client import feishu_client
from .md_to_post import build_post_body, extract_urls, markdown_to_post_content

logger = logging.getLogger(__name__)

# Claude Code 会话存储根目录
_CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"

# 链接截图过滤：跳过 API / git / file / localhost API 类型的链接
_SKIP_URL_PATTERNS = [
    re.compile(r"^https?://localhost[:/].*?/api/"),
    re.compile(r"^https?://127\.0\.0\.1[:/].*?/api/"),
    re.compile(r"^git[@:]"),
    re.compile(r"^file://"),
    re.compile(r"\.git$"),
    re.compile(r"^https?://github\.com/.*/(commit|tree|blob)/"),
]


def _should_screenshot(url: str) -> bool:
    """判断 URL 是否适合截图。"""
    for pat in _SKIP_URL_PATTERNS:
        if pat.search(url):
            return False
    return url.startswith("http://") or url.startswith("https://")


def _cwd_to_project_hash(cwd: str) -> str:
    """将 cwd 路径转为 Claude Code 的 project hash 目录名。

    例如 /home/user/project → -home-user-project
    """
    return cwd.replace("/", "-")


def _find_jsonl(session_id: str, cwd: str) -> Path | None:
    """定位会话 JSONL 文件。"""
    project_hash = _cwd_to_project_hash(cwd)
    jsonl_path = _CLAUDE_PROJECTS_DIR / project_hash / f"{session_id}.jsonl"
    if jsonl_path.exists():
        return jsonl_path

    # 尝试遍历所有项目目录（cwd 可能是子目录）
    for d in _CLAUDE_PROJECTS_DIR.iterdir():
        if not d.is_dir():
            continue
        candidate = d / f"{session_id}.jsonl"
        if candidate.exists():
            return candidate

    return None


def _parse_message(raw: str | dict) -> dict | None:
    """解析 JSONL 条目中的 message 字段（可能是 str(dict) 格式）。"""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return ast.literal_eval(raw)
        except Exception:
            try:
                return json.loads(raw)
            except Exception:
                return None
    return None


def read_last_turn(jsonl_path: Path) -> tuple[str, str] | None:
    """从 JSONL 读取最后一轮用户提问和 Claude 回答。

    返回 (user_question, assistant_answer) 或 None。

    策略：从尾部扫描，找最后一条用户纯文本消息及其后的所有 assistant text 块。
    """
    entries: list[dict] = []
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    if not entries:
        return None

    # 收集所有 user 纯文本消息的索引和内容
    user_turns: list[tuple[int, str]] = []
    for i, entry in enumerate(entries):
        if entry.get("type") != "user":
            continue
        msg = _parse_message(entry.get("message", ""))
        if not msg:
            continue
        content = msg.get("content", "")
        if isinstance(content, str) and content.strip():
            user_turns.append((i, content))
        elif isinstance(content, list):
            # 只取纯文本 block（跳过 tool_result）
            text_parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif isinstance(block, str):
                    text_parts.append(block)
            combined = "\n".join(text_parts).strip()
            if combined:
                user_turns.append((i, combined))

    if not user_turns:
        return None

    # 最后一轮用户消息
    last_user_idx, user_question = user_turns[-1]

    # 收集该 user 消息之后的所有 assistant text 块
    assistant_texts: list[str] = []
    for entry in entries[last_user_idx + 1:]:
        if entry.get("type") == "user":
            # 碰到下一个 user 消息就停止
            msg = _parse_message(entry.get("message", ""))
            if msg:
                c = msg.get("content", "")
                # 只有纯文本 user 消息才算新一轮（tool_result 不算）
                if isinstance(c, str) and c.strip():
                    break
                if isinstance(c, list) and any(
                    isinstance(b, dict) and b.get("type") == "text" for b in c
                ):
                    break
            continue

        if entry.get("type") != "assistant":
            continue

        msg = _parse_message(entry.get("message", ""))
        if not msg:
            continue

        content = msg.get("content", [])
        if not isinstance(content, list):
            continue

        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text", "").strip()
                if text:
                    assistant_texts.append(text)

    if not assistant_texts:
        return None

    assistant_answer = "\n\n".join(assistant_texts)
    return (user_question, assistant_answer)


async def _screenshot_and_reply(
    topic_msg_id: str,
    url: str,
    chat_id: str,
) -> None:
    """异步截图并回复到话题。"""
    try:
        from ..utils.page_screenshot import capture_and_send, upload_to_feishu

        from ..utils.page_screenshot import take_screenshot

        result = await take_screenshot(url, wait_ms=5000)
        if not result.success or not result.image_path:
            # 截图失败，发文本说明
            content = build_post_body(
                "",
                [[{"tag": "text", "text": f"🔗 {url}\n⚠ 截图失败: {result.error or '未知错误'}"}]],
            )
            await feishu_client.reply_message(topic_msg_id, "post", content)
            return

        # 上传图片到飞书
        image_key = await upload_to_feishu(result.image_path)
        if not image_key:
            content = build_post_body(
                "",
                [[{"tag": "text", "text": f"🔗 {url}\n⚠ 图片上传飞书失败"}]],
            )
            await feishu_client.reply_message(topic_msg_id, "post", content)
            return

        # 发送图片 + URL 标注
        post_content: list[list[dict[str, Any]]] = [
            [{"tag": "text", "text": "🔗 "}, {"tag": "a", "text": url, "href": url}],
            [{"tag": "img", "image_key": image_key}],
        ]
        content = build_post_body("", post_content)
        await feishu_client.reply_message(topic_msg_id, "post", content)
        logger.info("[SessionSync] 截图已发送: %s", url)

    except Exception:
        logger.warning("[SessionSync] 截图发送失败: %s", url, exc_info=True)


async def sync_turn_to_feishu(
    session_id: str,
    cwd: str,
    chat_id: str,
    *,
    enable_screenshot: bool = True,
) -> str | None:
    """将最后一轮对话同步到飞书话题群。

    Args:
        session_id: Claude Code 会话 ID
        cwd: 工作目录
        chat_id: 飞书群聊 ID
        enable_screenshot: 是否对链接进行截图

    Returns:
        话题消息 ID，失败返回 None
    """
    if not feishu_client.enabled:
        logger.debug("[SessionSync] 飞书未启用")
        return None

    # 1. 定位 JSONL
    jsonl_path = _find_jsonl(session_id, cwd)
    if not jsonl_path:
        logger.warning("[SessionSync] 未找到 JSONL: session=%s cwd=%s", session_id, cwd)
        return None

    # 2. 读取最后一轮对话
    turn = read_last_turn(jsonl_path)
    if not turn:
        logger.info("[SessionSync] 未提取到有效对话: session=%s", session_id)
        return None

    user_question, assistant_answer = turn

    # 3. 构建话题标题（用户提问，截断 50 字）
    title = user_question[:50].replace("\n", " ")
    if len(user_question) > 50:
        title += "..."

    # 4. 发送用户提问作为话题第一条消息
    question_content = markdown_to_post_content(user_question)
    # 在前面加上 💬 标记
    if question_content and question_content[0]:
        first_el = question_content[0][0]
        if first_el.get("tag") == "text":
            first_el["text"] = "💬 " + first_el["text"]
        else:
            question_content[0].insert(0, {"tag": "text", "text": "💬 "})
    else:
        question_content = [[{"tag": "text", "text": "💬 " + user_question[:200]}]]

    question_body = build_post_body(title, question_content)

    try:
        topic_msg_id = await feishu_client.send_message(chat_id, "post", question_body)
    except Exception:
        logger.warning("[SessionSync] 发送话题消息失败", exc_info=True)
        return None

    if not topic_msg_id:
        return None

    # 5. 回复 Claude 的回答
    answer_content = markdown_to_post_content(assistant_answer)
    if not answer_content:
        answer_content = [[{"tag": "text", "text": assistant_answer[:3000]}]]

    # 飞书 post 消息有大小限制，如果太长则分段发送
    # 粗略估算：每个段落平均 200 字节 JSON，限制在 100 个段落以内
    MAX_PARAGRAPHS = 100
    chunks: list[list[list[dict[str, Any]]]] = []
    for i in range(0, len(answer_content), MAX_PARAGRAPHS):
        chunks.append(answer_content[i:i + MAX_PARAGRAPHS])

    for chunk in chunks:
        answer_body = build_post_body("", chunk)
        try:
            await feishu_client.reply_message(topic_msg_id, "post", answer_body)
        except Exception:
            logger.warning("[SessionSync] 回复 Claude 回答失败", exc_info=True)

    # 6. 提取链接并异步截图
    if enable_screenshot:
        urls = extract_urls(assistant_answer)
        screenshottable = [u for u in urls if _should_screenshot(u)]
        for url in screenshottable[:5]:  # 限制最多 5 个截图
            asyncio.create_task(_screenshot_and_reply(topic_msg_id, url, chat_id))

    logger.info(
        "[SessionSync] 会话已同步到飞书: session=%s topic=%s",
        session_id, topic_msg_id,
    )
    return topic_msg_id

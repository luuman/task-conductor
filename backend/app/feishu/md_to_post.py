"""Markdown → 飞书 post 富文本 content 转换器。

飞书 post 消息的 content 结构为 list[list[dict]]，每个内层 list 是一个段落。
支持的标签：text(bold/italic/underline/lineThrough), a, code_block, img。

用法：
    from app.feishu.md_to_post import markdown_to_post_content
    content = markdown_to_post_content("# Hello\n**world**")
    # → [[{"tag":"text","text":"Hello","style":["bold"]}], ...]
"""

from __future__ import annotations

import re
from typing import Any

# 飞书 post code_block 支持的语言列表（常用子集）
_SUPPORTED_LANGS = {
    "python", "java", "go", "javascript", "typescript", "c", "cpp", "c++",
    "rust", "ruby", "php", "swift", "kotlin", "scala", "shell", "bash",
    "sql", "html", "css", "json", "yaml", "xml", "markdown", "plaintext",
}

# 匹配 Markdown 链接 [text](url)
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
# 匹配加粗 **text** 或 __text__
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")
# 匹配斜体 *text* 或 _text_（不匹配已被加粗消耗的 *）
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)")
# 匹配行内代码 `code`
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
# 匹配独立 URL（未被 []() 包裹的 http/https 链接）
_BARE_URL_RE = re.compile(r"(?<!\()(https?://[^\s\)>\]]+)")


def _text(content: str, style: list[str] | None = None) -> dict[str, Any]:
    """构建 text 标签。"""
    tag: dict[str, Any] = {"tag": "text", "text": content}
    if style:
        tag["style"] = style
    return tag


def _link(text: str, href: str) -> dict[str, Any]:
    """构建 a 标签。"""
    return {"tag": "a", "text": text, "href": href}


def _code_block(code: str, language: str = "") -> list[dict[str, Any]]:
    """构建 code_block 段落（独占一个段落）。"""
    lang = language.lower().strip() if language else ""
    if lang not in _SUPPORTED_LANGS:
        lang = "plaintext"
    return [{"tag": "code_block", "language": lang, "text": code}]


def _parse_inline(text: str) -> list[dict[str, Any]]:
    """解析一行文本中的内联元素（加粗、斜体、链接、行内代码）。

    按出现位置排序，依次处理各种内联标记，未匹配部分作为普通文本。
    """
    if not text:
        return []

    # 收集所有匹配项及其位置
    segments: list[tuple[int, int, dict[str, Any]]] = []

    # 链接
    for m in _LINK_RE.finditer(text):
        segments.append((m.start(), m.end(), _link(m.group(1), m.group(2))))

    # 行内代码（优先级高于加粗/斜体）
    for m in _INLINE_CODE_RE.finditer(text):
        # 检查是否和已有段落重叠
        if not _overlaps(segments, m.start(), m.end()):
            segments.append((m.start(), m.end(), _text(m.group(1), ["italic"])))

    # 加粗
    for m in _BOLD_RE.finditer(text):
        if not _overlaps(segments, m.start(), m.end()):
            content = m.group(1) or m.group(2)
            segments.append((m.start(), m.end(), _text(content, ["bold"])))

    # 斜体
    for m in _ITALIC_RE.finditer(text):
        if not _overlaps(segments, m.start(), m.end()):
            content = m.group(1) or m.group(2)
            segments.append((m.start(), m.end(), _text(content, ["italic"])))

    # 按位置排序
    segments.sort(key=lambda s: s[0])

    # 填充未匹配的普通文本
    result: list[dict[str, Any]] = []
    pos = 0
    for start, end, tag in segments:
        if start > pos:
            result.append(_text(text[pos:start]))
        result.append(tag)
        pos = end
    if pos < len(text):
        result.append(_text(text[pos:]))

    return result if result else [_text(text)]


def _overlaps(segments: list[tuple[int, int, Any]], start: int, end: int) -> bool:
    """检查 [start, end) 是否和已有段落重叠。"""
    return any(not (end <= s or start >= e) for s, e, _ in segments)


def markdown_to_post_content(md: str) -> list[list[dict[str, Any]]]:
    """将 Markdown 文本转换为飞书 post content 结构。

    Returns:
        list[list[dict]] — 外层 list 是段落，内层 list 是该段落的内联元素。
    """
    lines = md.split("\n")
    paragraphs: list[list[dict[str, Any]]] = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # ── 代码块 ───────────────────────────────────
        if line.strip().startswith("```"):
            lang = line.strip().removeprefix("```").strip()
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            paragraphs.append(_code_block("\n".join(code_lines), lang))
            i += 1  # 跳过结束 ```
            continue

        # ── 空行（段落分隔）──────────────────────────
        if not line.strip():
            i += 1
            continue

        # ── 分割线 --- / *** / ___ ────────────────────
        if re.match(r"^[-*_]{3,}\s*$", line.strip()):
            paragraphs.append([_text("─" * 20)])
            i += 1
            continue

        # ── 标题 # ────────────────────────────────────
        m = re.match(r"^(#{1,6})\s+(.+)$", line)
        if m:
            paragraphs.append([_text(m.group(2).strip(), ["bold"])])
            i += 1
            continue

        # ── 表格行（收集连续的表格行，转为 code_block）──
        if line.strip().startswith("|") and line.strip().endswith("|"):
            table_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                # 跳过分隔行 |---|---|
                if not re.match(r"^\|[\s\-:|]+\|$", lines[i].strip()):
                    table_lines.append(lines[i])
                i += 1
            if table_lines:
                paragraphs.append(_code_block("\n".join(table_lines), "plaintext"))
            continue

        # ── 无序列表 - / * / + ────────────────────────
        m_ul = re.match(r"^(\s*)[-*+]\s+(.+)$", line)
        if m_ul:
            indent = len(m_ul.group(1)) // 2
            prefix = "  " * indent + "• "
            paragraphs.append(_parse_inline(prefix + m_ul.group(2)))
            i += 1
            continue

        # ── 有序列表 1. ───────────────────────────────
        m_ol = re.match(r"^(\s*)(\d+)\.\s+(.+)$", line)
        if m_ol:
            indent = len(m_ol.group(1)) // 2
            prefix = "  " * indent + m_ol.group(2) + ". "
            paragraphs.append(_parse_inline(prefix + m_ol.group(3)))
            i += 1
            continue

        # ── 引用 > ───────────────────────────────────
        if line.strip().startswith(">"):
            quote_text = line.strip().removeprefix(">").strip()
            elements = _parse_inline("│ " + quote_text)
            # 引用用斜体标记
            for el in elements:
                if el["tag"] == "text" and "style" not in el:
                    el["style"] = ["italic"]
            paragraphs.append(elements)
            i += 1
            continue

        # ── 普通段落 ──────────────────────────────────
        paragraphs.append(_parse_inline(line))
        i += 1

    return paragraphs


def extract_urls(md: str) -> list[str]:
    """从 Markdown 文本中提取所有 URL。

    提取 [text](url) 中的 url 和独立的 http/https 链接。
    去重并保持顺序。
    """
    urls: list[str] = []
    seen: set[str] = set()

    # [text](url)
    for m in _LINK_RE.finditer(md):
        url = m.group(2)
        if url not in seen:
            urls.append(url)
            seen.add(url)

    # 独立 URL
    for m in _BARE_URL_RE.finditer(md):
        url = m.group(1)
        if url not in seen:
            urls.append(url)
            seen.add(url)

    return urls


def build_post_body(
    title: str,
    content: list[list[dict[str, Any]]],
    lang: str = "zh_cn",
) -> str:
    """构建完整的飞书 post 消息 body（JSON 字符串）。"""
    import json

    return json.dumps({lang: {"title": title, "content": content}}, ensure_ascii=False)

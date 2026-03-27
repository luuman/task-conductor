#!/usr/bin/env python3
"""飞书会话转发展示格式对比测试。

创建 4 个群（2 普通 + 2 话题），用相同的 Claude 对话内容测试不同展示方案：
  群 1 (普通): 方案 A — 富文本卡片（MessageCard）
  群 2 (普通): 方案 B — Post 富文本消息
  群 3 (话题): 方案 C — 话题帖子（问题为根，回答为回复）
  群 4 (话题): 方案 D — 卡片摘要 + Post 详情回复

用法:
    cd backend && source .venv/bin/activate
    export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx FEISHU_OWNER_ID=ou_xxx
    python ../scripts/test_feishu_formats.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time

# 把 backend/app 加入 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import httpx

# ── 配置 ──────────────────────────────────────────────────────────────

APP_ID = os.getenv("FEISHU_APP_ID", "cli_a9f48f35d2f89cbb")
APP_SECRET = os.getenv("FEISHU_APP_SECRET", "5cz3PaxWnriPczxKT0h5Sga5wQzFs2Ub")
OWNER_ID = os.getenv("FEISHU_OWNER_ID", "ou_79d283543cc0c01a4483a55ac049cdc2")

API = "https://open.feishu.cn/open-apis"

# ── 模拟对话内容 ──────────────────────────────────────────────────────

SAMPLE_QUESTION = """帮我看看 backend/app/main.py 中的健康检查逻辑，有没有什么问题？"""

SAMPLE_ANSWER = """\
我检查了 `backend/app/main.py` 中的健康检查实现，发现以下几个问题：

## 1. 缺少数据库连通性检查

当前的 `/health` 端点只返回了静态响应，没有实际检查数据库连接：

```python
@app.get("/health")
async def health():
    return {"status": "ok"}
```

**建议**：增加 DB 连通性验证：

```python
@app.get("/health")
async def health():
    try:
        with Session(engine) as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return JSONResponse({"status": "error", "db": str(e)}, status_code=503)
```

## 2. 没有超时保护

如果数据库响应慢，健康检查会一直阻塞。建议添加 `asyncio.wait_for` 设置 3 秒超时。

## 3. 缺少版本信息

健康检查响应中应该包含版本号，方便排查部署问题：

| 字段 | 说明 | 示例 |
|------|------|------|
| status | 服务状态 | ok / error |
| version | 版本号 | 1.2.3 |
| uptime | 运行时间 | 3600s |
| db | 数据库状态 | connected |

## 总结

- 核心问题是**健康检查没有实际检查依赖服务**，在生产环境中可能导致负载均衡器将请求路由到不健康的实例
- 建议优先修复 DB 检查，其次加超时和版本信息
"""

SAMPLE_META = {
    "session_id": "abc-123-def-456",
    "cwd": "/home/sichengli/Documents/code2/task-conductor",
    "project": "TaskConductor",
    "duration_ms": 4523,
    "tools_used": ["Read", "Grep", "Edit"],
    "model": "claude-opus-4-6",
}


# ── HTTP 工具 ─────────────────────────────────────────────────────────

_token_cache: dict[str, str | float] = {"token": "", "expires": 0.0}


async def get_token(client: httpx.AsyncClient) -> str:
    if _token_cache["token"] and time.time() < _token_cache["expires"]:
        return _token_cache["token"]
    resp = await client.post(
        f"{API}/auth/v3/tenant_access_token/internal",
        json={"app_id": APP_ID, "app_secret": APP_SECRET},
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["token"] = data["tenant_access_token"]
    _token_cache["expires"] = time.time() + data.get("expire", 7200) - 60
    return _token_cache["token"]


async def headers(client: httpx.AsyncClient) -> dict:
    token = await get_token(client)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}


async def create_group(client: httpx.AsyncClient, name: str, *, topic: bool = False) -> str:
    """创建群聊，返回 chat_id。"""
    h = await headers(client)
    body: dict = {"name": name}
    if topic:
        body["chat_mode"] = "topic"
    if OWNER_ID:
        body["owner_id"] = OWNER_ID
    resp = await client.post(f"{API}/im/v1/chats", headers=h, json=body)
    resp.raise_for_status()
    data = resp.json().get("data", {})
    chat_id = data.get("chat_id", "")
    print(f"  ✅ 创建群 [{name}] → {chat_id} (topic={topic})")
    return chat_id


async def send_msg(client: httpx.AsyncClient, chat_id: str, msg_type: str, content: str) -> str:
    h = await headers(client)
    resp = await client.post(
        f"{API}/im/v1/messages",
        headers=h,
        params={"receive_id_type": "chat_id"},
        json={"receive_id": chat_id, "msg_type": msg_type, "content": content},
    )
    resp.raise_for_status()
    return resp.json().get("data", {}).get("message_id", "")


async def reply_msg(client: httpx.AsyncClient, msg_id: str, msg_type: str, content: str) -> str:
    h = await headers(client)
    resp = await client.post(
        f"{API}/im/v1/messages/{msg_id}/reply",
        headers=h,
        json={"msg_type": msg_type, "content": content},
    )
    resp.raise_for_status()
    return resp.json().get("data", {}).get("message_id", "")


# ── 方案 A: 富文本卡片 ───────────────────────────────────────────────

def _feishu_md(text: str) -> str:
    """标准 Markdown → 飞书卡片 Markdown。"""
    import re as _re
    lines = text.split("\n")
    result = []
    in_code = False
    for line in lines:
        if line.strip().startswith("```"):
            in_code = not in_code
            result.append(line)
            continue
        if in_code:
            result.append(line)
            continue
        m = _re.match(r"^(#{1,6})\s+(.+)$", line)
        if m:
            result.append(f"**{m.group(2).strip()}**")
            continue
        if _re.match(r"^\|[\s\-:|]+\|$", line.strip()):
            continue
        if line.strip().startswith("|") and line.strip().endswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            result.append("  ".join(cells))
            continue
        result.append(line)
    return "\n".join(result)


async def format_a_card(client: httpx.AsyncClient, chat_id: str):
    """方案 A: 单张富文本卡片，包含问题、回答、元信息。"""
    q_md = SAMPLE_QUESTION.strip()
    a_md = _feishu_md(SAMPLE_ANSWER)
    if len(a_md) > 2800:
        a_md = a_md[:2800] + "\n\n... (内容已截断)"

    tools_str = " / ".join(SAMPLE_META["tools_used"])
    card = {
        "header": {
            "title": {"tag": "plain_text", "content": "💬 Claude 对话"},
            "template": "blue",
        },
        "elements": [
            # 用户问题区
            {"tag": "markdown", "content": f"**🧑 提问**\n{q_md}"},
            {"tag": "hr"},
            # Claude 回答区
            {"tag": "markdown", "content": f"**🤖 回答**\n{a_md}"},
            {"tag": "hr"},
            # 元信息
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content":
                        f"📁 {SAMPLE_META['project']} | "
                        f"⏱ {SAMPLE_META['duration_ms']}ms | "
                        f"🔧 {tools_str} | "
                        f"🧠 {SAMPLE_META['model']}"},
                ],
            },
        ],
    }
    msg_id = await send_msg(client, chat_id, "interactive", json.dumps(card))
    print(f"  📤 方案 A (卡片) → msg={msg_id}")


# ── 方案 B: Post 富文本 ──────────────────────────────────────────────

def _md_to_post(md: str) -> list[list[dict]]:
    """简化版 Markdown → 飞书 post content。"""
    # 复用 app 的转换器
    try:
        from app.feishu.md_to_post import markdown_to_post_content
        return markdown_to_post_content(md)
    except ImportError:
        # fallback: 纯文本
        return [[{"tag": "text", "text": md[:3000]}]]


async def format_b_post(client: httpx.AsyncClient, chat_id: str):
    """方案 B: Post 富文本消息，问题和回答合在一条消息里。"""
    # 构建 post content
    paragraphs: list[list[dict]] = []

    # 用户问题
    paragraphs.append([{"tag": "text", "text": "💬 提问", "style": ["bold"]}])
    paragraphs.append([{"tag": "text", "text": SAMPLE_QUESTION.strip()}])
    paragraphs.append([{"tag": "text", "text": "─" * 30}])

    # Claude 回答
    paragraphs.append([{"tag": "text", "text": "🤖 回答", "style": ["bold"]}])
    answer_content = _md_to_post(SAMPLE_ANSWER)
    paragraphs.extend(answer_content)

    # 元信息
    paragraphs.append([{"tag": "text", "text": "─" * 30}])
    tools_str = " / ".join(SAMPLE_META["tools_used"])
    paragraphs.append([{
        "tag": "text",
        "text": f"📁 {SAMPLE_META['project']} | ⏱ {SAMPLE_META['duration_ms']}ms | 🔧 {tools_str}",
        "style": ["italic"],
    }])

    body = json.dumps({"zh_cn": {"title": "Claude 对话记录", "content": paragraphs}}, ensure_ascii=False)
    msg_id = await send_msg(client, chat_id, "post", body)
    print(f"  📤 方案 B (Post) → msg={msg_id}")


# ── 方案 C: 话题帖子 ─────────────────────────────────────────────────

async def format_c_topic(client: httpx.AsyncClient, chat_id: str):
    """方案 C: 话题群 — 用户问题作为话题根消息，Claude 回答作为回复。"""
    # 1. 发送用户问题作为话题根
    q_content = [[
        {"tag": "text", "text": "💬 ", "style": ["bold"]},
        {"tag": "text", "text": SAMPLE_QUESTION.strip()},
    ]]
    q_body = json.dumps({"zh_cn": {"title": SAMPLE_QUESTION[:30] + "...", "content": q_content}}, ensure_ascii=False)
    root_id = await send_msg(client, chat_id, "post", q_body)

    # 2. 回复 Claude 回答（Post 富文本）
    answer_content = _md_to_post(SAMPLE_ANSWER)
    if not answer_content:
        answer_content = [[{"tag": "text", "text": SAMPLE_ANSWER[:3000]}]]
    a_body = json.dumps({"zh_cn": {"title": "", "content": answer_content}}, ensure_ascii=False)
    reply_id = await reply_msg(client, root_id, "post", a_body)

    # 3. 回复元信息
    tools_str = " / ".join(SAMPLE_META["tools_used"])
    meta_content = [[{
        "tag": "text",
        "text": f"📁 {SAMPLE_META['project']} | ⏱ {SAMPLE_META['duration_ms']}ms | 🔧 {tools_str} | 🧠 {SAMPLE_META['model']}",
        "style": ["italic"],
    }]]
    meta_body = json.dumps({"zh_cn": {"title": "", "content": meta_content}}, ensure_ascii=False)
    await reply_msg(client, root_id, "post", meta_body)

    print(f"  📤 方案 C (话题) → root={root_id}, reply={reply_id}")


# ── 方案 D: 卡片摘要 + 话题详情 ──────────────────────────────────────

async def format_d_hybrid(client: httpx.AsyncClient, chat_id: str):
    """方案 D: 话题群 — 卡片摘要作为根消息，Post 详情作为回复。"""
    # 1. 发送摘要卡片作为话题根
    q_short = SAMPLE_QUESTION.strip()[:80]
    # 从回答中提取第一个要点作为摘要
    summary_lines = []
    for line in SAMPLE_ANSWER.split("\n"):
        if line.startswith("## "):
            summary_lines.append("• " + line[3:].strip())
    summary = "\n".join(summary_lines[:4]) if summary_lines else SAMPLE_ANSWER[:200]

    tools_str = " / ".join(SAMPLE_META["tools_used"])
    card = {
        "header": {
            "title": {"tag": "plain_text", "content": f"💬 {q_short}"},
            "template": "blue",
        },
        "elements": [
            {"tag": "markdown", "content": f"**发现 {len(summary_lines)} 个问题：**\n{_feishu_md(summary)}"},
            {"tag": "hr"},
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content":
                        f"📁 {SAMPLE_META['project']} | "
                        f"⏱ {SAMPLE_META['duration_ms']}ms | "
                        f"🔧 {tools_str}"},
                ],
            },
            {"tag": "markdown", "content": "👇 **展开话题查看完整回答**"},
        ],
    }
    root_id = await send_msg(client, chat_id, "interactive", json.dumps(card))

    # 2. 回复完整回答（Post 富文本）
    answer_content = _md_to_post(SAMPLE_ANSWER)
    if not answer_content:
        answer_content = [[{"tag": "text", "text": SAMPLE_ANSWER[:3000]}]]

    # 分段发送（飞书 post 有大小限制）
    MAX_PARA = 80
    for i in range(0, len(answer_content), MAX_PARA):
        chunk = answer_content[i:i + MAX_PARA]
        a_body = json.dumps({"zh_cn": {"title": "🤖 完整回答" if i == 0 else "", "content": chunk}}, ensure_ascii=False)
        await reply_msg(client, root_id, "post", a_body)

    print(f"  📤 方案 D (混合) → root={root_id}")


# ── 主流程 ────────────────────────────────────────────────────────────

async def main():
    print("=" * 60)
    print("飞书会话转发展示格式对比测试")
    print("=" * 60)

    if not APP_ID or not APP_SECRET:
        print("❌ 请设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET")
        sys.exit(1)

    # 跳过 socks 代理，使用 HTTP 代理
    proxy = os.getenv("https_proxy") or os.getenv("http_proxy") or None
    if proxy and proxy.startswith("socks"):
        proxy = None
    async with httpx.AsyncClient(timeout=15, proxy=proxy) as client:
        # 1. 创建测试群
        print("\n📋 创建测试群...")
        ts = time.strftime("%H:%M")
        g1 = await create_group(client, f"[测试A] 卡片展示 {ts}", topic=False)
        g2 = await create_group(client, f"[测试B] Post展示 {ts}", topic=False)
        g3 = await create_group(client, f"[测试C] 话题帖子 {ts}", topic=True)
        g4 = await create_group(client, f"[测试D] 卡片+话题 {ts}", topic=True)

        # 2. 发送测试内容
        print("\n📤 发送测试内容...")
        print(f"\n  --- 群 1: 方案 A (富文本卡片) ---")
        await format_a_card(client, g1)

        print(f"\n  --- 群 2: 方案 B (Post 富文本) ---")
        await format_b_post(client, g2)

        print(f"\n  --- 群 3: 方案 C (话题帖子) ---")
        await format_c_topic(client, g3)

        print(f"\n  --- 群 4: 方案 D (卡片 + 话题) ---")
        await format_d_hybrid(client, g4)

        # 3. 汇总
        print("\n" + "=" * 60)
        print("✅ 测试完成！请在飞书中对比以下群的展示效果：")
        print(f"  A. 富文本卡片（普通群）  → {g1}")
        print(f"  B. Post 富文本（普通群） → {g2}")
        print(f"  C. 话题帖子（话题群）    → {g3}")
        print(f"  D. 卡片+话题（话题群）   → {g4}")
        print("=" * 60)

        # 保存群 ID 到文件，方便后续清理
        result = {"groups": {
            "A_card": g1,
            "B_post": g2,
            "C_topic": g3,
            "D_hybrid": g4,
        }}
        result_path = os.path.join(os.path.dirname(__file__), "test_feishu_groups.json")
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n群 ID 已保存到 {result_path}")


if __name__ == "__main__":
    asyncio.run(main())

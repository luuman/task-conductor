"""测试飞书富文本消息发送（post 类型）"""

import asyncio
import json
import os
import sys

# 设置环境变量（从 start.sh 中获取）
os.environ.setdefault("FEISHU_APP_ID", "cli_a9f48f35d2f89cbb")
os.environ.setdefault("FEISHU_APP_SECRET", "5cz3PaxWnriPczxKT0h5Sga5wQzFs2Ub")

sys.path.insert(0, os.path.dirname(__file__))

from app.feishu.client import FeishuClient

CHAT_ID = "oc_8691fff3781dda15c173c85a47ced3c9"


async def test_post_message():
    """发送飞书富文本（post）消息"""
    client = FeishuClient()
    print(f"飞书已启用: {client.enabled}")

    # ── 富文本内容（飞书 post 格式）──────────────────
    post_content = {
        "zh_cn": {
            "title": "TaskConductor 富文本测试",
            "content": [
                # 第一段
                [
                    {"tag": "text", "text": "这是一条 "},
                    {"tag": "text", "text": "富文本测试消息", "style": ["bold"]},
                    {"tag": "text", "text": "，来自 TaskConductor 🚀"},
                ],
                # 第二段：带链接
                [
                    {"tag": "text", "text": "项目地址: "},
                    {"tag": "a", "text": "GitHub", "href": "https://github.com/luuman/task-conductor"},
                ],
                # 第三段：模拟 HTML 表格效果
                [
                    {"tag": "text", "text": "\n📊 任务概览", "style": ["bold"]},
                ],
                [
                    {"tag": "text", "text": "• 需求分析: ✅ 完成"},
                ],
                [
                    {"tag": "text", "text": "• PRD 文档: ✅ 完成"},
                ],
                [
                    {"tag": "text", "text": "• 开发实现: 🔄 进行中"},
                ],
                [
                    {"tag": "text", "text": "• 测试验证: ⏳ 待开始"},
                ],
                # 代码块
                [
                    {"tag": "text", "text": "\n💻 示例代码:", "style": ["bold"]},
                ],
                [
                    {"tag": "code_block", "language": "python", "text": 'from app.feishu.client import FeishuClient\nclient = FeishuClient()\nawait client.send_message(chat_id, "post", content)'},
                ],
                # 分隔
                [
                    {"tag": "text", "text": "\n—— 以上为富文本 post 消息测试 ——", "style": ["italic"]},
                ],
            ],
        }
    }

    msg_id = await client.send_message(
        CHAT_ID, "post", json.dumps(post_content)
    )
    print(f"✅ 富文本消息已发送, message_id: {msg_id}")


async def test_card_with_html_preview():
    """用卡片消息模拟 HTML 预览效果"""
    client = FeishuClient()

    # 飞书卡片 markdown 支持有限 HTML-like 格式
    card = {
        "header": {
            "title": {"tag": "plain_text", "content": "HTML 内容预览"},
            "template": "blue",
        },
        "elements": [
            {
                "tag": "markdown",
                "content": (
                    "**TaskConductor Dashboard**\n\n"
                    '<font color="green">● 运行中</font> | '
                    '<font color="orange">● 2 个待审批</font> | '
                    '<font color="red">● 1 个失败</font>\n\n'
                    "---\n\n"
                    "**项目列表**\n"
                    "1. 🏗️ **task-conductor** — 进度 75%\n"
                    "2. 📱 **mobile-app** — 进度 30%\n"
                    "3. 🌐 **web-portal** — 进度 90%\n\n"
                    "```python\n"
                    "# 启动流水线\n"
                    "pipeline.run(task_id=42)\n"
                    "```"
                ),
            },
            {"tag": "hr"},
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content": "由 TaskConductor 自动生成 | 2026-03-18"},
                ],
            },
        ],
    }

    msg_id = await client.send_card(CHAT_ID, card)
    print(f"✅ 卡片消息已发送, message_id: {msg_id}")


async def test_upload_html_file():
    """上传 HTML 文件并发送文件消息"""
    client = FeishuClient()

    # 先上传文件获取 file_key
    html_path = os.path.join(
        os.path.dirname(__file__),
        "..", "frontend", "public", "card-fan-demo.html"
    )
    if not os.path.exists(html_path):
        print(f"❌ 文件不存在: {html_path}")
        return

    token = await client.get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}

    import httpx

    # 上传文件到飞书
    async with httpx.AsyncClient(timeout=30) as http:
        with open(html_path, "rb") as f:
            resp = await http.post(
                "https://open.feishu.cn/open-apis/im/v1/files",
                headers=headers,
                data={
                    "file_type": "stream",
                    "file_name": "demo.html",
                },
                files={"file": ("demo.html", f, "text/html")},
            )
            resp.raise_for_status()
            data = resp.json()
            print(f"上传响应: {json.dumps(data, ensure_ascii=False, indent=2)}")

            file_key = data.get("data", {}).get("file_key", "")
            if not file_key:
                print("❌ 上传失败，未获取 file_key")
                return

    # 发送文件消息
    file_content = json.dumps({"file_key": file_key})
    msg_id = await client.send_message(CHAT_ID, "file", file_content)
    print(f"✅ HTML 文件已发送, message_id: {msg_id}")


async def main():
    print("=" * 50)
    print("飞书消息发送测试")
    print("=" * 50)

    print("\n--- 1. 富文本 (post) 消息 ---")
    await test_post_message()

    print("\n--- 2. 卡片 (interactive) 消息 ---")
    await test_card_with_html_preview()

    print("\n--- 3. 上传 HTML 文件 ---")
    await test_upload_html_file()


if __name__ == "__main__":
    asyncio.run(main())

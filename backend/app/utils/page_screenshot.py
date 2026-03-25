"""
页面截图 + 飞书发送工具

核心能力：
1. 用 Playwright 无头浏览器打开任意 URL
2. 展开滚动容器，截取完整长图（侧边栏/顶栏只出现一次）
3. 可选：上传到飞书并发送到指定群聊

用法：
    # Python
    from app.utils.page_screenshot import capture_and_send
    result = await capture_and_send("http://localhost:7071/admin/server")

    # CLI
    python -m app.utils.page_screenshot http://localhost:7071/admin/server

    # API
    POST /api/tools/screenshot
    {"url": "http://localhost:7071/admin/server", "send_feishu": true}
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx


def _client(timeout: int = 30) -> httpx.AsyncClient:
    """创建不走代理的 httpx 客户端"""
    return httpx.AsyncClient(timeout=timeout, proxy=None)


@dataclass
class ScreenshotResult:
    """截图结果"""
    success: bool
    image_path: str | None = None
    width: int = 0
    height: int = 0
    feishu_sent: bool = False
    feishu_image_key: str | None = None
    error: str | None = None
    duration_ms: int = 0


# JS: 展开滚动容器，让页面全高渲染
_JS_EXPAND = """
() => {
    const all = document.querySelectorAll('div');
    let scrollEl = null;
    for (const el of all) {
        const cs = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 100
            && (cs.overflowY === 'auto' || cs.overflowY === 'scroll')) {
            scrollEl = el;
            break;
        }
    }
    if (!scrollEl) return { expanded: false, height: document.documentElement.scrollHeight };

    // 展开滚动容器及所有祖先
    let p = scrollEl;
    while (p) {
        p.style.height = 'auto';
        p.style.maxHeight = 'none';
        p.style.overflow = 'visible';
        p = p.parentElement;
    }
    document.body.style.height = 'auto';
    document.body.style.overflow = 'visible';
    document.documentElement.style.height = 'auto';
    document.documentElement.style.overflow = 'visible';

    return { expanded: true, height: document.documentElement.scrollHeight };
}
"""


async def take_screenshot(
    url: str,
    *,
    output_path: str | None = None,
    viewport_width: int = 1440,
    viewport_height: int = 900,
    wait_ms: int = 3000,
    token: str | None = None,
    expand_scroll: bool = True,
) -> ScreenshotResult:
    """
    截取页面完整长图。

    Args:
        url: 目标页面 URL
        output_path: 保存路径，None 则自动生成临时文件
        viewport_width: 视口宽度
        viewport_height: 视口高度
        wait_ms: 页面加载后等待时间（毫秒），让动态数据渲染
        token: TaskConductor 认证 token，自动注入 localStorage
        expand_scroll: 是否展开滚动容器截取完整内容
    """
    t0 = time.time()

    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".png", prefix="screenshot_")
        os.close(fd)

    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(
                viewport={"width": viewport_width, "height": viewport_height},
            )

            # 注入 token（如果需要认证）
            if token:
                # 先导航到同域页面设置 localStorage
                origin = "/".join(url.split("/")[:3])
                await page.goto(origin, wait_until="domcontentloaded", timeout=10000)
                await page.evaluate(f"() => localStorage.setItem('tc_token', '{token}')")

            # 导航到目标页面
            await page.goto(url, wait_until="networkidle", timeout=30000)

            # 等待数据渲染
            if wait_ms > 0:
                await page.wait_for_timeout(wait_ms)

            # 展开滚动容器
            if expand_scroll:
                await page.evaluate(_JS_EXPAND)
                await page.wait_for_timeout(200)

            # 截图
            await page.screenshot(path=output_path, full_page=True)

            # 获取尺寸
            dims = await page.evaluate(
                "() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })"
            )

            await browser.close()

        duration_ms = int((time.time() - t0) * 1000)
        return ScreenshotResult(
            success=True,
            image_path=output_path,
            width=dims.get("w", 0),
            height=dims.get("h", 0),
            duration_ms=duration_ms,
        )

    except Exception as e:
        return ScreenshotResult(success=False, error=str(e), duration_ms=int((time.time() - t0) * 1000))


async def upload_to_feishu(
    image_path: str,
    *,
    app_id: str | None = None,
    app_secret: str | None = None,
) -> str | None:
    """上传图片到飞书，返回 image_key。"""
    app_id = app_id or os.getenv("FEISHU_APP_ID", "")
    app_secret = app_secret or os.getenv("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        return None

    async with _client(30) as client:
        # 获取 tenant_token
        resp = await client.post(
            "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
        )
        token = resp.json().get("tenant_access_token", "")
        if not token:
            return None

        # 上传图片
        headers = {"Authorization": f"Bearer {token}"}
        with open(image_path, "rb") as f:
            resp = await client.post(
                "https://open.feishu.cn/open-apis/im/v1/images",
                headers=headers,
                data={"image_type": "message"},
                files={"image": (Path(image_path).name, f, "image/png")},
            )
        return resp.json().get("data", {}).get("image_key")


async def send_feishu_image(
    image_key: str,
    *,
    chat_id: str | None = None,
    app_id: str | None = None,
    app_secret: str | None = None,
) -> bool:
    """发送图片消息到飞书群聊。"""
    app_id = app_id or os.getenv("FEISHU_APP_ID", "")
    app_secret = app_secret or os.getenv("FEISHU_APP_SECRET", "")
    chat_id = chat_id or os.getenv("FEISHU_DEFAULT_CHAT_ID", "")
    if not all([app_id, app_secret, chat_id]):
        return False

    async with _client(15) as client:
        resp = await client.post(
            "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
        )
        token = resp.json().get("tenant_access_token", "")
        if not token:
            return False

        resp = await client.post(
            "https://open.feishu.cn/open-apis/im/v1/messages",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            params={"receive_id_type": "chat_id"},
            json={
                "receive_id": chat_id,
                "msg_type": "image",
                "content": json.dumps({"image_key": image_key}),
            },
        )
        return resp.status_code == 200


async def send_feishu_text(
    text: str,
    *,
    chat_id: str | None = None,
    app_id: str | None = None,
    app_secret: str | None = None,
) -> bool:
    """发送文本消息到飞书群聊。"""
    app_id = app_id or os.getenv("FEISHU_APP_ID", "")
    app_secret = app_secret or os.getenv("FEISHU_APP_SECRET", "")
    chat_id = chat_id or os.getenv("FEISHU_DEFAULT_CHAT_ID", "")
    if not all([app_id, app_secret, chat_id]):
        return False

    async with _client(15) as client:
        resp = await client.post(
            "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
        )
        token = resp.json().get("tenant_access_token", "")
        if not token:
            return False

        resp = await client.post(
            "https://open.feishu.cn/open-apis/im/v1/messages",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            params={"receive_id_type": "chat_id"},
            json={
                "receive_id": chat_id,
                "msg_type": "text",
                "content": json.dumps({"text": text}),
            },
        )
        return resp.status_code == 200


async def capture_and_send(
    url: str,
    *,
    message: str | None = None,
    chat_id: str | None = None,
    output_path: str | None = None,
    token: str | None = None,
    send_feishu: bool = True,
    viewport_width: int = 1440,
    viewport_height: int = 900,
    wait_ms: int = 3000,
    expand_scroll: bool = True,
) -> ScreenshotResult:
    """
    一站式：截图 → 上传飞书 → 发送到群聊。

    Args:
        url: 目标页面 URL
        message: 附带的文字消息（可选）
        chat_id: 飞书群聊 ID（默认读环境变量）
        output_path: 图片保存路径
        token: TaskConductor 认证 token
        send_feishu: 是否发送到飞书
        viewport_width: 视口宽度
        viewport_height: 视口高度
        wait_ms: 页面加载后等待时间
        expand_scroll: 是否展开滚动容器
    """
    # 1. 截图
    result = await take_screenshot(
        url,
        output_path=output_path,
        viewport_width=viewport_width,
        viewport_height=viewport_height,
        wait_ms=wait_ms,
        token=token,
        expand_scroll=expand_scroll,
    )
    if not result.success:
        return result

    # 2. 上传 + 发送到飞书
    if send_feishu and result.image_path:
        image_key = await upload_to_feishu(result.image_path)
        if image_key:
            result.feishu_image_key = image_key
            result.feishu_sent = await send_feishu_image(image_key, chat_id=chat_id)

            # 附带文字消息
            if message and result.feishu_sent:
                await send_feishu_text(message, chat_id=chat_id)

    return result


# ── CLI 入口 ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="截取页面完整长图并发送到飞书")
    parser.add_argument("url", help="目标页面 URL")
    parser.add_argument("-o", "--output", help="保存路径（默认临时文件）")
    parser.add_argument("-m", "--message", help="附带的文字消息")
    parser.add_argument("--chat-id", help="飞书群聊 ID（默认读 FEISHU_DEFAULT_CHAT_ID）")
    parser.add_argument("--token", help="TaskConductor 认证 token")
    parser.add_argument("--no-feishu", action="store_true", help="不发送到飞书，仅截图保存")
    parser.add_argument("--width", type=int, default=1440, help="视口宽度（默认 1440）")
    parser.add_argument("--wait", type=int, default=3000, help="等待渲染时间 ms（默认 3000）")
    parser.add_argument("--no-expand", action="store_true", help="不展开滚动容器")
    args = parser.parse_args()

    async def _main():
        r = await capture_and_send(
            args.url,
            message=args.message,
            chat_id=args.chat_id,
            output_path=args.output,
            token=args.token,
            send_feishu=not args.no_feishu,
            viewport_width=args.width,
            wait_ms=args.wait,
            expand_scroll=not args.no_expand,
        )
        if r.success:
            print(f"✅ 截图完成: {r.image_path} ({r.width}x{r.height}, {r.duration_ms}ms)")
            if r.feishu_sent:
                print(f"✅ 已发送到飞书 (image_key: {r.feishu_image_key})")
            elif not args.no_feishu:
                print("⚠ 飞书发送失败（检查 FEISHU_APP_ID / FEISHU_APP_SECRET 环境变量）")
        else:
            print(f"❌ 截图失败: {r.error}")

    asyncio.run(_main())

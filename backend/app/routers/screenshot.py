"""截图工具 API"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/tools", tags=["工具"])


class ScreenshotRequest(BaseModel):
    url: str
    message: str | None = None
    chat_id: str | None = None
    token: str | None = None
    send_feishu: bool = True
    viewport_width: int = 1440
    viewport_height: int = 900
    wait_ms: int = 3000
    expand_scroll: bool = True
    output_path: str | None = None


class ScreenshotResponse(BaseModel):
    success: bool
    image_path: str | None = None
    width: int = 0
    height: int = 0
    feishu_sent: bool = False
    feishu_image_key: str | None = None
    error: str | None = None
    duration_ms: int = 0


@router.post("/screenshot", response_model=ScreenshotResponse, summary="截取页面长图并发送到飞书")
async def screenshot_to_feishu(req: ScreenshotRequest):
    """
    截取指定 URL 的页面完整长图，可选发送到飞书群聊。

    - 自动展开滚动容器，侧边栏/顶栏只出现一次
    - 支持 TaskConductor 认证 token 注入
    - 支持自定义视口、等待时间、附带消息

    用例：
    - 测试完成后截取页面效果发送给团队
    - CI/CD 中自动截图报告
    - 定期监控页面状态
    """
    from ..utils.page_screenshot import capture_and_send

    result = await capture_and_send(
        req.url,
        message=req.message,
        chat_id=req.chat_id,
        output_path=req.output_path,
        token=req.token,
        send_feishu=req.send_feishu,
        viewport_width=req.viewport_width,
        viewport_height=req.viewport_height,
        wait_ms=req.wait_ms,
        expand_scroll=req.expand_scroll,
    )

    return ScreenshotResponse(
        success=result.success,
        image_path=result.image_path,
        width=result.width,
        height=result.height,
        feishu_sent=result.feishu_sent,
        feishu_image_key=result.feishu_image_key,
        error=result.error,
        duration_ms=result.duration_ms,
    )

"""
UI 导航 — 通过 WebSocket 将路由跳转指令推送给前端
"""
from fastapi import APIRouter
from pydantic import BaseModel
from ..ws.manager import manager

router = APIRouter(prefix="/api/ui", tags=["UI 控制"])


class NavigateBody(BaseModel):
    path: str  # 如 "/task/42"


@router.post("/navigate", summary="通知前端跳转到指定页面")
async def navigate_to(body: NavigateBody):
    await manager.broadcast("ui", "navigate", {"path": body.path})
    return {"ok": True, "path": body.path}

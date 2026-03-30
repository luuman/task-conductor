"""
UI 导航 — 通过 WebSocket 将路由跳转指令推送给前端
"""
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from ..auth import verify_token as _verify_jwt
from ..ws.manager import manager

router = APIRouter(prefix="/api/ui", tags=["UI 控制"])


class NavigateBody(BaseModel):
    path: str  # 如 "/task/42"


def verify_token(authorization: str = Header(default="")) -> str:
    """Bearer token 鉴权依赖。"""
    token = authorization.removeprefix("Bearer ").strip()
    if not token or _verify_jwt(token) is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token


@router.post("/navigate", summary="通知前端跳转到指定页面")
async def navigate_to(body: NavigateBody, _: str = Depends(verify_token)):
    await manager.broadcast("ui", "navigate", {"path": body.path})
    return {"ok": True, "path": body.path}

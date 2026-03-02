import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .models import Base
from .routers import projects, tasks
from .routers import pipeline as pipeline_router
from .session import pin_session
from .tunnel import start_cloudflare_tunnel, get_tunnel_url, stop_tunnel

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # 生成 PIN
    pin = pin_session.generate_pin()
    print(f"\n{'='*50}")
    print(f"  TaskConductor Agent 已启动")
    print(f"  PIN: {pin}")
    print(f"{'='*50}\n")
    # 后台启动 Cloudflare Tunnel
    if os.getenv("TC_TUNNEL", "1") == "1":
        asyncio.create_task(_start_tunnel_bg(pin))
    yield
    stop_tunnel()

async def _start_tunnel_bg(pin: str):
    url = await start_cloudflare_tunnel(8000)
    if url:
        print(f"\n  Tunnel URL: {url}")
        print(f"  PIN:        {pin}")
        print(f"  在 gh-pages 输入以上信息连接\n")

app = FastAPI(title="TaskConductor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(pipeline_router.router)

@app.get("/health")
def health():
    return {"status": "ok"}

from .ws.manager import manager

@app.websocket("/ws/task/{task_id}")
async def task_ws(websocket: WebSocket, task_id: str):
    await manager.connect(websocket, f"task:{task_id}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"task:{task_id}")

from pydantic import BaseModel as PM
from fastapi import HTTPException

class PinRequest(PM):
    pin: str

@app.post("/auth/pin")
def auth_pin(body: PinRequest):
    token = pin_session.verify_pin(body.pin)
    if not token:
        raise HTTPException(401, "Invalid PIN")
    return {"token": token}

@app.get("/auth/check")
def auth_check(authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "")
    if not pin_session.verify_token(token):
        raise HTTPException(401, "Unauthorized")
    return {"ok": True}

@app.get("/agent/info")
def agent_info():
    return {
        "tunnel_url": get_tunnel_url(),
        "version": "2.0.0",
    }

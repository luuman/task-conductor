from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .models import Base
from .routers import projects, tasks

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="TaskConductor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(tasks.router)

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

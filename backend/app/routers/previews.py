"""预览服务管理：启动/停止 dev server 子进程"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine
from ..models import Task
from ..pipeline.process_manager import process_manager

router = APIRouter(prefix="/api/previews", tags=["Previews"])


def _get_db():
    with Session(engine) as session:
        yield session


class PreviewStartRequest(BaseModel):
    command: str = "npm run dev"


class PreviewInfo(BaseModel):
    task_id: int
    pid: int
    port: int
    cwd: str
    command: str
    started_at: str


@router.get("", response_model=list[PreviewInfo])
def list_previews():
    return [
        PreviewInfo(
            task_id=p.task_id, pid=p.pid, port=p.port,
            cwd=p.cwd, command=p.command,
            started_at=p.started_at.isoformat(),
        )
        for p in process_manager.list()
    ]


@router.post("/{task_id}", response_model=PreviewInfo)
async def start_preview(
    task_id: int,
    body: PreviewStartRequest,
    db: Session = Depends(_get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if not task.worktree_path:
        raise HTTPException(400, "任务未配置 worktree_path")

    port = await process_manager.start(task_id, task.worktree_path, body.command)
    info = process_manager._processes[task_id]
    return PreviewInfo(
        task_id=info.task_id, pid=info.pid, port=info.port,
        cwd=info.cwd, command=info.command,
        started_at=info.started_at.isoformat(),
    )


@router.delete("/{task_id}", status_code=204)
async def stop_preview(task_id: int):
    await process_manager.stop(task_id)


@router.delete("", status_code=204)
async def stop_all_previews():
    await process_manager.stop_all()

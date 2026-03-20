"""
Canvas API - 任务画布数据读写
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from ..database import engine
from ..models import Task
from ..schemas import TaskOut

router = APIRouter(prefix="/api/tasks", tags=["画布"])


def get_db():
    with Session(engine) as session:
        yield session


class CanvasUpdateBody(BaseModel):
    canvas_data: str  # JSON string


@router.get("/{task_id}/canvas", summary="获取任务画布数据")
def get_canvas(task_id: int, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return {"task_id": task_id, "canvas_data": t.canvas_data}


@router.put("/{task_id}/canvas", response_model=TaskOut, summary="保存任务画布数据")
def update_canvas(task_id: int, body: CanvasUpdateBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.canvas_data = body.canvas_data
    db.commit()
    db.refresh(t)
    return t

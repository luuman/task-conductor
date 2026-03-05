import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact
from ..schemas import TaskOut, StageArtifactOut
from ..pipeline.engine import PipelineEngine, StageTransitionError

router = APIRouter(prefix="/api/tasks", tags=["任务"])


def get_db():
    with Session(engine) as session:
        yield session


pipeline_engine = PipelineEngine()


@router.get("/{task_id}", response_model=TaskOut, summary="获取任务详情")
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return t


@router.get("/{task_id}/artifacts", response_model=list[StageArtifactOut], summary="获取阶段产物")
def get_artifacts(task_id: int, db: Session = Depends(get_db)):
    return db.query(StageArtifact).filter(
        StageArtifact.task_id == task_id
    ).order_by(StageArtifact.created_at).all()


class ApprovalBody(BaseModel):
    action: str   # "approve" | "reject"
    reason: str = ""


@router.post("/{task_id}/approve", response_model=TaskOut, summary="审批当前阶段")
def approve_stage(task_id: int, body: ApprovalBody, db: Session = Depends(get_db)):
    """
    - action: "approve" → 批准，状态变为 approved
    - action: "reject"  → 驳回，状态变为 rejected（rejected_reason 存在 reason 字段）
    """
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if body.action == "approve":
        t.status = "approved"
    elif body.action == "reject":
        t.status = "rejected"
    else:
        raise HTTPException(400, "action must be 'approve' or 'reject'")
    db.commit()
    db.refresh(t)
    return t


@router.post("/{task_id}/advance", response_model=TaskOut, summary="推进到下一阶段并继续执行")
async def advance_stage(
    task_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    审批通过后推进到下一阶段，并自动触发流水线继续执行。
    前置条件：status == "approved"
    """
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if not pipeline_engine.can_proceed(t.stage, t.status):
        raise HTTPException(400, f"Cannot advance: stage={t.stage} status={t.status}")
    try:
        next_stage = pipeline_engine.next_stage(t.stage)
    except StageTransitionError as e:
        raise HTTPException(400, str(e))

    t.stage = next_stage
    t.status = "pending" if next_stage != "done" else "done"
    db.commit()
    db.refresh(t)

    # 触发下一阶段执行（通过调度器）
    if next_stage != "done":
        from ..scheduler import scheduler
        bg.add_task(scheduler.enqueue, task_id)

    return t

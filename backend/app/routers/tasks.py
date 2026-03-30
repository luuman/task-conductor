import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact
from ..schemas import TaskOut, StageArtifactOut
from ..pipeline.engine import PipelineEngine, StageTransitionError, get_task_stages

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


@router.post("/{task_id}/start", response_model=TaskOut, summary="启动流水线（input 阶段 → 下一阶段）")
async def start_pipeline(
    task_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    新任务处于 input/pending 状态时，点击"启动"触发流水线从第一个有效阶段开始执行。
    """
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if not (t.stage == "input" and t.status == "pending"):
        raise HTTPException(400, f"Task is not in startable state: stage={t.stage} status={t.status}")
    try:
        task_stages = get_task_stages(t)
        next_stage = pipeline_engine.next_stage("input", stages=task_stages)
    except StageTransitionError as e:
        raise HTTPException(400, str(e))

    t.stage = next_stage
    t.status = "pending"
    import datetime
    t.started_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(t)

    from ..scheduler import scheduler
    bg.add_task(scheduler.enqueue, task_id)
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
        task_stages = get_task_stages(t)
        next_stage = pipeline_engine.next_stage(t.stage, stages=task_stages)
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


class RequirementsBody(BaseModel):
    requirements: str  # JSON string


@router.put("/{task_id}/requirements", response_model=TaskOut, summary="更新任务需求字段")
def update_requirements(task_id: int, body: RequirementsBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.requirements = body.requirements
    db.commit()
    db.refresh(t)
    return t

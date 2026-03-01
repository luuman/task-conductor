from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact
from ..schemas import TaskOut, StageArtifactOut
from ..pipeline.engine import PipelineEngine, StageTransitionError

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

def get_db():
    with Session(engine) as session:
        yield session

@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return t

@router.get("/{task_id}/artifacts", response_model=list[StageArtifactOut])
def get_artifacts(task_id: int, db: Session = Depends(get_db)):
    return db.query(StageArtifact).filter(StageArtifact.task_id == task_id).all()

pipeline_engine = PipelineEngine()

class ApprovalBody(BaseModel):
    action: str  # "approve" | "reject"
    reason: str = ""

@router.post("/{task_id}/approve", response_model=TaskOut)
def approve_stage(task_id: int, body: ApprovalBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if body.action == "approve":
        t.status = "approved"
    elif body.action == "reject":
        t.status = "rejected"
    else:
        raise HTTPException(400, "action must be 'approve' or 'reject'")
    db.commit(); db.refresh(t)
    return t

@router.post("/{task_id}/advance", response_model=TaskOut)
def advance_stage(task_id: int, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if not pipeline_engine.can_proceed(t.stage, t.status):
        raise HTTPException(400, f"Cannot advance: stage={t.stage} status={t.status}")
    try:
        t.stage = pipeline_engine.next_stage(t.stage)
    except StageTransitionError as e:
        raise HTTPException(400, str(e))
    t.status = "pending"
    db.commit(); db.refresh(t)
    return t

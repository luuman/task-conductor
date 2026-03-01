from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact
from ..schemas import TaskOut, StageArtifactOut

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

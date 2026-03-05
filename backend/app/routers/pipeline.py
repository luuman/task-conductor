from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task
from ..schemas import TaskOut
from ..scheduler import scheduler

router = APIRouter(prefix="/api/pipeline", tags=["流水线"])


def get_db():
    with Session(engine) as s:
        yield s


@router.post("/{task_id}/run/{stage}", summary="触发指定阶段")
async def run_stage(
    task_id: int,
    stage: str,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """将任务设置到指定阶段并加入调度队列"""
    t = db.get(Task, task_id)
    if not t:
        return {"error": "task not found"}
    t.stage = stage
    t.status = "pending"
    db.commit()
    bg.add_task(scheduler.enqueue, task_id)
    return {"status": "queued", "task_id": task_id, "stage": stage}


@router.post("/{task_id}/run-analysis", summary="触发需求分析（向后兼容）")
async def run_analysis(
    task_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """向后兼容接口，等同于 run/{task_id}/run/analysis"""
    return await run_stage(task_id, "analysis", bg, db)

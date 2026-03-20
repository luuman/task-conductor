"""
Interview API - 需求访谈对话管理
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from ..database import engine
from ..models import Task, InterviewMessage
from ..schemas import TaskOut, InterviewMessageOut

router = APIRouter(prefix="/api/tasks", tags=["访谈"])


def get_db():
    with Session(engine) as session:
        yield session


class InterviewMessageBody(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    metadata: Optional[str] = None


class PrdUpdateBody(BaseModel):
    prd: str  # PRD JSON string


class InterviewCompleteBody(BaseModel):
    prd: str
    stages: list[str]


class InterviewStartResponse(BaseModel):
    system_prompt: str
    task: TaskOut
    model_config = {"from_attributes": True}


def _build_system_prompt(task: Task) -> str:
    return (
        "你是 TaskConductor AI 助手，正在进行需求访谈。\n"
        f"任务标题：{task.title}\n"
        f"任务描述：{task.description or '（无描述）'}\n\n"
        "请通过对话深入了解用户需求，最终生成结构化 PRD 和推荐的开发阶段。\n"
        "当你认为需求已经足够清晰时，输出 PRD JSON 并用 ---PRD--- 分隔符标记，格式：\n"
        "---PRD---\n"
        '{"title": "...", "background": "...", "goals": [...], "requirements": [...], '
        '"non_requirements": [...], "stages": [...]}\n'
        "---PRD---\n"
    )


@router.post("/{task_id}/interview/start", summary="开始需求访谈")
def start_interview(task_id: int, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.interview_status = "active"
    db.commit()
    db.refresh(t)
    return {"system_prompt": _build_system_prompt(t), "task": TaskOut.model_validate(t)}


@router.post("/{task_id}/interview/message", response_model=InterviewMessageOut, summary="保存访谈消息")
def save_interview_message(task_id: int, body: InterviewMessageBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    msg = InterviewMessage(
        task_id=task_id,
        role=body.role,
        content=body.content,
        metadata=body.metadata,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.get("/{task_id}/interview/messages", response_model=list[InterviewMessageOut], summary="获取访谈历史")
def get_interview_messages(task_id: int, db: Session = Depends(get_db)):
    return db.query(InterviewMessage).filter(
        InterviewMessage.task_id == task_id
    ).order_by(InterviewMessage.created_at).all()


@router.put("/{task_id}/prd", response_model=TaskOut, summary="保存 PRD")
def update_prd(task_id: int, body: PrdUpdateBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.prd_content = body.prd
    db.commit()
    db.refresh(t)
    return t


@router.post("/{task_id}/interview/complete", response_model=TaskOut, summary="完成访谈")
def complete_interview(task_id: int, body: InterviewCompleteBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.prd_content = body.prd
    t.stages = json.dumps(body.stages, ensure_ascii=False)
    t.interview_status = "completed"
    # 推进到第一个阶段
    if body.stages:
        t.stage = body.stages[0]
        t.status = "pending"
    db.commit()
    db.refresh(t)
    return t

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import engine
from ..models import ProjectKnowledge

router = APIRouter(prefix="/api/projects", tags=["知识库"])


def get_db():
    with Session(engine) as s:
        yield s


@router.get("/{project_id}/knowledge", summary="获取项目知识库")
def list_knowledge(project_id: int, db: Session = Depends(get_db)):
    """返回项目积累的历史错误经验，按时间倒序，最多 50 条"""
    rows = db.query(ProjectKnowledge).filter(
        ProjectKnowledge.project_id == project_id
    ).order_by(ProjectKnowledge.created_at.desc()).limit(50).all()
    return [
        {
            "id": r.id,
            "stage": r.stage,
            "category": r.category,
            "title": r.title,
            "content": r.content,
            "source_task_id": r.source_task_id,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.delete("/{project_id}/knowledge/{knowledge_id}", summary="删除一条知识")
def delete_knowledge(
    project_id: int,
    knowledge_id: int,
    db: Session = Depends(get_db),
):
    k = db.get(ProjectKnowledge, knowledge_id)
    if k and k.project_id == project_id:
        db.delete(k)
        db.commit()
    return {"ok": True}

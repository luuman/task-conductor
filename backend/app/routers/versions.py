from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Version, Task
from ..schemas import VersionCreate, VersionOut, VersionUpdate, TaskOut


def get_db():
    with Session(engine) as session:
        yield session

router = APIRouter(prefix="/api/projects/{project_id}/versions", tags=["versions"])


@router.get("", response_model=list[VersionOut])
def list_versions(project_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Version)
        .filter(Version.project_id == project_id)
        .order_by(Version.sort_order, Version.created_at)
        .all()
    )


@router.post("", response_model=VersionOut, status_code=201)
def create_version(project_id: int, body: VersionCreate, db: Session = Depends(get_db)):
    v = Version(project_id=project_id, **body.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.put("/{version_id}", response_model=VersionOut)
def update_version(project_id: int, version_id: int, body: VersionUpdate, db: Session = Depends(get_db)):
    v = db.get(Version, version_id)
    if not v or v.project_id != project_id:
        raise HTTPException(404, "版本不存在")
    for k, val in body.model_dump(exclude_none=True).items():
        setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/{version_id}", status_code=204)
def delete_version(project_id: int, version_id: int, db: Session = Depends(get_db)):
    v = db.get(Version, version_id)
    if not v or v.project_id != project_id:
        raise HTTPException(404, "版本不存在")
    # 解除版本下所有任务的关联
    db.query(Task).filter(Task.version_id == version_id).update({"version_id": None})
    db.delete(v)
    db.commit()


@router.get("/{version_id}/tasks", response_model=list[TaskOut])
def list_version_tasks(project_id: int, version_id: int, db: Session = Depends(get_db)):
    v = db.get(Version, version_id)
    if not v or v.project_id != project_id:
        raise HTTPException(404, "版本不存在")
    return db.query(Task).filter(Task.version_id == version_id).order_by(Task.created_at).all()


@router.put("/{version_id}/tasks/{task_id}", response_model=TaskOut)
def assign_task_to_version(project_id: int, version_id: int, task_id: int, db: Session = Depends(get_db)):
    """将任务分配到指定版本"""
    v = db.get(Version, version_id)
    if not v or v.project_id != project_id:
        raise HTTPException(404, "版本不存在")
    t = db.get(Task, task_id)
    if not t or t.project_id != project_id:
        raise HTTPException(404, "任务不存在")
    t.version_id = version_id
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{version_id}/tasks/{task_id}", response_model=TaskOut)
def remove_task_from_version(project_id: int, version_id: int, task_id: int, db: Session = Depends(get_db)):
    """将任务从版本中移除（不删除任务本身）"""
    t = db.get(Task, task_id)
    if not t or t.project_id != project_id:
        raise HTTPException(404, "任务不存在")
    t.version_id = None
    db.commit()
    db.refresh(t)
    return t

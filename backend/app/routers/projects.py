import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Project, Task
from ..schemas import ProjectCreate, ProjectOut, TaskCreate, TaskOut
from .settings_router import _load as _load_settings

router = APIRouter(prefix="/api/projects", tags=["项目"])

def get_db():
    with Session(engine) as session:
        yield session

@router.post("", response_model=ProjectOut, summary="创建项目")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    """
    新建一个项目。

    - 若未指定 `repo_url`，自动使用工作区根目录（`/api/settings` 中配置）拼接项目名作为路径
    - 自动在文件系统创建项目目录（`os.makedirs`）
    """
    data = body.model_dump()
    # 自动计算项目目录
    if not data.get("repo_url"):
        workspace_root = _load_settings().get("workspace_root", "")
        if workspace_root:
            safe_name = body.name.strip().replace(" ", "-")
            data["repo_url"] = f"{workspace_root}/{safe_name}"
    # 在文件系统创建目录
    if data.get("repo_url"):
        try:
            os.makedirs(data["repo_url"], exist_ok=True)
        except OSError:
            pass  # 路径无效时静默忽略，不阻断创建

    p = Project(**data)
    db.add(p); db.commit(); db.refresh(p)
    return p

@router.get("", response_model=list[ProjectOut], summary="项目列表")
def list_projects(db: Session = Depends(get_db)):
    """获取所有项目列表。"""
    return db.query(Project).all()

@router.post("/{project_id}/tasks", response_model=TaskOut, summary="在项目下创建任务")
def create_task(project_id: int, body: TaskCreate, db: Session = Depends(get_db)):
    """在指定项目下新建任务，任务初始阶段为 `input`，状态为 `pending`。"""
    t = Task(project_id=project_id, **body.model_dump())
    db.add(t); db.commit(); db.refresh(t)
    return t

@router.get("/{project_id}/tasks", response_model=list[TaskOut], summary="项目任务列表")
def list_tasks(project_id: int, db: Session = Depends(get_db)):
    """获取指定项目下的所有任务。"""
    return db.query(Task).filter(Task.project_id == project_id).all()

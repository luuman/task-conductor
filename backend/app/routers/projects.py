import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Project, Task, StageArtifact, ProjectKnowledge, ClaudeInstance, Notification
from ..schemas import ProjectCreate, ProjectOut, TaskCreate, TaskOut
from .settings_router import _load as _load_settings

router = APIRouter(prefix="/api/projects", tags=["项目"])


async def _create_feishu_group(project_id: int, project_name: str):
    """异步创建飞书群聊并绑定到项目"""
    from ..feishu.client import feishu_client
    from ..feishu.cards import build_welcome_card
    try:
        data = await feishu_client.create_group(f"TC: {project_name}")
        chat_id = data.get("chat_id", "")
        if not chat_id:
            return
        with Session(engine) as db:
            p = db.get(Project, project_id)
            if p:
                p.feishu_chat_id = chat_id
                db.commit()
        await feishu_client.send_card(chat_id, build_welcome_card(project_name))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[Feishu] 建群失败: {e}")

def get_db():
    with Session(engine) as session:
        yield session

@router.post("", response_model=ProjectOut, summary="创建项目")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    data = body.model_dump()
    if not data.get("repo_url"):
        workspace_root = _load_settings().get("workspace_root", "")
        if workspace_root:
            safe_name = body.name.strip().replace(" ", "-")
            data["repo_url"] = f"{workspace_root}/{safe_name}"
    if data.get("repo_url"):
        try:
            os.makedirs(data["repo_url"], exist_ok=True)
        except OSError:
            pass
    p = Project(**data)
    db.add(p); db.commit(); db.refresh(p)

    # 飞书自动建群
    from ..feishu.client import feishu_client
    if feishu_client.enabled:
        import asyncio
        asyncio.create_task(_create_feishu_group(p.id, p.name))

    return p

@router.get("", response_model=list[ProjectOut], summary="项目列表")
def list_projects(db: Session = Depends(get_db)):
    """按 sort_order 升序、is_test 后排、创建时间排序"""
    return db.query(Project).order_by(
        Project.is_test,        # False (0) 在前
        Project.sort_order,     # 越小越靠前
        Project.created_at,
    ).all()

@router.delete("/{project_id}", summary="删除项目")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """删除项目及其所有关联数据（任务、产物、知识、实例、通知）"""
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    task_ids = [t.id for t in db.query(Task).filter(Task.project_id == project_id).all()]
    if task_ids:
        db.query(StageArtifact).filter(StageArtifact.task_id.in_(task_ids)).delete(synchronize_session=False)
        db.query(ClaudeInstance).filter(ClaudeInstance.task_id.in_(task_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(ProjectKnowledge).filter(ProjectKnowledge.project_id == project_id).delete(synchronize_session=False)
    db.query(Task).filter(Task.project_id == project_id).delete(synchronize_session=False)
    db.delete(p)
    db.commit()
    return {"ok": True}

@router.post("/scan", response_model=list[ProjectOut], summary="扫描本地项目")
def scan_projects(db: Session = Depends(get_db)):
    """扫描 workspace_root 下的 git 仓库，自动导入未注册的项目"""
    workspace_root = _load_settings().get("workspace_root", "")
    if not workspace_root or not os.path.isdir(workspace_root):
        raise HTTPException(400, "workspace_root 未配置或目录不存在")

    existing_paths = {p.repo_url for p in db.query(Project).all() if p.repo_url}
    imported = []

    for entry in sorted(Path(workspace_root).iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        repo_path = str(entry)
        if repo_path in existing_paths:
            continue
        # 检测是否为 git 仓库
        is_git = (entry / ".git").exists()
        if not is_git:
            continue
        p = Project(name=entry.name, repo_url=repo_path)
        db.add(p)
        imported.append(p)

    if imported:
        db.commit()
        for p in imported:
            db.refresh(p)
    return imported

@router.put("/{project_id}/feishu-sync", summary="切换飞书会话同步")
def toggle_feishu_sync(project_id: int, body: dict, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    p.feishu_sync = bool(body.get("enabled", False))
    db.commit()
    db.refresh(p)
    return ProjectOut.model_validate(p)


@router.put("/{project_id}/sort", summary="更新项目排序")
def update_sort(project_id: int, body: dict, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    if "sort_order" in body:
        p.sort_order = body["sort_order"]
    if "is_test" in body:
        p.is_test = body["is_test"]
    db.commit()
    db.refresh(p)
    return ProjectOut.model_validate(p)

@router.post("/{project_id}/tasks", response_model=TaskOut, summary="在项目下创建任务")
def create_task(project_id: int, body: TaskCreate, db: Session = Depends(get_db)):
    t = Task(project_id=project_id, **body.model_dump())
    db.add(t); db.commit(); db.refresh(t)
    return t

@router.get("/{project_id}/tasks", response_model=list[TaskOut], summary="项目任务列表")
def list_tasks(project_id: int, db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.project_id == project_id).all()

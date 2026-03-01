from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Project, Task
from ..schemas import ProjectCreate, ProjectOut, TaskCreate, TaskOut

router = APIRouter(prefix="/api/projects", tags=["projects"])

def get_db():
    with Session(engine) as session:
        yield session

@router.post("", response_model=ProjectOut)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    p = Project(**body.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return p

@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).all()

@router.post("/{project_id}/tasks", response_model=TaskOut)
def create_task(project_id: int, body: TaskCreate, db: Session = Depends(get_db)):
    t = Task(project_id=project_id, **body.model_dump())
    db.add(t); db.commit(); db.refresh(t)
    return t

@router.get("/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(project_id: int, db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.project_id == project_id).all()

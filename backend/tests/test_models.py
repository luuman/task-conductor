# backend/tests/test_models.py
from app.database import engine, Base
from app.models import Project, Task, StageArtifact, Notification, ClaudeInstance
from sqlalchemy.orm import Session

def test_create_project():
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        p = Project(name="test-project", repo_url="https://github.com/test/repo")
        session.add(p)
        session.commit()
        assert p.id is not None

def test_create_task_with_stage():
    with Session(engine) as session:
        p = session.query(Project).first()
        t = Task(project_id=p.id, title="实现登录", description="JWT 登录",
                 stage="input", status="pending")
        session.add(t)
        session.commit()
        assert t.stage == "input"
        assert t.status == "pending"

from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class ProjectCreate(BaseModel):
    name: str
    repo_url: str = ""
    worktree_base: str = ""

class ProjectOut(BaseModel):
    id: int
    name: str
    repo_url: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}

class TaskCreate(BaseModel):
    title: str
    description: str

class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    stage: str
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class StageArtifactOut(BaseModel):
    id: int
    task_id: int
    stage: str
    artifact_type: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}

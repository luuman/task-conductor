from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    repo_url: str = ""
    worktree_base: str = ""
    max_parallel: int = 2
    execution_mode: str = "smart"
    is_test: bool = False


class ProjectOut(BaseModel):
    id: int
    name: str
    repo_url: Optional[str]
    max_parallel: int
    execution_mode: str
    is_test: bool
    sort_order: int
    created_at: datetime
    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str
    description: str
    depends_on: Optional[list[int]] = None   # 前置任务 ID 列表


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    stage: str
    status: str
    depends_on: Optional[str] = None         # JSON list[int]
    worktree_path: Optional[str] = None
    branch_name: Optional[str] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class StageArtifactOut(BaseModel):
    id: int
    task_id: int
    stage: str
    artifact_type: str
    content: str
    confidence: Optional[float] = None
    assumptions: Optional[str] = None        # JSON list[str]
    critic_notes: Optional[str] = None
    retry_count: int = 0
    error_log: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}

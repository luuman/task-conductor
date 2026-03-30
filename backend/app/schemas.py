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
    feishu_chat_id: Optional[str] = None
    feishu_sync: bool = False
    sort_order: int
    stages_config: Optional[str] = None  # JSON list[str]，启用的阶段；null = 全部
    automation_config:     Optional[str] = None
    claude_runtime_config: Optional[str] = None
    notification_config:   Optional[str] = None
    docs_config:           Optional[str] = None
    env_config:            Optional[str] = None
    knowledge_config:      Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ProjectStagesUpdate(BaseModel):
    stages_config: list[str]


class VersionCreate(BaseModel):
    name: str                          # "v1.0" / 自定义
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "planning"           # planning | active | shipped
    target_date: Optional[str] = None  # YYYY-MM-DD
    sort_order: int = 0


class VersionUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    sort_order: Optional[int] = None


class VersionOut(BaseModel):
    id: int
    project_id: int
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str
    target_date: Optional[str] = None
    sort_order: int
    created_at: datetime
    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    depends_on: Optional[list[int]] = None   # 前置任务 ID 列表
    version_id: Optional[int] = None         # 归属版本


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    stage: str
    status: str
    depends_on: Optional[str] = None         # JSON list[int]
    stages: Optional[str] = None             # JSON list[str]，per-task 阶段
    prd_content: Optional[str] = None        # 结构化 PRD JSON
    interview_status: str = "none"           # none|active|completed
    claude_session_id: Optional[str] = None  # 关联的 Claude 会话
    canvas_data: Optional[str] = None        # Canvas JSON 数据
    requirements: Optional[str] = None       # 结构化需求 JSON
    version_id: Optional[int] = None
    worktree_path: Optional[str] = None
    branch_name: Optional[str] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class InterviewMessageOut(BaseModel):
    id: int
    task_id: int
    role: str
    content: str
    extra: Optional[str] = None
    created_at: datetime
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

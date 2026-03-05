from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class ClaudeSession(Base):
    """每个 Claude Code 会话（interactive 或 headless）对应一条记录"""
    __tablename__ = "claude_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    cwd: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="active")
    # active / idle / stopped
    linked_task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    events: Mapped[list["ClaudeEvent"]] = relationship(back_populates="session")


class ClaudeEvent(Base):
    """单个 Hook 事件记录"""
    __tablename__ = "claude_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    claude_session_id: Mapped[int] = mapped_column(ForeignKey("claude_sessions.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    tool_name: Mapped[Optional[str]] = mapped_column(String(100))
    tool_input: Mapped[Optional[str]] = mapped_column(Text)   # JSON string
    tool_result: Mapped[Optional[str]] = mapped_column(Text)  # JSON string
    extra: Mapped[Optional[str]] = mapped_column(Text)        # message/prompt 等其他字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    session: Mapped["ClaudeSession"] = relationship(back_populates="events")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    repo_url: Mapped[Optional[str]] = mapped_column(String(500))
    worktree_base: Mapped[Optional[str]] = mapped_column(String(500))
    # 调度配置
    max_parallel: Mapped[int] = mapped_column(Integer, default=2)
    execution_mode: Mapped[str] = mapped_column(String(20), default="smart")
    # smart=自动（有依赖串行/无依赖并行）| queue=全部串行 | parallel=全部并行
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    stage: Mapped[str] = mapped_column(String(20), default="input")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # 调度字段
    depends_on: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # JSON list[int]
    worktree_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    branch_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    queued_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    project: Mapped["Project"] = relationship(back_populates="tasks")
    artifacts: Mapped[list["StageArtifact"]] = relationship(back_populates="task")
    instances: Mapped[list["ClaudeInstance"]] = relationship(back_populates="task")


class StageArtifact(Base):
    __tablename__ = "stage_artifacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    stage: Mapped[str] = mapped_column(String(20))
    artifact_type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)                              # 主输出（结构化 JSON）
    # 可靠性字段
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    assumptions: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # JSON list[str]
    critic_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_log: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    task: Mapped["Task"] = relationship(back_populates="artifacts")


class ProjectKnowledge(Base):
    """项目级错误知识库——记录每次失败/驳回的经验，避免二次犯错"""
    __tablename__ = "project_knowledge"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    source_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    stage: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(40))
    # error_pattern | rejected_assumption | wrong_tech_choice | validation_fail
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    stage: Mapped[str] = mapped_column(String(20))
    channel: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class ClaudeInstance(Base):
    __tablename__ = "claude_instances"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    pid: Mapped[Optional[int]] = mapped_column(Integer)
    worktree_path: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="idle")
    log_file_path: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    task: Mapped["Task"] = relationship(back_populates="instances")


class ConversationNote(Base):
    """用户对 Claude 会话添加的元数据（别名/标签/备注/关联任务）"""
    __tablename__ = "conversation_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    claude_session_id: Mapped[int] = mapped_column(
        ForeignKey("claude_sessions.id"), unique=True, index=True
    )
    alias: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # JSON list[str]
    linked_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tasks.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    session: Mapped["ClaudeSession"] = relationship(viewonly=True)
    linked_task: Mapped[Optional["Task"]] = relationship(viewonly=True)

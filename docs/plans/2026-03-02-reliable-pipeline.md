# Reliable Pipeline + Transparency UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建可靠的 AI 任务流水线：结构化输出验证 + 自我批判重试 + 假设显式化 + 项目级错误知识库 + 混合调度（并行/队列/依赖）+ 前端透明度 UI。

**Architecture:**
- **调度层**：`ProjectScheduler` 单例，每个项目维护任务队列 + 依赖图；`max_parallel` 控制 worktree 并发数；有依赖的任务自动等待前置任务完成后才入队。
- **执行层**：`StageExecutor` 基类封装 execute→validate→critic→retry(x3)；每阶段输出 Pydantic 结构化 JSON；超限或 blockers 自动升级人工介入。
- **知识库**：`ProjectKnowledge` 表存每次阶段失败/驳回的经验；后续任务的 prompt 自动注入"上次犯过的错误"。
- **前端**：TaskPipeline 改为"阶段卡片流"，每卡展示置信度/假设/Critic 摘要/重试次数；项目视图展示任务依赖 DAG + 运行状态。

**Tech Stack:** FastAPI + Pydantic v2, SQLAlchemy 2.0, asyncio, React + TypeScript + Tailwind, @xyflow/react

---

## 调度模型说明

```
Project（仓库）
  ├── Task A: 用户登录    → 无依赖 → worktree-A → 独立并行运行
  ├── Task B: 商品列表    → 无依赖 → worktree-B → 独立并行运行
  └── Task C: 集成测试    → depends_on: [A, B] → 等 A+B 都完成才入队

每个 Task 内部：
  input → analysis* → prd* → plan* → dev → test* → deploy* → done
                    （* = 需人工审批，串行，不可跳过）

Project 设置：
  max_parallel: 2   (最多 2 个 task 同时运行)
  mode: smart       (有依赖→队列，无依赖→并行，自动判断)
```

---

## Task 1: 数据库 Schema 增强

**Files:**
- Modify: `backend/app/models.py`

**Step 1: 修改 Task 模型，加入依赖和 worktree 字段**

```python
class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    stage: Mapped[str] = mapped_column(String(20), default="input")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # 新增
    depends_on: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list[int]
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
```

**Step 2: 修改 Project 模型，加入调度配置**

```python
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    repo_url: Mapped[Optional[str]] = mapped_column(String(500))
    worktree_base: Mapped[Optional[str]] = mapped_column(String(500))
    # 新增
    max_parallel: Mapped[int] = mapped_column(Integer, default=2)
    execution_mode: Mapped[str] = mapped_column(String(20), default="smart")
    # smart = 自动（有依赖串行，无依赖并行）| queue = 全部串行 | parallel = 全部并行
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")
```

**Step 3: 修改 StageArtifact，加入可靠性字段**

```python
class StageArtifact(Base):
    __tablename__ = "stage_artifacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    stage: Mapped[str] = mapped_column(String(20))
    artifact_type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    # 新增可靠性字段
    confidence: Mapped[Optional[float]] = mapped_column(nullable=True)
    assumptions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list
    critic_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_log: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    task: Mapped["Task"] = relationship(back_populates="artifacts")
```

**Step 4: 新增 ProjectKnowledge 表（错误知识库）**

```python
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
    content: Mapped[str] = mapped_column(Text)   # 详细描述：发生了什么 + 正确做法
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

**Step 5: 删掉旧 DB 重建**

```bash
rm -f backend/task_conductor.db
cd backend && source .venv/bin/activate && python -c "
from app.database import Base, engine
from app.models import *
Base.metadata.create_all(engine)
print('DB created ok')
"
```

---

## Task 2: Pydantic 结构化输出 Schema

**Files:**
- Create: `backend/app/pipeline/schemas.py`

```python
# backend/app/pipeline/schemas.py
from pydantic import BaseModel, Field
from typing import Literal, Any


class AnalysisOption(BaseModel):
    label: Literal["A", "B", "C"]
    title: str
    effort: Literal["S", "M", "L", "XL"]
    risk: Literal["低", "中", "高"]
    description: str


class AnalysisOutput(BaseModel):
    understanding: str = Field(description="对需求的核心理解，1-2句话")
    assumptions: list[str] = Field(description="明确列出所有假设", min_length=1)
    risks: list[str] = Field(description="识别到的风险点")
    options: list[AnalysisOption] = Field(min_length=3, max_length=3)
    recommended: Literal["A", "B", "C"]
    confidence: float = Field(ge=0.0, le=1.0)
    blockers: list[str] = Field(default=[])


class CriticOutput(BaseModel):
    score: int = Field(ge=0, le=10)
    issues: list[str]
    suggestions: str
    pass_review: bool


class PrdOutput(BaseModel):
    title: str
    background: str
    user_stories: list[str]
    acceptance_criteria: list[str]
    out_of_scope: list[str]
    assumptions: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    blockers: list[str] = Field(default=[])


class PlanOutput(BaseModel):
    architecture: str
    components: list[dict[str, Any]]   # [{name, responsibility, tech}]
    milestones: list[dict[str, Any]]   # [{name, tasks:[str], estimate}]
    tech_decisions: list[dict[str, Any]]  # [{decision, rationale, alternatives}]
    assumptions: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    blockers: list[str] = Field(default=[])
```

---

## Task 3: StageExecutor 基类（含知识库注入）

**Files:**
- Create: `backend/app/pipeline/executor.py`

```python
# backend/app/pipeline/executor.py
import json, logging, os
from abc import ABC, abstractmethod
from typing import TypeVar, Type
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from ..database import engine
from ..models import ProjectKnowledge
from ..claude.pool import ClaudePool
from ..ws.manager import manager

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)
pool = ClaudePool()
MAX_RETRIES = 3

CRITIC_PROMPT = """你是严格的技术评审专家。评审以下"{stage}"阶段输出：

{output_json}

原始需求：{requirement}

直接输出 JSON（无 markdown）：
{{"score":<0-10>,"issues":["问题1"],"suggestions":"改进建议","pass_review":<true/false>}}
"""


class StageExecutor(ABC):
    stage_name: str

    @abstractmethod
    def build_prompt(self, title: str, desc: str, context: dict, knowledge: list[str]) -> str: ...

    @abstractmethod
    def get_output_schema(self) -> Type[T]: ...

    def extract_json(self, raw: str) -> str:
        import re
        m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw)
        if m: return m.group(1)
        m = re.search(r"\{[\s\S]*\}", raw)
        if m: return m.group(0)
        return raw

    def _load_knowledge(self, project_id: int, stage: str) -> list[str]:
        """从知识库加载本阶段的历史错误经验"""
        with Session(engine) as db:
            rows = db.query(ProjectKnowledge).filter(
                ProjectKnowledge.project_id == project_id,
                ProjectKnowledge.stage == stage,
            ).order_by(ProjectKnowledge.created_at.desc()).limit(5).all()
            return [f"[{r.category}] {r.title}: {r.content}" for r in rows]

    def save_knowledge(self, project_id: int, task_id: int, category: str, title: str, content: str):
        """保存一条错误经验到知识库"""
        with Session(engine) as db:
            k = ProjectKnowledge(
                project_id=project_id,
                source_task_id=task_id,
                stage=self.stage_name,
                category=category,
                title=title,
                content=content,
            )
            db.add(k)
            db.commit()

    async def _call_claude(self, task_id: int, prompt: str, log_file: str, cwd: str = "/tmp") -> str:
        parts: list[str] = []
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        try:
            async for event in pool.run(task_id, prompt, cwd, log_file):
                content = event.get("content") or event.get("result", "")
                if content:
                    parts.append(str(content))
                await manager.broadcast(f"task:{task_id}", "log",
                    {"content": content, "stage": self.stage_name})
        except Exception as e:
            raise RuntimeError(f"Claude call failed: {e}")
        return "".join(parts)

    async def run(
        self,
        task_id: int,
        project_id: int,
        title: str,
        description: str,
        context: dict,
        worktree_path: str = "/tmp",
        log_dir: str = "/tmp/task-conductor/logs",
    ) -> tuple[T, dict]:
        schema = self.get_output_schema()
        knowledge = self._load_knowledge(project_id, self.stage_name)
        requirement = f"{title}\n{description}"
        errors: list[str] = []
        retry_count = 0
        critic_notes = ""

        for attempt in range(MAX_RETRIES):
            retry_count = attempt
            log_file = f"{log_dir}/task-{task_id}-{self.stage_name}-{attempt}.log"

            prompt = self.build_prompt(title, description, context, knowledge)
            if errors:
                prompt += "\n\n【请修正以下问题后重新输出】\n" + "\n".join(f"- {e}" for e in errors)

            await manager.broadcast(f"task:{task_id}", "stage_progress",
                {"stage": self.stage_name, "attempt": attempt + 1, "max": MAX_RETRIES})

            # 1. 执行
            try:
                raw = await self._call_claude(task_id, prompt, log_file, worktree_path)
            except RuntimeError as e:
                errors = [str(e)]
                continue

            # 2. 结构化验证
            try:
                json_str = self.extract_json(raw)
                output = schema.model_validate(json.loads(json_str))
            except (json.JSONDecodeError, ValidationError) as e:
                errors = [f"输出格式错误: {e}"]
                continue

            # 3. Critic Pass
            try:
                critic_raw = await self._call_claude(
                    task_id * 10000 + attempt,
                    CRITIC_PROMPT.format(stage=self.stage_name, output_json=json_str, requirement=requirement),
                    f"{log_dir}/task-{task_id}-{self.stage_name}-critic{attempt}.log",
                )
                cd = json.loads(self.extract_json(critic_raw))
                critic_notes = f"评分:{cd.get('score')}/10 | {cd.get('suggestions','')}"
                if not cd.get("pass_review", False):
                    issues = cd.get("issues", [])
                    # 自动存入知识库
                    self.save_knowledge(project_id, task_id, "validation_fail",
                        f"{self.stage_name} Critic未通过", "; ".join(issues))
                    errors = [f"Critic未通过: {'; '.join(issues)}"]
                    continue
            except Exception as e:
                critic_notes = f"Critic解析失败: {e}"

            # 4. blockers/低置信度 → 通知人工
            blockers = getattr(output, "blockers", [])
            confidence = getattr(output, "confidence", 0.8)
            if blockers or confidence < 0.5:
                await manager.broadcast(f"task:{task_id}", "needs_human", {
                    "stage": self.stage_name,
                    "reason": "blockers" if blockers else "low_confidence",
                    "blockers": blockers, "confidence": confidence,
                })

            return output, {
                "confidence": confidence,
                "assumptions": getattr(output, "assumptions", []),
                "critic_notes": critic_notes,
                "retry_count": retry_count,
                "error_log": "; ".join(errors) if errors else "",
            }

        # 超过重试上限 → 存知识库
        self.save_knowledge(project_id, task_id, "error_pattern",
            f"{self.stage_name} 超出最大重试次数",
            f"连续 {MAX_RETRIES} 次失败，最后错误: {'; '.join(errors)}")
        raise RuntimeError(f"Stage '{self.stage_name}' failed after {MAX_RETRIES} retries: {'; '.join(errors)}")
```

---

## Task 4: Analysis / PRD / Plan 三个阶段

**Files:**
- Modify: `backend/app/pipeline/stages/analysis.py`
- Create: `backend/app/pipeline/stages/prd.py`
- Create: `backend/app/pipeline/stages/plan.py`

### analysis.py

```python
from ..executor import StageExecutor
from ..schemas import AnalysisOutput

PROMPT = """你是资深技术架构师。分析以下任务，直接输出 JSON（无 markdown 包裹）：

任务标题: {title}
任务描述: {description}
{knowledge_section}

输出格式：
{{"understanding":"...","assumptions":["..."],"risks":["..."],
"options":[
  {{"label":"A","title":"...","effort":"M","risk":"低","description":"..."}},
  {{"label":"B","title":"...","effort":"S","risk":"低","description":"..."}},
  {{"label":"C","title":"...","effort":"L","risk":"中","description":"..."}}
],
"recommended":"A","confidence":0.85,"blockers":[]}}
"""

class AnalysisExecutor(StageExecutor):
    stage_name = "analysis"
    def build_prompt(self, title, description, context, knowledge):
        ks = ""
        if knowledge:
            ks = "\n【本项目历史经验，请避免重蹈覆辙】\n" + "\n".join(f"- {k}" for k in knowledge)
        return PROMPT.format(title=title, description=description, knowledge_section=ks)
    def get_output_schema(self): return AnalysisOutput
```

### prd.py

```python
from ..executor import StageExecutor
from ..schemas import PrdOutput

PROMPT = """你是产品经理。根据需求分析结果撰写 PRD，直接输出 JSON：

任务: {title}
选定方案: {option} - {option_desc}
分析假设: {assumptions}
{knowledge_section}

输出格式：
{{"title":"...","background":"...","user_stories":["As a..."],
"acceptance_criteria":["..."],"out_of_scope":["..."],
"assumptions":["..."],"confidence":0.85,"blockers":[]}}
"""

class PrdExecutor(StageExecutor):
    stage_name = "prd"
    def build_prompt(self, title, description, context, knowledge):
        analysis = context.get("analysis", {})
        rec = analysis.get("recommended", "A")
        opts = {o["label"]: o for o in analysis.get("options", [])}
        ks = "\n【历史经验】\n" + "\n".join(f"- {k}" for k in knowledge) if knowledge else ""
        return PROMPT.format(
            title=title,
            option=rec,
            option_desc=opts.get(rec, {}).get("description", ""),
            assumptions=", ".join(analysis.get("assumptions", [])),
            knowledge_section=ks,
        )
    def get_output_schema(self): return PrdOutput
```

### plan.py

```python
from ..executor import StageExecutor
from ..schemas import PlanOutput

PROMPT = """你是技术负责人。根据 PRD 制定技术方案，直接输出 JSON：

任务: {title}
背景: {background}
用户故事: {stories}
验收标准: {criteria}
{knowledge_section}

输出格式：
{{"architecture":"...","components":[{{"name":"...","responsibility":"...","tech":"..."}}],
"milestones":[{{"name":"...","tasks":["..."],"estimate":"..."}}],
"tech_decisions":[{{"decision":"...","rationale":"...","alternatives":"..."}}],
"assumptions":["..."],"confidence":0.8,"blockers":[]}}
"""

class PlanExecutor(StageExecutor):
    stage_name = "plan"
    def build_prompt(self, title, description, context, knowledge):
        prd = context.get("prd", {})
        ks = "\n【历史经验】\n" + "\n".join(f"- {k}" for k in knowledge) if knowledge else ""
        return PROMPT.format(
            title=title,
            background=prd.get("background", description),
            stories="\n".join(prd.get("user_stories", [description])),
            criteria="\n".join(prd.get("acceptance_criteria", [])),
            knowledge_section=ks,
        )
    def get_output_schema(self): return PlanOutput
```

---

## Task 5: ProjectScheduler（混合调度）

**Files:**
- Create: `backend/app/scheduler.py`

```python
# backend/app/scheduler.py
"""
ProjectScheduler：每个项目维护一个任务队列 + 依赖图。

调度规则（smart 模式）：
  1. 任务没有未完成的前置依赖 → 可进入 ready 状态
  2. ready 任务数量 ≤ project.max_parallel → 立即启动（分配 worktree）
  3. ready 任务超出 max_parallel → 排队等待空位
  4. 某任务完成 → 检查所有等待中的任务，把依赖满足的移入 ready
"""
import asyncio
import json
import logging
import os
from datetime import datetime
from sqlalchemy.orm import Session
from .database import engine
from .models import Task, Project
from .ws.manager import manager

logger = logging.getLogger(__name__)


class ProjectScheduler:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._running: dict[int, set[int]] = {}   # project_id → {task_id}
            cls._instance._lock = asyncio.Lock()
        return cls._instance

    def _get_depends(self, task: Task) -> list[int]:
        if not task.depends_on:
            return []
        try:
            return json.loads(task.depends_on)
        except Exception:
            return []

    def _deps_satisfied(self, task: Task, db: Session) -> bool:
        """检查所有前置任务是否已完成"""
        for dep_id in self._get_depends(task):
            dep = db.get(Task, dep_id)
            if dep is None or dep.status != "done":
                return False
        return True

    def _allocate_worktree(self, task: Task, project: Project) -> str:
        """分配 git worktree 路径（目录尚不实际创建，由执行层创建）"""
        base = project.worktree_base or f"/tmp/tc-worktrees/project-{project.id}"
        return os.path.join(base, f"task-{task.id}")

    async def enqueue(self, task_id: int):
        """将任务加入调度队列，若条件满足则立即启动"""
        async with self._lock:
            with Session(engine) as db:
                task = db.get(Task, task_id)
                if not task or task.status not in ("pending", "queued"):
                    return
                project = db.get(Project, task.project_id)
                running_count = len(self._running.get(project.id, set()))

                mode = project.execution_mode  # smart | queue | parallel
                can_parallel = mode == "parallel" or (
                    mode == "smart" and self._deps_satisfied(task, db)
                )

                if can_parallel and running_count < project.max_parallel:
                    # 直接启动
                    worktree = self._allocate_worktree(task, project)
                    task.status = "running"
                    task.worktree_path = worktree
                    task.started_at = datetime.utcnow()
                    db.commit()
                    self._running.setdefault(project.id, set()).add(task_id)
                    asyncio.create_task(self._execute_task(task_id, worktree))
                else:
                    # 排队
                    task.status = "queued"
                    task.queued_at = datetime.utcnow()
                    db.commit()

        await manager.broadcast(f"project:{task.project_id}", "task_scheduled",
            {"task_id": task_id, "status": task.status})

    async def on_task_done(self, task_id: int, project_id: int):
        """任务完成回调：释放 worktree，触发等待中的下一个任务"""
        async with self._lock:
            self._running.get(project_id, set()).discard(task_id)

        # 检查有没有排队中且依赖已满足的任务
        with Session(engine) as db:
            queued = db.query(Task).filter(
                Task.project_id == project_id,
                Task.status == "queued",
            ).all()
            for t in queued:
                if self._deps_satisfied(t, db):
                    asyncio.create_task(self.enqueue(t.id))

    async def _execute_task(self, task_id: int, worktree_path: str):
        """从 analysis 阶段开始驱动整个流水线（由调度器自动触发）"""
        from .pipeline.runner import run_pipeline
        try:
            await run_pipeline(task_id, worktree_path)
        except Exception as e:
            logger.error(f"Task {task_id} pipeline error: {e}")
            with Session(engine) as db:
                t = db.get(Task, task_id)
                if t:
                    t.status = "failed"
                    db.commit()
        finally:
            with Session(engine) as db:
                t = db.get(Task, task_id)
                project_id = t.project_id if t else None
            if project_id:
                await self.on_task_done(task_id, project_id)


scheduler = ProjectScheduler()
```

---

## Task 6: Pipeline Runner（阶段串行驱动）

**Files:**
- Create: `backend/app/pipeline/runner.py`

```python
# backend/app/pipeline/runner.py
"""
pipeline runner：驱动单个 task 从当前阶段往前跑，
每个需要审批的阶段会暂停并等待人工操作。
"""
import asyncio
import json
import logging
import os
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact
from ..ws.manager import manager
from ..notify.dispatcher import notify_human_required
from .stages.analysis import AnalysisExecutor
from .stages.prd import PrdExecutor
from .stages.plan import PlanExecutor

logger = logging.getLogger(__name__)

EXECUTORS = {
    "analysis": AnalysisExecutor(),
    "prd": PrdExecutor(),
    "plan": PlanExecutor(),
}
APPROVAL_STAGES = {"analysis", "prd", "ui", "plan", "test", "deploy"}
AUTO_STAGES = {"dev", "monitor"}   # 无需审批，执行完直接推进
STAGE_ORDER = ["input", "analysis", "prd", "ui", "plan", "dev", "test", "deploy", "monitor", "done"]


def _get_context(task_id: int) -> dict:
    ctx: dict = {}
    with Session(engine) as db:
        artifacts = db.query(StageArtifact).filter(
            StageArtifact.task_id == task_id
        ).all()
        for a in artifacts:
            try:
                ctx[a.stage] = json.loads(a.content)
                if a.assumptions:
                    ctx[f"{a.stage}_assumptions"] = json.loads(a.assumptions)
            except Exception:
                pass
    return ctx


async def run_pipeline(task_id: int, worktree_path: str):
    """从 task.stage 开始，自动执行到下一个需要审批的节点"""
    log_dir = os.getenv("TC_LOG_DIR", "/tmp/task-conductor/logs")

    with Session(engine) as db:
        task = db.get(Task, task_id)
        if not task:
            return
        current_stage = task.stage if task.stage != "input" else "analysis"
        project_id = task.project_id
        title, description = task.title, task.description

    while current_stage not in ("done",):
        executor = EXECUTORS.get(current_stage)

        if executor is None:
            # 无 executor 的阶段（ui/dev 等）暂时跳过，通知人工
            if current_stage in APPROVAL_STAGES:
                with Session(engine) as db:
                    t = db.get(Task, task_id)
                    t.status = "waiting_review"
                    db.commit()
                await notify_human_required(task_id, current_stage, f"{current_stage} 阶段需要人工操作")
                return
            # 自动推进
            idx = STAGE_ORDER.index(current_stage)
            current_stage = STAGE_ORDER[idx + 1]
            continue

        # 更新任务当前阶段
        with Session(engine) as db:
            t = db.get(Task, task_id)
            t.stage = current_stage
            t.status = "running"
            db.commit()

        context = _get_context(task_id)

        try:
            output, meta = await executor.run(
                task_id, project_id, title, description, context, worktree_path, log_dir
            )
        except RuntimeError as e:
            with Session(engine) as db:
                t = db.get(Task, task_id)
                t.status = "failed"
                db.commit()
            await manager.broadcast(f"task:{task_id}", "stage_failed",
                {"stage": current_stage, "error": str(e)})
            await notify_human_required(task_id, current_stage, f"阶段失败需人工介入: {e}")
            return

        # 保存 artifact
        with Session(engine) as db:
            artifact = StageArtifact(
                task_id=task_id, stage=current_stage, artifact_type="json",
                content=output.model_dump_json(),
                confidence=meta["confidence"],
                assumptions=json.dumps(meta["assumptions"], ensure_ascii=False),
                critic_notes=meta["critic_notes"],
                retry_count=meta["retry_count"],
                error_log=meta["error_log"],
            )
            db.add(artifact)
            t = db.get(Task, task_id)
            t.status = "waiting_review" if current_stage in APPROVAL_STAGES else "running"
            db.commit()

        await manager.broadcast(f"task:{task_id}", "stage_update", {
            "stage": current_stage, "status": t.status,
            "confidence": meta["confidence"], "assumptions": meta["assumptions"],
            "critic_notes": meta["critic_notes"], "retry_count": meta["retry_count"],
            "output": output.model_dump(),
        })

        # 需要审批 → 暂停，等人工 approve 后前端调 /advance
        if current_stage in APPROVAL_STAGES:
            await notify_human_required(task_id, current_stage, f"{current_stage} 完成，请审批")
            return

        # 自动推进
        idx = STAGE_ORDER.index(current_stage)
        current_stage = STAGE_ORDER[idx + 1]

    # 全部完成
    with Session(engine) as db:
        t = db.get(Task, task_id)
        t.status = "done"
        t.stage = "done"
        db.commit()
    await manager.broadcast(f"task:{task_id}", "task_done", {"task_id": task_id})
```

---

## Task 7: 更新 Pipeline Router + Tasks Router

**Files:**
- Modify: `backend/app/routers/pipeline.py`
- Modify: `backend/app/routers/tasks.py`

### pipeline.py（精简版）

```python
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task
from ..scheduler import scheduler

router = APIRouter(prefix="/api/pipeline", tags=["流水线"])

def get_db():
    with Session(engine) as s: yield s

@router.post("/{task_id}/run/{stage}")
async def run_stage(task_id: int, stage: str, bg: BackgroundTasks, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t: return {"error": "not found"}
    t.stage = stage
    t.status = "pending"
    db.commit()
    bg.add_task(scheduler.enqueue, task_id)
    return {"status": "queued", "task_id": task_id, "stage": stage}

@router.post("/{task_id}/run-analysis")   # 向后兼容
async def run_analysis(task_id: int, bg: BackgroundTasks, db: Session = Depends(get_db)):
    return await run_stage(task_id, "analysis", bg, db)
```

### tasks.py：`/advance` 端点触发下一阶段

在 `advance` 端点完成状态更新后，额外调用 `run_pipeline` 继续执行：

```python
@router.post("/{task_id}/advance")
async def advance_task(task_id: int, bg: BackgroundTasks, db: Session = Depends(get_db)):
    from ..pipeline.engine import PipelineEngine, STAGE_ORDER
    from ..pipeline.runner import run_pipeline
    t = db.get(Task, task_id)
    if not t or t.status != "approved": return {"error": "not approved"}
    engine = PipelineEngine()
    next_stage = engine.next_stage(t.stage)
    t.stage = next_stage
    t.status = "running" if next_stage != "done" else "done"
    db.commit()
    if next_stage != "done":
        worktree = t.worktree_path or "/tmp"
        bg.add_task(run_pipeline, task_id, worktree)
    return {"stage": next_stage, "status": t.status}
```

---

## Task 8: 知识库 API

**Files:**
- Create: `backend/app/routers/knowledge.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import engine
from ..models import ProjectKnowledge

router = APIRouter(prefix="/api/projects", tags=["知识库"])

def get_db():
    with Session(engine) as s: yield s

@router.get("/{project_id}/knowledge")
def list_knowledge(project_id: int, db: Session = Depends(get_db)):
    rows = db.query(ProjectKnowledge).filter(
        ProjectKnowledge.project_id == project_id
    ).order_by(ProjectKnowledge.created_at.desc()).limit(50).all()
    return [{"id": r.id, "stage": r.stage, "category": r.category,
             "title": r.title, "content": r.content,
             "created_at": r.created_at.isoformat()} for r in rows]

@router.delete("/{project_id}/knowledge/{knowledge_id}")
def delete_knowledge(project_id: int, knowledge_id: int, db: Session = Depends(get_db)):
    k = db.get(ProjectKnowledge, knowledge_id)
    if k and k.project_id == project_id:
        db.delete(k)
        db.commit()
    return {"ok": True}
```

---

## Task 9: 前端 API 类型更新

**Files:**
- Modify: `frontend/src/lib/api.ts`

新增/修改类型和接口：

```typescript
// StageArtifact 新字段
export interface StageArtifact {
  id: number; task_id: number; stage: string; artifact_type: string;
  content: string;
  confidence?: number;
  assumptions?: string;   // JSON string[]
  critic_notes?: string;
  retry_count?: number;
  error_log?: string;
  created_at: string;
}

// Task 新字段
export interface Task {
  id: number; project_id: number; title: string; description: string;
  stage: string; status: string;
  depends_on?: string;      // JSON number[]
  worktree_path?: string;
  branch_name?: string;
  queued_at?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string; updated_at: string;
}

// 知识库
export interface ProjectKnowledge {
  id: number; stage: string; category: string;
  title: string; content: string; created_at: string;
}

// API 新增
knowledge: {
  list: (projectId: number) => fetchJSON<ProjectKnowledge[]>(`/api/projects/${projectId}/knowledge`),
  delete: (projectId: number, id: number) =>
    fetchJSON(`/api/projects/${projectId}/knowledge/${id}`, { method: "DELETE" }),
},
pipeline: {
  runStage: (taskId: number, stage: string) =>
    fetchJSON(`/api/pipeline/${taskId}/run/${stage}`, { method: "POST" }),
  runAnalysis: (taskId: number) =>
    fetchJSON(`/api/pipeline/${taskId}/run-analysis`, { method: "POST" }),
},
```

---

## Task 10: 前端 TaskPipeline 透明度 UI 重写

**Files:**
- Modify: `frontend/src/pages/TaskPipeline.tsx`

核心组件：

```tsx
// 置信度进度条
function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? "bg-green-400 text-green-400"
              : value >= 0.5  ? "bg-yellow-400 text-yellow-400"
              :                  "bg-red-400 text-red-400";
  const [bgColor, textColor] = color.split(" ");
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1 bg-[#21262d] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bgColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono w-8 text-right ${textColor}`}>{pct}%</span>
    </div>
  );
}

// 假设列表（带"标记有误"按钮）
function AssumptionsList({ assumptions }: { assumptions: string[] }) {
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  if (!assumptions.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] uppercase tracking-wider text-[#484f58]">AI 假设（可标记有误）</p>
      {assumptions.map((a, i) => (
        <div key={i} className={cn(
          "flex items-start gap-2 text-[11px] px-2 py-1 rounded transition-colors",
          flagged.has(i) ? "bg-red-500/10 text-red-400 line-through" : "text-[#c9d1d9]"
        )}>
          <span className={cn("mt-0.5 shrink-0", flagged.has(i) ? "text-red-400" : "text-yellow-400")}>△</span>
          <span className="flex-1">{a}</span>
          <button onClick={() => setFlagged(s => {
            const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n;
          })} className="text-[9px] text-[#484f58] hover:text-red-400 shrink-0 transition-colors">
            {flagged.has(i) ? "撤销" : "有误"}
          </button>
        </div>
      ))}
    </div>
  );
}

// 阶段结果卡片
function StageCard({ artifact }: { artifact: StageArtifact }) {
  const [open, setOpen] = useState(true);
  const confidence = artifact.confidence ?? 0;
  const assumptions: string[] = artifact.assumptions ? JSON.parse(artifact.assumptions) : [];

  return (
    <div className="border border-[#30363d] rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#161b22] hover:bg-[#1c2128] transition-colors">
        <span className="text-[11px] font-semibold text-[#e6edf3] w-16 shrink-0">
          {STAGE_LABEL[artifact.stage]}
        </span>
        {(artifact.retry_count ?? 0) > 0 && (
          <span className="text-[9px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded font-mono shrink-0">
            重试{artifact.retry_count}次
          </span>
        )}
        <ConfidenceMeter value={confidence} />
        <span className="text-[#484f58] text-[10px] shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 bg-[#0d1117] border-t border-[#21262d]">
          <AssumptionsList assumptions={assumptions} />
          {artifact.critic_notes && (
            <p className="text-[10px] text-[#484f58] font-mono border-l-2 border-[#21262d] pl-2">
              {artifact.critic_notes}
            </p>
          )}
          <StageContent stage={artifact.stage} content={artifact.content} />
        </div>
      )}
    </div>
  );
}
```

`StageContent` 根据 stage 渲染：
- `analysis`：3 张方案选择卡
- `prd`：用户故事 + 验收标准两列
- `plan`：里程碑时间线 + 组件表

---

## Task 11: 前端项目知识库面板

**Files:**
- Create: `frontend/src/components/KnowledgePanel.tsx`

展示项目的历史错误经验，用户可删除：

```tsx
export function KnowledgePanel({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ProjectKnowledge[]>([]);
  useEffect(() => {
    api.knowledge.list(projectId).then(setItems).catch(() => {});
  }, [projectId]);

  const CATEGORY_COLORS: Record<string, string> = {
    error_pattern: "text-red-400 bg-red-500/10",
    validation_fail: "text-orange-400 bg-orange-500/10",
    rejected_assumption: "text-yellow-400 bg-yellow-500/10",
    wrong_tech_choice: "text-purple-400 bg-purple-500/10",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-[#e6edf3]">项目知识库</p>
        <span className="text-[9px] text-[#484f58]">{items.length} 条经验</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-[#484f58]">暂无记录，AI 出错时自动积累</p>
      ) : items.map(item => (
        <div key={item.id} className="border border-[#21262d] rounded-md p-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono",
              CATEGORY_COLORS[item.category] || "text-gray-400 bg-gray-500/10")}>
              {item.category}
            </span>
            <span className="text-[10px] text-[#8b949e] flex-1 truncate">{item.title}</span>
            <button onClick={() => api.knowledge.delete(projectId, item.id)
              .then(() => setItems(s => s.filter(i => i.id !== item.id)))}
              className="text-[9px] text-[#484f58] hover:text-red-400 transition-colors">删除</button>
          </div>
          <p className="text-[10px] text-[#c9d1d9]">{item.content}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## Task 12: main.py 注册新路由

**Files:**
- Modify: `backend/app/main.py`

```python
from .routers.knowledge import router as knowledge_router
app.include_router(knowledge_router)
```

---

## Task 13: 连通测试

```bash
# 1. 启动
bash start.sh

# 2. 建项目+任务，触发调度
curl -X POST http://localhost:8000/api/projects -H "Content-Type: application/json" \
  -d '{"name":"测试","repo_url":"","max_parallel":2}'
curl -X POST http://localhost:8000/api/projects/1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"用户登录","description":"邮箱密码登录，支持记住我"}'
curl -X POST http://localhost:8000/api/pipeline/1/run/analysis

# 3. 检查 artifact 有新字段
curl http://localhost:8000/api/tasks/1/artifacts | python3 -m json.tool

# 4. 检查知识库（初始为空）
curl http://localhost:8000/api/projects/1/knowledge

# 5. 浏览器验证
# http://localhost:3010 → 打开任务 → 看阶段卡片（置信度/假设/Critic）
```

---

## 执行顺序

```
Task 1 (DB Schema)
  → Task 2 (Pydantic Schemas)
    → Task 3 (Executor 基类)
      → Task 4 (三个 Stage)
        → Task 5 (Scheduler)
          → Task 6 (Runner)
            → Task 7 (Router 更新)
              → Task 8 (Knowledge API)
                → Task 9 (前端类型)
                  → Task 10 (TaskPipeline UI)
                    → Task 11 (KnowledgePanel)
                      → Task 12 (路由注册)
                        → Task 13 (测试)
```

---

## 最终效果

```
项目视图：
  Task A: 登录功能  [运行中 ████░ analysis]  worktree: .worktrees/task-1
  Task B: 商品列表  [排队中 ⏳]  等待空位
  Task C: 集成测试  [等待依赖 A+B]

任务详情：
┌─ Analysis ── 重试1次 ── 置信度 ████░ 82% ─────────────────┐
│ △ 假设: 使用 PostgreSQL                                    │
│ △ 假设: 需支持移动端              [标记有误]               │
│ ◎ 评分8/10 | 建议方案B描述可更具体                         │
│ [方案A] [方案B★推荐] [方案C]                               │
└────────────────────────────────────────────────────────────┘
┌─ PRD ── 自动触发 ── 置信度 █████ 90% ────────────────────┐
│ ...                                                        │
└────────────────────────────────────────────────────────────┘

项目知识库：
  [error_pattern]  analysis 超出重试次数: 连续3次JSON格式错误
  [rejected_assumption] 错误假设: 用户使用 PostgreSQL (实际是 MySQL)
```

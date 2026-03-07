# 任务创建工作流重构 - 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 TaskConductor 的任务创建从简单表单升级为 AI 驱动的双模式（快速/AI辅助）智能创建工作流，含模板系统、语音输入、多方案选择和交互式 Workflow 流程图。

**Architecture:** 分 5 个 Phase 交付。Phase 1 后端数据模型 + 模板 → Phase 2 AI 评估 API → Phase 3 前端快速模式 → Phase 4 前端 AI 辅助模式 + 方案选择 + Workflow → Phase 5 语音系统。每个 Phase 可独立验证。

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (后端), React + TypeScript + Tailwind + @xyflow/react (前端), Web Speech API + Whisper (语音)

**Design Doc:** `docs/plans/2026-03-08-task-creation-workflow-design.md`

---

## Phase 1: 后端数据模型 + 模板系统

### Task 1: TaskTemplate 模型 + Task 扩展字段

**Files:**
- Modify: `backend/app/models.py:54-73` (Task 模型扩展)
- Modify: `backend/app/models.py` (末尾新增 TaskTemplate)
- Modify: `backend/app/schemas.py` (新增 schema)
- Modify: `backend/app/main.py:55-68` (迁移逻辑)

**Step 1: 在 models.py 的 Task 类中添加 4 个新字段**

在 `backend/app/models.py` 的 Task 类中，`finished_at` 之后添加：

```python
# 任务创建工作流字段
template_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
requirement_doc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # JSON
selected_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)      # JSON
creation_mode: Mapped[str] = mapped_column(String(20), default="quick")        # quick | ai_assisted
```

**Step 2: 在 models.py 末尾添加 TaskTemplate 类**

在 `ConversationNote` 类之后添加：

```python
class TaskTemplate(Base):
    """任务模板 - 内置 + 从已完成任务学习生成"""
    __tablename__ = "task_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(40))
    # feature | bugfix | api | ui | refactor | custom
    description: Mapped[str] = mapped_column(Text, default="")
    stage_config: Mapped[str] = mapped_column(Text, default="[]")     # JSON list[str]
    prompt_hints: Mapped[str] = mapped_column(Text, default="[]")     # JSON list[str]
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=True)
    learned_from_task_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

**Step 3: 在 schemas.py 中添加对应 schema**

```python
# ── 任务模板 ──

class TaskTemplateOut(BaseModel):
    id: int
    name: str
    category: str
    description: str
    stage_config: str          # JSON list[str]
    prompt_hints: str          # JSON list[str]
    is_builtin: bool
    learned_from_task_id: Optional[int] = None
    project_id: Optional[int] = None
    use_count: int
    created_at: datetime
    model_config = {"from_attributes": True}


class TaskTemplateCreate(BaseModel):
    name: str
    category: str
    description: str = ""
    stage_config: list[str] = []
    prompt_hints: list[str] = []
    project_id: Optional[int] = None


# ── 需求评估 ──

class RequirementDoc(BaseModel):
    title: str
    features: list[str] = []
    tech_approach: str = ""
    acceptance_criteria: list[str] = []
    risks: list[str] = []
    dependencies: list[int] = []
    file_changes: list[dict] = []       # [{path, action, description}]
    test_strategy: str = ""


class EvaluateRequest(BaseModel):
    project_id: int
    description: str
    template_id: Optional[int] = None


class EvaluateResponse(BaseModel):
    requirement_doc: RequirementDoc
    suggested_template: Optional[str] = None
    confidence: float = 0.0


class RefineRequest(BaseModel):
    project_id: int
    current_doc: RequirementDoc
    feedback: str


class RefineResponse(BaseModel):
    requirement_doc: RequirementDoc
    changes_summary: str


# ── 执行方案 ──

class StageDetail(BaseModel):
    stage: str
    description: str
    needs_approval: bool = False


class ExecutionPlan(BaseModel):
    id: str
    name: str
    complexity_level: str       # quick | standard | full
    tech_stack: list[str] = []
    estimated_stages: int = 0
    stage_details: list[StageDetail] = []
    pros: list[str] = []
    cons: list[str] = []


class GeneratePlansRequest(BaseModel):
    project_id: int
    requirement_doc: RequirementDoc


class GeneratePlansResponse(BaseModel):
    plans: list[ExecutionPlan]


class CreateWithPlanRequest(BaseModel):
    project_id: int
    requirement_doc: RequirementDoc
    selected_plan_id: str
    auto_start: bool = True


# 扩展 TaskOut 以包含新字段
class TaskOutExtended(TaskOut):
    template_id: Optional[int] = None
    requirement_doc: Optional[str] = None
    selected_plan: Optional[str] = None
    creation_mode: str = "quick"
```

**Step 4: 在 main.py lifespan 中添加迁移逻辑**

在 `backend/app/main.py` 的 lifespan 函数中，飞书字段迁移之后添加：

```python
# 任务创建工作流字段迁移
for col_sql in [
    "ALTER TABLE tasks ADD COLUMN template_id INTEGER",
    "ALTER TABLE tasks ADD COLUMN requirement_doc TEXT",
    "ALTER TABLE tasks ADD COLUMN selected_plan TEXT",
    "ALTER TABLE tasks ADD COLUMN creation_mode VARCHAR(20) DEFAULT 'quick'",
]:
    try:
        with engine.connect() as conn:
            conn.execute(text(col_sql))
            conn.commit()
    except Exception:
        pass
```

**Step 5: 验证模型创建**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -c "from app.models import TaskTemplate, Task; print('OK')"`
Expected: OK

**Step 6: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/main.py
git commit -m "feat: add TaskTemplate model and Task extension fields for creation workflow"
```

---

### Task 2: 模板路由 + 内置模板种子数据

**Files:**
- Create: `backend/app/routers/templates.py`
- Modify: `backend/app/main.py` (注册路由)

**Step 1: 创建 templates.py 路由**

创建 `backend/app/routers/templates.py`：

```python
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import engine
from ..models import TaskTemplate, Task
from ..schemas import TaskTemplateOut, TaskTemplateCreate

router = APIRouter(prefix="/api/templates", tags=["模板"])

BUILTIN_TEMPLATES = [
    {
        "name": "全栈功能",
        "category": "feature",
        "description": "包含前后端的完整功能开发",
        "stage_config": json.dumps(["analysis", "prd", "design", "plan", "dev", "test", "deploy"]),
        "prompt_hints": json.dumps([
            "前端和后端的比重大概是什么样的？",
            "需要新建数据库表吗？",
            "有没有相关的设计稿或参考？",
            "需要对接哪些外部 API？",
        ]),
    },
    {
        "name": "Bug 修复",
        "category": "bugfix",
        "description": "定位并修复已知问题",
        "stage_config": json.dumps(["analysis", "plan", "dev", "test"]),
        "prompt_hints": json.dumps([
            "能稳定复现吗？复现步骤是什么？",
            "有报错日志或截图吗？",
            "影响范围有多大？是否阻塞其他功能？",
        ]),
    },
    {
        "name": "API 开发",
        "category": "api",
        "description": "后端接口设计与实现",
        "stage_config": json.dumps(["analysis", "prd", "plan", "dev", "test", "deploy"]),
        "prompt_hints": json.dumps([
            "RESTful 还是 GraphQL？",
            "需要鉴权吗？什么鉴权方式？",
            "预期的请求量级是多少？",
        ]),
    },
    {
        "name": "UI 组件",
        "category": "ui",
        "description": "前端界面组件开发",
        "stage_config": json.dumps(["analysis", "design", "dev", "test"]),
        "prompt_hints": json.dumps([
            "有设计稿吗？Figma 链接？",
            "需要响应式适配吗？",
            "是否支持深色/浅色主题切换？",
        ]),
    },
    {
        "name": "重构优化",
        "category": "refactor",
        "description": "代码结构优化或性能提升",
        "stage_config": json.dumps(["analysis", "plan", "dev", "test"]),
        "prompt_hints": json.dumps([
            "是性能优化还是结构重构？",
            "影响哪些模块？",
            "有基准测试数据吗？",
        ]),
    },
    {
        "name": "自定义",
        "category": "custom",
        "description": "自由配置阶段的任务",
        "stage_config": json.dumps([]),
        "prompt_hints": json.dumps(["你需要哪些执行阶段？"]),
    },
]


def get_db():
    with Session(engine) as session:
        yield session


def seed_builtins(db: Session):
    """首次启动时插入内置模板"""
    existing = db.query(TaskTemplate).filter(TaskTemplate.is_builtin == True).count()
    if existing > 0:
        return
    for t in BUILTIN_TEMPLATES:
        db.add(TaskTemplate(**t, is_builtin=True))
    db.commit()


@router.get("", response_model=list[TaskTemplateOut], summary="获取所有模板")
def list_templates(project_id: int | None = None, db: Session = Depends(get_db)):
    seed_builtins(db)
    q = db.query(TaskTemplate)
    if project_id is not None:
        # 全局模板 + 该项目专属模板
        q = q.filter(
            (TaskTemplate.project_id == None) | (TaskTemplate.project_id == project_id)
        )
    return q.order_by(TaskTemplate.is_builtin.desc(), TaskTemplate.use_count.desc()).all()


@router.get("/suggest", response_model=list[TaskTemplateOut], summary="根据项目推荐模板")
def suggest_templates(project_id: int, db: Session = Depends(get_db)):
    seed_builtins(db)
    # 项目专属学习模板优先 → 全局学习模板 → 内置模板
    templates = db.query(TaskTemplate).filter(
        (TaskTemplate.project_id == None) | (TaskTemplate.project_id == project_id)
    ).all()

    def sort_key(t: TaskTemplate):
        if t.project_id == project_id and not t.is_builtin:
            return (0, -t.use_count)  # 项目专属学习模板
        if not t.is_builtin:
            return (1, -t.use_count)  # 全局学习模板
        return (2, -t.use_count)      # 内置模板

    return sorted(templates, key=sort_key)


@router.post("", response_model=TaskTemplateOut, summary="创建模板")
def create_template(body: TaskTemplateCreate, db: Session = Depends(get_db)):
    t = TaskTemplate(
        name=body.name,
        category=body.category,
        description=body.description,
        stage_config=json.dumps(body.stage_config),
        prompt_hints=json.dumps(body.prompt_hints),
        is_builtin=False,
        project_id=body.project_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}", summary="删除模板")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    t = db.get(TaskTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.is_builtin:
        raise HTTPException(400, "Cannot delete builtin template")
    db.delete(t)
    db.commit()
    return {"ok": True}
```

**Step 2: 在 main.py 中注册路由**

在 `backend/app/main.py` 的 import 区域添加：

```python
from .routers import templates as templates_router
```

在路由注册区域（搜索 `app.include_router`）添加：

```python
app.include_router(templates_router.router)
```

**Step 3: 验证 API**

Run: `cd /home/sichengli/Documents/code2/task-conductor && bash start.sh`（后台启动）
Run: `curl -s http://localhost:8765/api/templates | python3 -m json.tool | head -20`
Expected: 返回 6 个内置模板的 JSON 数组

**Step 4: Commit**

```bash
git add backend/app/routers/templates.py backend/app/main.py
git commit -m "feat: add template system with 6 builtin templates and CRUD API"
```

---

## Phase 2: AI 评估 API

### Task 3: 任务评估路由（evaluate / refine / generate-plans / create-with-plan）

**Files:**
- Create: `backend/app/routers/task_creation.py`
- Modify: `backend/app/main.py` (注册路由)

**Step 1: 创建 task_creation.py**

创建 `backend/app/routers/task_creation.py`：

```python
"""
任务创建工作流 API：
- evaluate: AI 分析需求生成需求文档
- refine: 根据用户反馈修改需求文档
- generate-plans: 生成多个执行方案
- create-with-plan: 确认方案后创建任务并入队
"""
import json
import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, TaskTemplate, Project
from ..schemas import (
    EvaluateRequest, EvaluateResponse, RequirementDoc,
    RefineRequest, RefineResponse,
    GeneratePlansRequest, GeneratePlansResponse, ExecutionPlan, StageDetail,
    CreateWithPlanRequest, TaskOut,
)
from ..claude.pool import ClaudePool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tasks", tags=["任务创建"])
pool = ClaudePool()


def get_db():
    with Session(engine) as session:
        yield session


def _get_project_context(project_id: int, db: Session) -> str:
    """获取项目上下文信息用于 AI prompt"""
    project = db.get(Project, project_id)
    if not project:
        return ""
    # 最近完成的任务作为上下文
    recent_tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == "done",
    ).order_by(Task.finished_at.desc()).limit(5).all()

    ctx_parts = [f"项目名称: {project.name}"]
    if project.repo_url:
        ctx_parts.append(f"仓库: {project.repo_url}")
    if recent_tasks:
        ctx_parts.append("最近完成的任务:")
        for t in recent_tasks:
            ctx_parts.append(f"  - {t.title}")
    return "\n".join(ctx_parts)


def _get_template_context(template_id: int | None, db: Session) -> str:
    """获取模板上下文"""
    if not template_id:
        return ""
    template = db.get(TaskTemplate, template_id)
    if not template:
        return ""
    hints = json.loads(template.prompt_hints) if template.prompt_hints else []
    stages = json.loads(template.stage_config) if template.stage_config else []
    return (
        f"用户选择了 '{template.name}' 模板。\n"
        f"推荐阶段: {', '.join(stages)}\n"
        f"引导问题: {'; '.join(hints)}"
    )


EVALUATE_PROMPT = """你是一个任务需求分析专家。用户提交了一个软件开发需求，请分析并生成结构化的需求文档。

{project_context}
{template_context}

用户需求描述：
{description}

请输出以下 JSON 格式（不要输出其他内容）：
```json
{{
  "title": "简洁的任务标题（10字以内）",
  "features": ["功能点1", "功能点2", ...],
  "tech_approach": "推荐的技术方案描述",
  "acceptance_criteria": ["验收标准1", "验收标准2", ...],
  "risks": ["潜在风险1", ...],
  "dependencies": [],
  "file_changes": [{{"path": "预估变更文件路径", "action": "create/modify", "description": "变更描述"}}],
  "test_strategy": "测试策略描述",
  "suggested_template": "最匹配的模板类别: feature/bugfix/api/ui/refactor",
  "confidence": 0.85
}}
```"""


REFINE_PROMPT = """你是一个任务需求分析专家。用户对当前需求文档提出了修改意见，请据此更新文档。

当前需求文档：
{current_doc}

用户修改意见：
{feedback}

请输出更新后的 JSON 格式（与原结构一致，不要输出其他内容）：
```json
{{
  "title": "...",
  "features": [...],
  "tech_approach": "...",
  "acceptance_criteria": [...],
  "risks": [...],
  "dependencies": [],
  "file_changes": [...],
  "test_strategy": "...",
  "changes_summary": "本次修改摘要"
}}
```"""


PLANS_PROMPT = """你是一个软件架构师。根据以下需求文档，生成 3 个不同复杂度和技术路线的执行方案。

需求文档：
{requirement_doc}

{project_context}

请输出以下 JSON 格式（不要输出其他内容）：
```json
{{
  "plans": [
    {{
      "id": "plan_quick",
      "name": "快速方案",
      "complexity_level": "quick",
      "tech_stack": ["技术1", "技术2"],
      "estimated_stages": 3,
      "stage_details": [
        {{"stage": "analysis", "description": "分析需求", "needs_approval": true}},
        {{"stage": "dev", "description": "实现功能", "needs_approval": false}},
        {{"stage": "test", "description": "基础测试", "needs_approval": false}}
      ],
      "pros": ["开发速度快", "..."],
      "cons": ["覆盖不全面", "..."]
    }},
    {{
      "id": "plan_standard",
      "name": "标准方案",
      "complexity_level": "standard",
      ...
    }},
    {{
      "id": "plan_full",
      "name": "完整方案",
      "complexity_level": "full",
      ...
    }}
  ]
}}
```"""


def _extract_json(text: str) -> dict:
    """从 Claude 输出中提取 JSON"""
    import re
    # 尝试从 ```json ... ``` 中提取
    m = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    # 尝试直接解析
    # 找到第一个 { 和最后一个 }
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        return json.loads(text[start:end + 1])
    raise ValueError(f"Cannot extract JSON from: {text[:200]}")


async def _call_claude(prompt: str, cwd: str = "/tmp") -> str:
    """调用 Claude 获取完整文本响应"""
    import asyncio
    import os

    env = {**os.environ}
    env.pop("CLAUDECODE", None)

    proc = await asyncio.create_subprocess_exec(
        "claude", "-p", prompt,
        "--output-format", "text",
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Claude exited {proc.returncode}: {stderr.decode()[:500]}")
    return stdout.decode()


@router.post("/evaluate", response_model=EvaluateResponse, summary="AI 评估需求生成需求文档")
async def evaluate_task(body: EvaluateRequest, db: Session = Depends(get_db)):
    project_ctx = _get_project_context(body.project_id, db)
    template_ctx = _get_template_context(body.template_id, db)

    prompt = EVALUATE_PROMPT.format(
        project_context=project_ctx,
        template_context=template_ctx,
        description=body.description,
    )

    raw = await _call_claude(prompt)
    data = _extract_json(raw)

    doc = RequirementDoc(
        title=data.get("title", ""),
        features=data.get("features", []),
        tech_approach=data.get("tech_approach", ""),
        acceptance_criteria=data.get("acceptance_criteria", []),
        risks=data.get("risks", []),
        dependencies=data.get("dependencies", []),
        file_changes=data.get("file_changes", []),
        test_strategy=data.get("test_strategy", ""),
    )

    return EvaluateResponse(
        requirement_doc=doc,
        suggested_template=data.get("suggested_template"),
        confidence=data.get("confidence", 0.0),
    )


@router.post("/refine", response_model=RefineResponse, summary="根据反馈修改需求文档")
async def refine_task(body: RefineRequest, db: Session = Depends(get_db)):
    prompt = REFINE_PROMPT.format(
        current_doc=body.current_doc.model_dump_json(indent=2),
        feedback=body.feedback,
    )

    raw = await _call_claude(prompt)
    data = _extract_json(raw)

    doc = RequirementDoc(
        title=data.get("title", ""),
        features=data.get("features", []),
        tech_approach=data.get("tech_approach", ""),
        acceptance_criteria=data.get("acceptance_criteria", []),
        risks=data.get("risks", []),
        dependencies=data.get("dependencies", []),
        file_changes=data.get("file_changes", []),
        test_strategy=data.get("test_strategy", ""),
    )

    return RefineResponse(
        requirement_doc=doc,
        changes_summary=data.get("changes_summary", ""),
    )


@router.post("/generate-plans", response_model=GeneratePlansResponse, summary="生成执行方案")
async def generate_plans(body: GeneratePlansRequest, db: Session = Depends(get_db)):
    project_ctx = _get_project_context(body.project_id, db)

    prompt = PLANS_PROMPT.format(
        requirement_doc=body.requirement_doc.model_dump_json(indent=2),
        project_context=project_ctx,
    )

    raw = await _call_claude(prompt)
    data = _extract_json(raw)

    plans = []
    for p in data.get("plans", []):
        plans.append(ExecutionPlan(
            id=p["id"],
            name=p["name"],
            complexity_level=p.get("complexity_level", "standard"),
            tech_stack=p.get("tech_stack", []),
            estimated_stages=p.get("estimated_stages", 0),
            stage_details=[StageDetail(**s) for s in p.get("stage_details", [])],
            pros=p.get("pros", []),
            cons=p.get("cons", []),
        ))

    return GeneratePlansResponse(plans=plans)


@router.post("/create-with-plan", response_model=TaskOut, summary="确认方案并创建任务")
async def create_with_plan(
    body: CreateWithPlanRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # 查找选中的方案（从前端传来的 plans 中匹配）
    doc = body.requirement_doc

    task = Task(
        project_id=body.project_id,
        title=doc.title,
        description=doc.tech_approach or "\n".join(doc.features),
        stage="input",
        status="pending",
        requirement_doc=doc.model_dump_json(),
        selected_plan=body.selected_plan_id,
        creation_mode="ai_assisted",
        depends_on=json.dumps(doc.dependencies) if doc.dependencies else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 更新模板使用次数
    if body.requirement_doc:
        pass  # 后续 template_learner 处理

    # 自动入队
    if body.auto_start:
        from ..scheduler import scheduler
        bg.add_task(scheduler.enqueue, task.id)

    return task
```

**Step 2: 在 main.py 中注册路由**

在 import 区域添加：

```python
from .routers import task_creation as task_creation_router
```

在路由注册区域添加：

```python
app.include_router(task_creation_router.router)
```

**Step 3: 验证 API 可访问**

Run: `curl -s http://localhost:8765/docs | grep -c "evaluate"`
Expected: 包含 evaluate 端点

**Step 4: Commit**

```bash
git add backend/app/routers/task_creation.py backend/app/main.py
git commit -m "feat: add AI task evaluation, refinement, plan generation, and creation APIs"
```

---

### Task 4: 模板学习引擎

**Files:**
- Create: `backend/app/pipeline/template_learner.py`
- Modify: `backend/app/pipeline/runner.py` (完成时触发学习)

**Step 1: 创建 template_learner.py**

```python
"""
模板学习引擎：任务完成后分析执行模式，自动生成新模板。
- 匹配度 > 80%: 更新现有模板权重
- 同 pattern 出现 3 次以上: 自动创建新模板
"""
import json
import logging
from collections import Counter
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact, TaskTemplate

logger = logging.getLogger(__name__)

# 内置模板的阶段配置（用于匹配度计算）
BUILTIN_PATTERNS = {
    "feature": {"analysis", "prd", "design", "plan", "dev", "test", "deploy"},
    "bugfix": {"analysis", "plan", "dev", "test"},
    "api": {"analysis", "prd", "plan", "dev", "test", "deploy"},
    "ui": {"analysis", "design", "dev", "test"},
    "refactor": {"analysis", "plan", "dev", "test"},
}

# 内存中记录未匹配的 pattern 出现次数
_pattern_counter: Counter = Counter()


def _stages_from_artifacts(task_id: int, db: Session) -> set[str]:
    """从 StageArtifact 中提取任务实际执行过的阶段"""
    artifacts = db.query(StageArtifact.stage).filter(
        StageArtifact.task_id == task_id
    ).distinct().all()
    return {a.stage for a in artifacts}


def _match_score(actual: set[str], template: set[str]) -> float:
    """计算阶段集合的匹配度（Jaccard 相似度）"""
    if not actual and not template:
        return 1.0
    if not actual or not template:
        return 0.0
    return len(actual & template) / len(actual | template)


def learn_from_task(task_id: int):
    """任务完成后调用，分析执行模式并更新/创建模板"""
    with Session(engine) as db:
        task = db.get(Task, task_id)
        if not task or task.status != "done":
            return

        actual_stages = _stages_from_artifacts(task_id, db)
        if not actual_stages:
            return

        # 与所有模板比较
        templates = db.query(TaskTemplate).all()
        best_match = None
        best_score = 0.0

        for t in templates:
            t_stages = set(json.loads(t.stage_config)) if t.stage_config else set()
            score = _match_score(actual_stages, t_stages)
            if score > best_score:
                best_score = score
                best_match = t

        if best_score >= 0.8 and best_match:
            # 高匹配度：更新模板权重
            best_match.use_count += 1
            db.commit()
            logger.info(f"Task {task_id}: matched template '{best_match.name}' (score={best_score:.2f})")
        else:
            # 低匹配度：记录 pattern
            pattern_key = ",".join(sorted(actual_stages))
            _pattern_counter[pattern_key] += 1

            if _pattern_counter[pattern_key] >= 3:
                # 出现 3 次以上：自动创建新模板
                new_template = TaskTemplate(
                    name=f"学习模板-{pattern_key[:20]}",
                    category="custom",
                    description=f"从任务执行中自动学习生成（阶段: {pattern_key}）",
                    stage_config=json.dumps(sorted(actual_stages)),
                    prompt_hints=json.dumps([]),
                    is_builtin=False,
                    learned_from_task_id=task_id,
                    project_id=task.project_id,
                )
                db.add(new_template)
                db.commit()
                _pattern_counter[pattern_key] = 0
                logger.info(f"Task {task_id}: created new learned template '{new_template.name}'")
            else:
                logger.info(f"Task {task_id}: unmatched pattern '{pattern_key}' (count={_pattern_counter[pattern_key]})")
```

**Step 2: 在 runner.py 中触发学习**

在 `backend/app/pipeline/runner.py` 的 `run_pipeline` 函数中，当任务到达 "done" 阶段后，添加模板学习调用。找到设置 `task.status = "done"` 的地方，在其后添加：

```python
# 触发模板学习
from .template_learner import learn_from_task
try:
    learn_from_task(task.id)
except Exception as e:
    logger.warning(f"Template learning failed for task {task.id}: {e}")
```

**Step 3: Commit**

```bash
git add backend/app/pipeline/template_learner.py backend/app/pipeline/runner.py
git commit -m "feat: add template learning engine that auto-generates templates from completed tasks"
```

---

## Phase 3: 前端快速模式

### Task 5: API 接口定义 + TypeScript 类型

**Files:**
- Modify: `frontend/src/lib/api.ts` (新增接口)

**Step 1: 在 api.ts 中添加类型和接口**

在 `frontend/src/lib/api.ts` 的类型定义区域添加：

```typescript
// ── 任务创建工作流类型 ──

export interface TaskTemplate {
  id: number;
  name: string;
  category: string;
  description: string;
  stage_config: string;   // JSON list[str]
  prompt_hints: string;   // JSON list[str]
  is_builtin: boolean;
  learned_from_task_id: number | null;
  project_id: number | null;
  use_count: number;
  created_at: string;
}

export interface FileChange {
  path: string;
  action: "create" | "modify";
  description: string;
}

export interface RequirementDoc {
  title: string;
  features: string[];
  tech_approach: string;
  acceptance_criteria: string[];
  risks: string[];
  dependencies: number[];
  file_changes: FileChange[];
  test_strategy: string;
}

export interface StageDetail {
  stage: string;
  description: string;
  needs_approval: boolean;
}

export interface ExecutionPlan {
  id: string;
  name: string;
  complexity_level: "quick" | "standard" | "full";
  tech_stack: string[];
  estimated_stages: number;
  stage_details: StageDetail[];
  pros: string[];
  cons: string[];
}
```

在 `api` 对象中添加：

```typescript
templates: {
  list: (projectId?: number) =>
    request<TaskTemplate[]>(`/api/templates${projectId != null ? `?project_id=${projectId}` : ""}`),
  suggest: (projectId: number) =>
    request<TaskTemplate[]>(`/api/templates/suggest?project_id=${projectId}`),
  create: (body: { name: string; category: string; description?: string; stage_config?: string[]; prompt_hints?: string[]; project_id?: number }) =>
    request<TaskTemplate>("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/api/templates/${id}`, { method: "DELETE" }),
},

taskCreation: {
  evaluate: (body: { project_id: number; description: string; template_id?: number }) =>
    request<{ requirement_doc: RequirementDoc; suggested_template: string | null; confidence: number }>(
      "/api/tasks/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  refine: (body: { project_id: number; current_doc: RequirementDoc; feedback: string }) =>
    request<{ requirement_doc: RequirementDoc; changes_summary: string }>(
      "/api/tasks/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  generatePlans: (body: { project_id: number; requirement_doc: RequirementDoc }) =>
    request<{ plans: ExecutionPlan[] }>(
      "/api/tasks/generate-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  createWithPlan: (body: { project_id: number; requirement_doc: RequirementDoc; selected_plan_id: string; auto_start?: boolean }) =>
    request<Task>("/api/tasks/create-with-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
},
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add TypeScript types and API bindings for task creation workflow"
```

---

### Task 6: TemplateSelector + DependencyPicker 组件

**Files:**
- Create: `frontend/src/components/task-creation/TemplateSelector.tsx`
- Create: `frontend/src/components/task-creation/DependencyPicker.tsx`

**Step 1: 创建 TemplateSelector**

```typescript
// frontend/src/components/task-creation/TemplateSelector.tsx
import { useEffect, useState } from "react";
import { api, type TaskTemplate } from "../../lib/api";
import { cn } from "../../lib/utils";

const CATEGORY_ICONS: Record<string, string> = {
  feature: "🚀", bugfix: "🐛", api: "🔌", ui: "🎨", refactor: "♻️", custom: "⚙️",
};

interface Props {
  projectId: number;
  selected: number | null;
  onSelect: (template: TaskTemplate | null) => void;
}

export function TemplateSelector({ projectId, selected, onSelect }: Props) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);

  useEffect(() => {
    api.templates.suggest(projectId).then(setTemplates).catch(() => {});
  }, [projectId]);

  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(selected === t.id ? null : t)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border",
            selected === t.id
              ? "border-accent bg-accent/10 text-accent"
              : "border-app bg-app-tertiary text-app-secondary hover:border-accent/40",
            !t.is_builtin && "ring-1 ring-purple-500/20",
          )}
        >
          <span>{CATEGORY_ICONS[t.category] || "📋"}</span>
          <span>{t.name}</span>
          {!t.is_builtin && <span className="text-[8px] text-purple-400">🧠</span>}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: 创建 DependencyPicker**

```typescript
// frontend/src/components/task-creation/DependencyPicker.tsx
import { useEffect, useState } from "react";
import { api, type Task } from "../../lib/api";
import { cn } from "../../lib/utils";

interface Props {
  projectId: number;
  selected: number[];
  onChange: (ids: number[]) => void;
}

export function DependencyPicker({ projectId, selected, onChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.projects.tasks(projectId).then(setTasks).catch(() => {});
  }, [projectId]);

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  if (tasks.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app-secondary"
      >
        {selected.length > 0 ? `已选 ${selected.length} 个前置任务` : "选择前置任务（可选）"}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto bg-app-secondary border border-app rounded-md shadow-xl">
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-app-tertiary transition-colors flex items-center gap-2",
                selected.includes(t.id) && "bg-accent/10 text-accent",
              )}
            >
              <span className={cn("w-3 h-3 rounded border shrink-0",
                selected.includes(t.id) ? "bg-accent border-accent" : "border-app")} />
              <span className="truncate">{t.title}</span>
              <span className="text-[9px] text-app-tertiary ml-auto">{t.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
mkdir -p frontend/src/components/task-creation
git add frontend/src/components/task-creation/TemplateSelector.tsx frontend/src/components/task-creation/DependencyPicker.tsx
git commit -m "feat: add TemplateSelector and DependencyPicker components"
```

---

### Task 7: TaskCreationPanel 主面板 + 快速模式

**Files:**
- Create: `frontend/src/components/task-creation/TaskCreationPanel.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx` (替换 NewTaskButton)

**Step 1: 创建 TaskCreationPanel 主面板**

```typescript
// frontend/src/components/task-creation/TaskCreationPanel.tsx
import { useState, useCallback } from "react";
import { X, Zap, BrainCircuit, Mic } from "lucide-react";
import { api, type Task, type TaskTemplate, type RequirementDoc, type ExecutionPlan } from "../../lib/api";
import { Button } from "../ui/button";
import { TemplateSelector } from "./TemplateSelector";
import { DependencyPicker } from "./DependencyPicker";
import { cn } from "../../lib/utils";

type CreationPhase = "quick" | "ai_refining" | "plan_selection";

interface Props {
  projectId: number;
  onCreated: (task: Task) => void;
  onClose: () => void;
  initialMode?: "quick" | "ai_refining";
  initialDescription?: string;
}

export function TaskCreationPanel({ projectId, onCreated, onClose, initialMode = "quick", initialDescription = "" }: Props) {
  const [phase, setPhase] = useState<CreationPhase>(initialMode);
  const [mode, setMode] = useState<"quick" | "ai">(initialMode === "quick" ? "quick" : "ai");

  // 快速模式状态
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(initialDescription);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [dependsOn, setDependsOn] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // AI 辅助模式状态
  const [requirementDoc, setRequirementDoc] = useState<RequirementDoc | null>(null);
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // 快速创建
  const handleQuickCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const task = await api.tasks.create(projectId, {
        title: title.trim(),
        description: description.trim(),
        depends_on: dependsOn.length > 0 ? dependsOn : undefined,
      });
      onCreated(task);
    } finally {
      setLoading(false);
    }
  };

  // 切换到 AI 辅助模式
  const switchToAI = async () => {
    setMode("ai");
    setPhase("ai_refining");
    if (description.trim()) {
      // 自动发起评估
      setLoading(true);
      try {
        const result = await api.taskCreation.evaluate({
          project_id: projectId,
          description: description.trim(),
          template_id: selectedTemplate?.id,
        });
        setRequirementDoc(result.requirement_doc);
        setTitle(result.requirement_doc.title);
      } finally {
        setLoading(false);
      }
    }
  };

  // 确认需求 → 生成方案
  const handleConfirmRequirement = async () => {
    if (!requirementDoc) return;
    setLoading(true);
    try {
      const result = await api.taskCreation.generatePlans({
        project_id: projectId,
        requirement_doc: requirementDoc,
      });
      setPlans(result.plans);
      setPhase("plan_selection");
      if (result.plans.length > 0) {
        // 默认选中标准方案
        const std = result.plans.find((p) => p.complexity_level === "standard");
        setSelectedPlanId(std?.id || result.plans[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  // 选择方案并创建
  const handleCreateWithPlan = async () => {
    if (!requirementDoc || !selectedPlanId) return;
    setLoading(true);
    try {
      const task = await api.taskCreation.createWithPlan({
        project_id: projectId,
        requirement_doc: requirementDoc,
        selected_plan_id: selectedPlanId,
        auto_start: true,
      });
      onCreated(task);
    } finally {
      setLoading(false);
    }
  };

  // 描述超过 100 字提示
  const showAISuggestion = mode === "quick" && description.length > 100;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={cn(
        "bg-app-secondary border border-app rounded-xl shadow-2xl flex flex-col overflow-hidden",
        phase === "quick" ? "w-[520px] max-h-[600px]" : "w-[900px] max-h-[80vh]",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-app shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-app">新建任务</h2>
            <div className="flex bg-app-tertiary rounded-lg p-0.5">
              <button
                onClick={() => { setMode("quick"); setPhase("quick"); }}
                className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all",
                  mode === "quick" ? "bg-app-secondary text-app shadow-sm" : "text-app-tertiary hover:text-app")}
              >
                <Zap size={10} /> 快速
              </button>
              <button
                onClick={switchToAI}
                className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all",
                  mode === "ai" ? "bg-app-secondary text-app shadow-sm" : "text-app-tertiary hover:text-app")}
              >
                <BrainCircuit size={10} /> AI辅助
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-app-tertiary hover:text-app">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {phase === "quick" && (
            <>
              {/* 模板选择 */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-app-tertiary font-semibold mb-1.5 block">
                  选择模板（可选）
                </label>
                <TemplateSelector
                  projectId={projectId}
                  selected={selectedTemplate?.id ?? null}
                  onSelect={setSelectedTemplate}
                />
              </div>

              {/* 标题 */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-app-tertiary font-semibold mb-1.5 block">
                  任务标题
                </label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="简要描述你要做什么..."
                  className="w-full bg-app-tertiary border border-app rounded-md px-3 py-2 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-app-tertiary font-semibold mb-1.5 block">
                  需求描述
                </label>
                <div className="relative">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={selectedTemplate
                      ? `描述你的${selectedTemplate.name}需求...`
                      : "详细描述你想实现的功能、解决的问题..."
                    }
                    rows={5}
                    className="w-full bg-app-tertiary border border-app rounded-md px-3 py-2 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent resize-none"
                  />
                  {/* 语音输入按钮占位 - Phase 5 实现 */}
                </div>
                {/* 模板引导提示 */}
                {selectedTemplate && (
                  <div className="mt-2 p-2 bg-accent/5 border border-accent/20 rounded-md">
                    <p className="text-[9px] text-accent font-semibold mb-1">💡 引导提示</p>
                    {JSON.parse(selectedTemplate.prompt_hints).map((hint: string, i: number) => (
                      <p key={i} className="text-[10px] text-app-secondary">• {hint}</p>
                    ))}
                  </div>
                )}
                {/* 超过100字提示切换 AI */}
                {showAISuggestion && (
                  <button
                    onClick={switchToAI}
                    className="mt-2 w-full text-left p-2 bg-purple-500/5 border border-purple-500/20 rounded-md text-[10px] text-purple-400 hover:bg-purple-500/10 transition-colors"
                  >
                    ✨ 内容较详细，建议使用 AI 辅助模式优化需求 →
                  </button>
                )}
              </div>

              {/* 依赖选择 */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-app-tertiary font-semibold mb-1.5 block">
                  前置依赖
                </label>
                <DependencyPicker
                  projectId={projectId}
                  selected={dependsOn}
                  onChange={setDependsOn}
                />
              </div>
            </>
          )}

          {phase === "ai_refining" && (
            <div className="text-center py-8 text-app-tertiary text-xs">
              {loading ? (
                <div className="animate-pulse">🤖 AI 正在分析你的需求...</div>
              ) : requirementDoc ? (
                <div className="text-left space-y-3">
                  <h3 className="text-sm font-semibold text-app">{requirementDoc.title}</h3>
                  <div>
                    <p className="text-[9px] uppercase text-app-tertiary font-semibold mb-1">功能点</p>
                    {requirementDoc.features.map((f, i) => (
                      <p key={i} className="text-[11px] text-app-secondary">• {f}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-app-tertiary font-semibold mb-1">技术方案</p>
                    <p className="text-[11px] text-app-secondary">{requirementDoc.tech_approach}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-app-tertiary font-semibold mb-1">验收标准</p>
                    {requirementDoc.acceptance_criteria.map((c, i) => (
                      <p key={i} className="text-[11px] text-app-secondary">• {c}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-app-tertiary font-semibold mb-1">风险</p>
                    {requirementDoc.risks.map((r, i) => (
                      <p key={i} className="text-[11px] text-yellow-400">⚠ {r}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-app-tertiary font-semibold mb-1">文件变更预估</p>
                    {requirementDoc.file_changes.map((f, i) => (
                      <p key={i} className="text-[11px] text-app-secondary font-mono">
                        {f.action === "create" ? "+" : "~"} {f.path}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-app-tertiary font-semibold mb-1">测试策略</p>
                    <p className="text-[11px] text-app-secondary">{requirementDoc.test_strategy}</p>
                  </div>
                  {/* TODO: Phase 4 将替换为完整的 AI对话 + Markdown编辑 双栏布局 */}
                </div>
              ) : (
                <p>请在输入框中描述你的需求后切换到 AI 辅助模式</p>
              )}
            </div>
          )}

          {phase === "plan_selection" && (
            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-wider text-app-tertiary font-semibold">
                选择执行方案
              </p>
              <div className="grid grid-cols-3 gap-3">
                {plans.map((plan) => {
                  const icons = { quick: "⚡", standard: "⭐", full: "🏗️" };
                  const isSelected = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={cn(
                        "text-left p-4 rounded-xl border transition-all",
                        isSelected
                          ? "border-accent bg-accent/5 shadow-lg shadow-accent/10"
                          : "border-app bg-app-tertiary hover:border-accent/40",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{icons[plan.complexity_level] || "📋"}</span>
                        <span className="text-xs font-semibold text-app">{plan.name}</span>
                      </div>
                      <div className="space-y-1.5 text-[10px]">
                        <p className="text-app-tertiary">
                          {plan.tech_stack.join(" · ")}
                        </p>
                        <p className="text-app-secondary">
                          {plan.estimated_stages} 个阶段
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {plan.stage_details.map((s) => (
                            <span key={s.stage}
                              className={cn("px-1.5 py-0.5 rounded text-[8px]",
                                s.needs_approval
                                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                  : "bg-app-secondary text-app-tertiary"
                              )}
                            >
                              {s.stage} {s.needs_approval ? "🔒" : ""}
                            </span>
                          ))}
                        </div>
                        <div className="pt-2 border-t border-app/50 mt-2 space-y-0.5">
                          {plan.pros.map((p, i) => (
                            <p key={i} className="text-green-400">✓ {p}</p>
                          ))}
                          {plan.cons.map((c, i) => (
                            <p key={i} className="text-red-400">✗ {c}</p>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* TODO: Phase 4 将在此处添加 WorkflowPreview 流程图 */}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-app shrink-0">
          <div className="text-[9px] text-app-tertiary">
            {phase === "quick" && description.length > 0 && `${description.length} 字`}
            {phase === "ai_refining" && requirementDoc && `置信度: ${((requirementDoc as any).confidence || 0) * 100}%`}
            {phase === "plan_selection" && selectedPlanId && `已选: ${plans.find(p => p.id === selectedPlanId)?.name}`}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs text-app-tertiary hover:text-app px-3 py-1.5">
              取消
            </button>
            {phase === "quick" && (
              <>
                <Button variant="ghost" size="sm" onClick={switchToAI}>
                  <BrainCircuit size={12} className="mr-1" /> AI辅助
                </Button>
                <Button size="sm" onClick={handleQuickCreate} disabled={!title.trim() || loading}>
                  {loading ? "创建中..." : "创建"}
                </Button>
              </>
            )}
            {phase === "ai_refining" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setPhase("quick"); setMode("quick"); }}>
                  返回
                </Button>
                <Button size="sm" onClick={handleConfirmRequirement} disabled={!requirementDoc || loading}>
                  {loading ? "生成方案中..." : "✅ 确认需求 → 选方案"}
                </Button>
              </>
            )}
            {phase === "plan_selection" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setPhase("ai_refining")}>
                  返回修改
                </Button>
                <Button size="sm" onClick={handleCreateWithPlan} disabled={!selectedPlanId || loading}>
                  {loading ? "创建中..." : "🚀 开始执行"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: 在 Dashboard.tsx 中替换 NewTaskButton**

在 `Dashboard.tsx` 中：
1. 删除原 `NewTaskButton` 组件（行 593-645）
2. 导入 `TaskCreationPanel`：
```typescript
import { TaskCreationPanel } from "../components/task-creation/TaskCreationPanel";
```
3. 在项目头部区域，将原来调用 `NewTaskButton` 的地方替换为：
```typescript
const [taskCreationOpen, setTaskCreationOpen] = useState(false);

// 在 JSX 中：
<Button size="sm" onClick={() => setTaskCreationOpen(true)}>+ 新建任务</Button>

// 面板：
{taskCreationOpen && projectId && (
  <TaskCreationPanel
    projectId={projectId}
    onCreated={(t) => {
      setTasks((prev) => [t, ...prev]);
      onOpenTask(t.id);
      setTaskCreationOpen(false);
    }}
    onClose={() => setTaskCreationOpen(false)}
  />
)}
```

**Step 3: 验证前端编译**

Run: `cd /home/sichengli/Documents/code2/task-conductor/frontend && npx tsc --noEmit`
Expected: 无错误

**Step 4: Commit**

```bash
git add frontend/src/components/task-creation/TaskCreationPanel.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat: add TaskCreationPanel with quick mode, template selector, and dependency picker"
```

---

## Phase 4: AI 辅助模式 + 方案选择 + Workflow 流程图

### Task 8: AI 辅助模式双栏布局（对话 + 需求文档编辑）

**Files:**
- Create: `frontend/src/components/task-creation/AIAssistedMode.tsx`
- Create: `frontend/src/components/task-creation/RequirementDocPane.tsx`
- Modify: `frontend/src/components/task-creation/TaskCreationPanel.tsx` (集成)

**Step 1: 创建 RequirementDocPane（Markdown 编辑/预览）**

```typescript
// frontend/src/components/task-creation/RequirementDocPane.tsx
import { useState } from "react";
import { Eye, Pencil } from "lucide-react";
import type { RequirementDoc } from "../../lib/api";
import { cn } from "../../lib/utils";

interface Props {
  doc: RequirementDoc;
  onChange: (doc: RequirementDoc) => void;
}

export function RequirementDocPane({ doc, onChange }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-3">
      <p className="text-[9px] uppercase tracking-wider text-app-tertiary font-semibold mb-1">{label}</p>
      {children}
    </div>
  );

  const EditableList = ({ items, field }: { items: string[]; field: keyof RequirementDoc }) => (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-1 group">
          <span className="text-app-tertiary text-[10px] mt-0.5">•</span>
          {editMode ? (
            <input
              value={item}
              onChange={(e) => {
                const newItems = [...items];
                newItems[i] = e.target.value;
                onChange({ ...doc, [field]: newItems });
              }}
              className="flex-1 bg-transparent border-b border-app/50 text-[11px] text-app-secondary outline-none focus:border-accent py-0.5"
            />
          ) : (
            <span className="text-[11px] text-app-secondary">{item}</span>
          )}
        </div>
      ))}
      {editMode && (
        <button
          onClick={() => onChange({ ...doc, [field]: [...items, ""] })}
          className="text-[9px] text-accent hover:text-accent-hover ml-3"
        >
          + 添加
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-app shrink-0">
        <span className="text-[10px] font-semibold text-app-tertiary uppercase">需求文档</span>
        <button
          onClick={() => setEditMode(!editMode)}
          className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors",
            editMode ? "bg-accent/10 text-accent" : "text-app-tertiary hover:text-app")}
        >
          {editMode ? <><Eye size={10} /> 预览</> : <><Pencil size={10} /> 编辑</>}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* 标题 */}
        <Section label="标题">
          {editMode ? (
            <input
              value={doc.title}
              onChange={(e) => onChange({ ...doc, title: e.target.value })}
              className="w-full bg-transparent border-b border-app/50 text-sm font-semibold text-app outline-none focus:border-accent py-0.5"
            />
          ) : (
            <h3 className="text-sm font-semibold text-app">{doc.title}</h3>
          )}
        </Section>

        <Section label="功能点">
          <EditableList items={doc.features} field="features" />
        </Section>

        <Section label="技术方案">
          {editMode ? (
            <textarea
              value={doc.tech_approach}
              onChange={(e) => onChange({ ...doc, tech_approach: e.target.value })}
              rows={3}
              className="w-full bg-transparent border border-app/50 rounded text-[11px] text-app-secondary outline-none focus:border-accent p-2 resize-none"
            />
          ) : (
            <p className="text-[11px] text-app-secondary">{doc.tech_approach}</p>
          )}
        </Section>

        <Section label="验收标准">
          <EditableList items={doc.acceptance_criteria} field="acceptance_criteria" />
        </Section>

        <Section label="风险">
          <EditableList items={doc.risks} field="risks" />
        </Section>

        <Section label="文件变更预估">
          {doc.file_changes.map((f, i) => (
            <p key={i} className="text-[11px] text-app-secondary font-mono">
              {f.action === "create" ? "+" : "~"} {f.path}
              <span className="text-app-tertiary ml-2">{f.description}</span>
            </p>
          ))}
        </Section>

        <Section label="测试策略">
          {editMode ? (
            <textarea
              value={doc.test_strategy}
              onChange={(e) => onChange({ ...doc, test_strategy: e.target.value })}
              rows={2}
              className="w-full bg-transparent border border-app/50 rounded text-[11px] text-app-secondary outline-none focus:border-accent p-2 resize-none"
            />
          ) : (
            <p className="text-[11px] text-app-secondary">{doc.test_strategy}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
```

**Step 2: 创建 AIAssistedMode（左右分栏）**

```typescript
// frontend/src/components/task-creation/AIAssistedMode.tsx
import { useState, useRef, useEffect } from "react";
import { SendHorizontal } from "lucide-react";
import { api, type RequirementDoc } from "../../lib/api";
import { RequirementDocPane } from "./RequirementDocPane";
import { cn } from "../../lib/utils";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  projectId: number;
  initialDescription: string;
  doc: RequirementDoc | null;
  onDocChange: (doc: RequirementDoc) => void;
  templateId?: number;
}

export function AIAssistedMode({ projectId, initialDescription, doc, onDocChange, templateId }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const msgs: ChatMsg[] = [];
    if (initialDescription) {
      msgs.push({ role: "user", content: initialDescription });
      msgs.push({ role: "assistant", content: "正在分析你的需求..." });
    }
    return msgs;
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [splitPos, setSplitPos] = useState(50); // 百分比

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 初次评估
  useEffect(() => {
    if (initialDescription && !doc) {
      handleEvaluate(initialDescription);
    }
  }, []);

  const handleEvaluate = async (desc: string) => {
    setLoading(true);
    try {
      const result = await api.taskCreation.evaluate({
        project_id: projectId,
        description: desc,
        template_id: templateId,
      });
      onDocChange(result.requirement_doc);
      setMessages((prev) => [
        ...prev.filter((m) => m.content !== "正在分析你的需求..."),
        { role: "assistant", content: `需求分析完成（置信度 ${Math.round(result.confidence * 100)}%）。请查看右侧文档，如需修改可以直接编辑或在这里告诉我。` },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => m.content !== "正在分析你的需求..."),
        { role: "assistant", content: `分析失败: ${e}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);

    if (!doc) {
      // 首次，当作需求描述评估
      setMessages((prev) => [...prev, { role: "assistant", content: "正在分析..." }]);
      await handleEvaluate(msg);
    } else {
      // 有文档了，当作修改意见
      setLoading(true);
      setMessages((prev) => [...prev, { role: "assistant", content: "正在更新文档..." }]);
      try {
        const result = await api.taskCreation.refine({
          project_id: projectId,
          current_doc: doc,
          feedback: msg,
        });
        onDocChange(result.requirement_doc);
        setMessages((prev) => [
          ...prev.filter((m) => m.content !== "正在更新文档..."),
          { role: "assistant", content: `已更新：${result.changes_summary}` },
        ]);
      } catch (e) {
        setMessages((prev) => [
          ...prev.filter((m) => m.content !== "正在更新文档..."),
          { role: "assistant", content: `修改失败: ${e}` },
        ]);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex h-[50vh]" style={{ gap: 0 }}>
      {/* 左侧对话区 */}
      <div className="flex flex-col border-r border-app" style={{ width: `${splitPos}%` }}>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-[11px]",
                m.role === "user"
                  ? "bg-accent/10 text-app"
                  : "bg-app-tertiary text-app-secondary",
              )}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        {/* 输入框 */}
        <div className="p-3 border-t border-app shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={doc ? "描述修改意见..." : "描述你的需求..."}
              className="flex-1 bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
              disabled={loading}
            />
            {/* 语音按钮占位 - Phase 5 */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md disabled:opacity-40 transition-colors"
            >
              <SendHorizontal size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 右侧需求文档 */}
      <div style={{ width: `${100 - splitPos}%` }}>
        {doc ? (
          <RequirementDocPane doc={doc} onChange={onDocChange} />
        ) : (
          <div className="h-full flex items-center justify-center text-app-tertiary text-xs">
            等待需求分析完成...
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: 更新 TaskCreationPanel 集成 AIAssistedMode**

在 `TaskCreationPanel.tsx` 中：
- 导入 `AIAssistedMode`
- 将 `phase === "ai_refining"` 的内容替换为 `<AIAssistedMode>` 组件

**Step 4: Commit**

```bash
git add frontend/src/components/task-creation/AIAssistedMode.tsx frontend/src/components/task-creation/RequirementDocPane.tsx frontend/src/components/task-creation/TaskCreationPanel.tsx
git commit -m "feat: add AI assisted mode with split-pane chat and requirement doc editor"
```

---

### Task 9: WorkflowCanvas 交互式流程图

**Files:**
- Create: `frontend/src/components/task-creation/WorkflowCanvas.tsx`
- Create: `frontend/src/components/task-creation/WorkflowNode.tsx`
- Modify: `frontend/src/components/task-creation/TaskCreationPanel.tsx` (方案选择阶段集成)

**Step 1: 安装 dagre（如果未安装）**

Run: `cd /home/sichengli/Documents/code2/task-conductor/frontend && npm ls dagre 2>/dev/null || npm install @dagrejs/dagre`

**Step 2: 创建 WorkflowNode 自定义节点**

```typescript
// frontend/src/components/task-creation/WorkflowNode.tsx
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "../../lib/utils";

export interface WorkflowNodeData {
  stage: string;
  label: string;
  description: string;
  status: "pending" | "running" | "done" | "approval" | "skipped";
  needsApproval: boolean;
  complexity?: number;     // 1-4 星
  estimatedTime?: string;
  techStack?: string[];
}

const STAGE_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  requirement: { bg: "bg-blue-500/10",   border: "border-blue-500/30",   icon: "📝" },
  analysis:    { bg: "bg-purple-500/10",  border: "border-purple-500/30", icon: "🔍" },
  prd:         { bg: "bg-purple-500/10",  border: "border-purple-500/30", icon: "📋" },
  design:      { bg: "bg-cyan-500/10",    border: "border-cyan-500/30",   icon: "🎨" },
  plan:        { bg: "bg-cyan-500/10",    border: "border-cyan-500/30",   icon: "📐" },
  dev:         { bg: "bg-green-500/10",   border: "border-green-500/30",  icon: "💻" },
  test:        { bg: "bg-yellow-500/10",  border: "border-yellow-500/30", icon: "🧪" },
  deploy:      { bg: "bg-orange-500/10",  border: "border-orange-500/30", icon: "🚀" },
  monitor:     { bg: "bg-gray-500/10",    border: "border-gray-500/30",   icon: "📊" },
};

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  pending:  { color: "bg-gray-500",        label: "等待中" },
  running:  { color: "bg-blue-400 animate-pulse", label: "执行中" },
  done:     { color: "bg-green-400",       label: "已完成" },
  approval: { color: "bg-yellow-400",      label: "待审批" },
  skipped:  { color: "bg-gray-600",        label: "跳过" },
};

function WorkflowNodeComponent({ data }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  const style = STAGE_STYLES[d.stage] || STAGE_STYLES.dev;
  const status = STATUS_INDICATOR[d.status] || STATUS_INDICATOR.pending;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-app-tertiary !border-app" />
      <div className={cn(
        "rounded-xl border-2 p-3 min-w-[180px] transition-all hover:shadow-lg",
        style.bg, style.border,
        d.status === "done" && "border-green-400/50",
        d.needsApproval && d.status !== "done" && "ring-2 ring-yellow-500/30",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{style.icon}</span>
            <span className="text-[11px] font-semibold text-app">{d.label}</span>
          </div>
          {d.complexity && (
            <span className="text-[9px] text-app-tertiary">
              {"★".repeat(d.complexity)}{"☆".repeat(4 - d.complexity)}
            </span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full", status.color)} />
          <span className="text-[9px] text-app-tertiary">{status.label}</span>
          {d.estimatedTime && (
            <span className="text-[9px] text-app-tertiary ml-auto">~{d.estimatedTime}</span>
          )}
        </div>

        {/* Description */}
        <p className="text-[10px] text-app-secondary line-clamp-2">{d.description}</p>

        {/* Tech stack */}
        {d.techStack && d.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {d.techStack.map((t) => (
              <span key={t} className="text-[8px] px-1 py-0.5 rounded bg-app-secondary text-app-tertiary">{t}</span>
            ))}
          </div>
        )}

        {/* Approval badge */}
        {d.needsApproval && d.status !== "done" && (
          <div className="mt-2 flex items-center gap-1 text-[9px] text-yellow-400">
            🔒 需审批
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-app-tertiary !border-app" />
    </>
  );
}

export const WorkflowNodeType = memo(WorkflowNodeComponent);
```

**Step 3: 创建 WorkflowCanvas**

```typescript
// frontend/src/components/task-creation/WorkflowCanvas.tsx
import { useMemo, useCallback } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge,
  useNodesState, useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WorkflowNodeType, type WorkflowNodeData } from "./WorkflowNode";
import type { StageDetail } from "../../lib/api";

interface Props {
  stages: StageDetail[];
  interactive?: boolean;
  onNodeClick?: (stage: string) => void;
}

const nodeTypes = { workflow: WorkflowNodeType };

function layoutNodes(stages: StageDetail[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const xGap = 240;
  const yPos = 100;

  stages.forEach((s, i) => {
    nodes.push({
      id: s.stage,
      type: "workflow",
      position: { x: i * xGap, y: yPos },
      data: {
        stage: s.stage,
        label: s.stage.charAt(0).toUpperCase() + s.stage.slice(1),
        description: s.description,
        status: "pending",
        needsApproval: s.needs_approval,
      } satisfies WorkflowNodeData,
    });

    if (i > 0) {
      edges.push({
        id: `e-${stages[i - 1].stage}-${s.stage}`,
        source: stages[i - 1].stage,
        target: s.stage,
        animated: false,
        style: { stroke: "var(--border)", strokeWidth: 2 },
      });
    }
  });

  return { nodes, edges };
}

export function WorkflowCanvas({ stages, interactive = false, onNodeClick }: Props) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => layoutNodes(stages), [stages]);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div className="h-[250px] rounded-xl border border-app overflow-hidden bg-app-tertiary/50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={interactive ? onNodesChange : undefined}
        onEdgesChange={interactive ? onEdgesChange : undefined}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={interactive}
        nodesConnectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="rgba(255,255,255,0.03)" />
        <Controls showInteractive={false} className="!bg-app-secondary !border-app !shadow-lg" />
        <MiniMap
          nodeStrokeWidth={3}
          className="!bg-app-secondary !border-app"
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>
    </div>
  );
}
```

**Step 4: 在 TaskCreationPanel 的方案选择阶段集成 WorkflowCanvas**

在 `plan_selection` 的 JSX 中，方案卡片下方添加：

```typescript
import { WorkflowCanvas } from "./WorkflowCanvas";

// 在 plans grid 之后：
{selectedPlanId && (
  <div className="mt-4">
    <p className="text-[10px] uppercase tracking-wider text-app-tertiary font-semibold mb-2">
      执行流程预览
    </p>
    <WorkflowCanvas
      stages={plans.find((p) => p.id === selectedPlanId)?.stage_details || []}
    />
  </div>
)}
```

**Step 5: Commit**

```bash
git add frontend/src/components/task-creation/WorkflowNode.tsx frontend/src/components/task-creation/WorkflowCanvas.tsx frontend/src/components/task-creation/TaskCreationPanel.tsx
git commit -m "feat: add interactive WorkflowCanvas with custom nodes for plan preview"
```

---

## Phase 5: 语音系统

### Task 10: useVoiceInput hook + VoiceInputButton

**Files:**
- Create: `frontend/src/hooks/useVoiceInput.ts`
- Create: `frontend/src/components/task-creation/VoiceInputButton.tsx`

**Step 1: 创建 useVoiceInput hook**

```typescript
// frontend/src/hooks/useVoiceInput.ts
import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceInputOptions {
  onResult?: (text: string) => void;
  onInterim?: (text: string) => void;
  lang?: string;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onResult, onInterim, lang = "zh-CN" } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const SpeechRecognition = typeof window !== "undefined"
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

  const isSupported = !!SpeechRecognition;

  const start = useCallback(() => {
    if (!SpeechRecognition || isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setTranscript((prev) => prev + final);
        onResult?.(final);
      }
      if (interim) {
        onInterim?.(interim);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
  }, [SpeechRecognition, isListening, lang, onResult, onInterim]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    isListening ? stop() : start();
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  return { isListening, isSupported, transcript, start, stop, toggle };
}
```

**Step 2: 创建 VoiceInputButton**

```typescript
// frontend/src/components/task-creation/VoiceInputButton.tsx
import { Mic, MicOff } from "lucide-react";
import { useVoiceInput } from "../../hooks/useVoiceInput";
import { cn } from "../../lib/utils";

interface Props {
  onTranscript: (text: string) => void;
}

export function VoiceInputButton({ onTranscript }: Props) {
  const { isListening, isSupported, toggle } = useVoiceInput({
    onResult: onTranscript,
  });

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "p-1.5 rounded-md transition-all",
        isListening
          ? "bg-red-500/20 text-red-400 animate-pulse"
          : "text-app-tertiary hover:text-app hover:bg-app-tertiary",
      )}
      title={isListening ? "停止录音" : "语音输入"}
    >
      {isListening ? <MicOff size={14} /> : <Mic size={14} />}
    </button>
  );
}
```

**Step 3: 在 TaskCreationPanel 和 AIAssistedMode 中集成 VoiceInputButton**

在快速模式的描述框右上角添加 VoiceInputButton，在 AI 辅助模式的输入框旁添加。

**Step 4: Commit**

```bash
git add frontend/src/hooks/useVoiceInput.ts frontend/src/components/task-creation/VoiceInputButton.tsx
git commit -m "feat: add voice input support with Web Speech API"
```

---

### Task 11: VoiceWakeup 全局语音唤醒

**Files:**
- Create: `frontend/src/hooks/useVoiceWakeup.ts`
- Create: `frontend/src/components/VoiceWakeup.tsx`
- Modify: `frontend/src/App.tsx` (全局挂载)

**Step 1: 创建 useVoiceWakeup hook**

```typescript
// frontend/src/hooks/useVoiceWakeup.ts
import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceWakeupOptions {
  enabled: boolean;
  keywords?: string[];
  onWakeup: (followUpText?: string) => void;
  silenceTimeout?: number;     // 停顿自动发送延迟 ms
}

export function useVoiceWakeup({
  enabled,
  keywords = ["新建任务", "创建任务", "new task"],
  onWakeup,
  silenceTimeout = 2000,
}: UseVoiceWakeupOptions) {
  const [isActive, setIsActive] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpRef = useRef("");

  const SpeechRecognition = typeof window !== "undefined"
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

  const startListening = useCallback(() => {
    if (!SpeechRecognition || !enabled) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;

        if (!isAwake) {
          // 检测唤醒词
          const matched = keywords.some((kw) => text.includes(kw));
          if (matched && event.results[i].isFinal) {
            setIsAwake(true);
            followUpRef.current = "";
            // 播放提示音
            try { new Audio("/wakeup.mp3").play(); } catch {}
          }
        } else {
          // 已唤醒，收集后续语音
          if (event.results[i].isFinal) {
            followUpRef.current += text;
            // 重置静默计时器
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              onWakeup(followUpRef.current);
              setIsAwake(false);
              followUpRef.current = "";
            }, silenceTimeout);
          }
        }
      }
    };

    recognition.onend = () => {
      // 自动重启（保持持续监听）
      if (enabled) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = () => {
      setIsActive(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsActive(true);
  }, [SpeechRecognition, enabled, isAwake, keywords, onWakeup, silenceTimeout]);

  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      recognitionRef.current?.stop();
      setIsActive(false);
      setIsAwake(false);
    }
    return () => {
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [enabled]);

  return { isActive, isAwake };
}
```

**Step 2: 创建 VoiceWakeup 全局组件**

```typescript
// frontend/src/components/VoiceWakeup.tsx
import { Mic } from "lucide-react";
import { useVoiceWakeup } from "../hooks/useVoiceWakeup";
import { cn } from "../lib/utils";

interface Props {
  enabled: boolean;
  onWakeup: (text?: string) => void;
}

export function VoiceWakeup({ enabled, onWakeup }: Props) {
  const { isActive, isAwake } = useVoiceWakeup({
    enabled,
    onWakeup,
  });

  if (!enabled) return null;

  return (
    <div className={cn(
      "fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] transition-all z-40",
      isAwake
        ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
        : isActive
          ? "bg-app-secondary text-app-tertiary border border-app"
          : "bg-app-tertiary text-app-tertiary border border-app opacity-50",
    )}>
      <Mic size={12} className={isAwake ? "animate-bounce" : ""} />
      {isAwake ? "录音中..." : isActive ? "语音待命" : "未连接"}
    </div>
  );
}
```

**Step 3: 在 App.tsx 中挂载 VoiceWakeup**

在 App.tsx 中添加状态管理和组件挂载：

```typescript
import { VoiceWakeup } from "./components/VoiceWakeup";

// 在 App 组件中：
const [voiceWakeupEnabled, setVoiceWakeupEnabled] = useState(false);
const [taskCreationOpen, setTaskCreationOpen] = useState(false);
const [taskCreationInitialDesc, setTaskCreationInitialDesc] = useState("");

const handleVoiceWakeup = (text?: string) => {
  setTaskCreationInitialDesc(text || "");
  setTaskCreationOpen(true);
};

// 在 JSX 最外层添加：
<VoiceWakeup enabled={voiceWakeupEnabled} onWakeup={handleVoiceWakeup} />
```

**Step 4: Commit**

```bash
git add frontend/src/hooks/useVoiceWakeup.ts frontend/src/components/VoiceWakeup.tsx frontend/src/App.tsx
git commit -m "feat: add global voice wakeup with keyword detection"
```

---

### Task 12: 后端语音转文字 API（Whisper 兜底）

**Files:**
- Create: `backend/app/routers/voice.py`
- Modify: `backend/app/main.py` (注册路由)

**Step 1: 创建 voice.py**

```python
"""语音转文字 API - Whisper 兜底方案"""
import os
import tempfile
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice", tags=["语音"])


@router.post("/transcribe", summary="语音转文字")
async def transcribe(audio: UploadFile = File(...)):
    """接收音频文件，使用 Whisper 转写为文字"""
    try:
        import whisper
    except ImportError:
        raise HTTPException(500, "whisper not installed. Run: pip install openai-whisper")

    # 保存上传文件到临时路径
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        content = await audio.read()
        f.write(content)
        tmp_path = f.name

    try:
        model_name = os.getenv("WHISPER_MODEL", "base")
        model = whisper.load_model(model_name)
        result = model.transcribe(tmp_path, language="zh")
        return {"text": result["text"].strip()}
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
        raise HTTPException(500, f"Transcription failed: {e}")
    finally:
        os.unlink(tmp_path)
```

**Step 2: 注册路由**

在 main.py 中导入并注册：

```python
from .routers import voice as voice_router
app.include_router(voice_router.router)
```

**Step 3: Commit**

```bash
git add backend/app/routers/voice.py backend/app/main.py
git commit -m "feat: add Whisper-based voice transcription API as fallback"
```

---

## 验收清单

- [ ] Phase 1: TaskTemplate 模型 + 内置模板 + CRUD API
- [ ] Phase 2: AI 评估/修改/方案生成/创建 API
- [ ] Phase 3: 前端快速模式（模板选择 + 依赖 + 表单）
- [ ] Phase 4: AI 辅助模式（对话 + 文档编辑）+ 方案选择 + Workflow 流程图
- [ ] Phase 5: 语音输入 + 全局唤醒 + Whisper 兜底
- [ ] 端到端测试：从语音/文字输入 → AI 评估 → 方案选择 → 自动执行

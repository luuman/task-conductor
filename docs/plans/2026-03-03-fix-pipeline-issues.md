# Pipeline Issues Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复评估中发现的 6 个流程/可靠性问题，核心是 dev/monitor 阶段静默跳过、审批恢复 worktree 路径丢失、Critic 虚假 task_id 广播混乱。

**Architecture:**
- Task 1 修 `runner.py`：无 executor 的阶段统一暂停，不再静默跳过
- Task 2 修 `scheduler.py`：`enqueue` 复用已有 `worktree_path`，避免服务重启后路径重分配
- Task 3 修 `executor.py`：Critic 调用用独立 silent 方法，不广播到错误的 WS 频道
- Task 4 修 `metrics_store.py` + `routers/metrics.py`：暴露 `reset_at`，前端显示"统计自…起"
- Task 5 修 `session.py`：token 持久化到 SQLite，重启后不失效

**Tech Stack:** Python/FastAPI, SQLAlchemy 2.0, asyncio, pytest

---

## Task 1: 修复 dev/monitor 阶段静默跳过（Problem 3）

**Files:**
- Modify: `backend/app/pipeline/runner.py:71-91`
- Test: `backend/tests/test_runner_no_executor.py`

**背景：**
`dev` 和 `monitor` 不在 `APPROVAL_STAGES` 且没有 executor，当前逻辑直接 `continue` 跳到下一阶段，
任务会看起来"完成"但实际什么都没执行。修复：任何无 executor 的阶段都应暂停（waiting_review）。

**Step 1: 写失败测试**

创建 `backend/tests/test_runner_no_executor.py`：

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.pipeline.runner import run_pipeline

@pytest.mark.asyncio
async def test_dev_stage_pauses_not_skips():
    """dev 阶段没有 executor 时，应暂停（waiting_review），而不是跳过直接完成"""
    from sqlalchemy.orm import Session
    from app.database import engine
    from app.models import Task, Project

    # 准备一个 stage=dev 的任务
    with Session(engine) as db:
        proj = Project(name="test-proj")
        db.add(proj)
        db.flush()
        task = Task(project_id=proj.id, title="test", description="desc", stage="dev", status="running")
        db.add(task)
        db.commit()
        task_id = task.id

    with patch("app.ws.manager.manager.broadcast", new_callable=AsyncMock), \
         patch("app.notify.dispatcher.notify_human_required", new_callable=AsyncMock):
        await run_pipeline(task_id, "/tmp")

    with Session(engine) as db:
        t = db.get(Task, task_id)
        # 不应该变成 done——应该暂停在 waiting_review
        assert t.status == "waiting_review", f"Expected waiting_review, got {t.status}"
        assert t.stage == "dev"
```

**Step 2: 运行测试确认失败**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_runner_no_executor.py::test_dev_stage_pauses_not_skips -v
```

预期：FAIL（当前逻辑跳过 dev，状态会变成 done）

**Step 3: 修改 runner.py**

修改 `backend/app/pipeline/runner.py` 的 `if executor is None` 代码块（第 71-91 行）：

```python
        if executor is None:
            # 该阶段尚未实现 executor，无论是否需要审批都暂停等待人工处理
            with Session(engine) as db:
                t = db.get(Task, task_id)
                t.stage = current_stage
                t.status = "waiting_review"
                db.commit()
            await manager.broadcast(f"task:{task_id}", "stage_update", {
                "stage": current_stage, "status": "waiting_review",
                "message": f"{current_stage} 阶段尚未实现，需要人工操作"
            })
            await notify_human_required(
                task_id, current_stage,
                f"{current_stage} 阶段尚未实现，需要人工操作"
            )
            return
```

（删除原来的"无 executor 且不需审批 → 直接推进"分支）

**Step 4: 运行测试确认通过**

```bash
pytest tests/test_runner_no_executor.py::test_dev_stage_pauses_not_skips -v
```

预期：PASS

**Step 5: 补充 monitor 阶段测试**

在同一文件添加：

```python
@pytest.mark.asyncio
async def test_monitor_stage_pauses_not_skips():
    """monitor 阶段同样应暂停而不是跳过"""
    from sqlalchemy.orm import Session
    from app.database import engine
    from app.models import Task, Project

    with Session(engine) as db:
        proj = Project(name="test-proj-monitor")
        db.add(proj)
        db.flush()
        task = Task(project_id=proj.id, title="test", description="desc",
                    stage="monitor", status="running")
        db.add(task)
        db.commit()
        task_id = task.id

    with patch("app.ws.manager.manager.broadcast", new_callable=AsyncMock), \
         patch("app.notify.dispatcher.notify_human_required", new_callable=AsyncMock):
        await run_pipeline(task_id, "/tmp")

    with Session(engine) as db:
        t = db.get(Task, task_id)
        assert t.status == "waiting_review"
        assert t.stage == "monitor"
```

```bash
pytest tests/test_runner_no_executor.py -v
```

预期：两个测试均 PASS

**Step 6: Commit**

```bash
cd backend
git add app/pipeline/runner.py tests/test_runner_no_executor.py
git commit -m "fix: pause unimplemented stages instead of silently skipping"
```

---

## Task 2: 修复审批后 worktree_path 丢失（Problem 1）

**Files:**
- Modify: `backend/app/scheduler.py:88-96`
- Test: `backend/tests/test_scheduler_worktree.py`

**背景：**
`enqueue` 每次调用 `_allocate_worktree` 都会重新计算一个新路径，但任务已有 `worktree_path`（初次分配时写入 DB）。
服务重启后内存状态清零，审批继续时应复用 DB 中记录的路径，不重新分配。

**Step 1: 写失败测试**

创建 `backend/tests/test_scheduler_worktree.py`：

```python
import pytest
from unittest.mock import AsyncMock, patch
from app.scheduler import ProjectScheduler

@pytest.mark.asyncio
async def test_enqueue_reuses_existing_worktree():
    """任务已有 worktree_path 时，enqueue 应复用而不是重新分配"""
    from sqlalchemy.orm import Session
    from app.database import engine
    from app.models import Task, Project

    existing_path = "/tmp/existing-worktree/task-99"

    with Session(engine) as db:
        proj = Project(name="test-proj-wt", max_parallel=2, execution_mode="smart")
        db.add(proj)
        db.flush()
        task = Task(
            project_id=proj.id, title="t", description="d",
            stage="analysis", status="pending",
            worktree_path=existing_path,  # 已有路径
        )
        db.add(task)
        db.commit()
        task_id = task.id

    captured_path = []

    async def fake_execute(tid, wpath, pid):
        captured_path.append(wpath)

    scheduler = ProjectScheduler()
    with patch.object(scheduler, "_execute_task", side_effect=fake_execute):
        await scheduler.enqueue(task_id)

    assert captured_path, "execute_task should have been called"
    assert captured_path[0] == existing_path, \
        f"Expected {existing_path}, got {captured_path[0]}"
```

**Step 2: 运行测试确认失败**

```bash
cd backend && pytest tests/test_scheduler_worktree.py::test_enqueue_reuses_existing_worktree -v
```

预期：FAIL（当前每次都重新分配路径）

**Step 3: 修改 scheduler.py**

将 `enqueue` 方法中的 `worktree` 分配逻辑改为复用：

```python
                if can_run and running_count < project.max_parallel:
                    # 复用已有 worktree_path，否则重新分配
                    worktree = task.worktree_path or self._allocate_worktree(task, project)
                    task.status = "running"
                    task.worktree_path = worktree   # 确保写回DB（新分配时）
                    task.started_at = datetime.utcnow()
                    db.commit()
```

**Step 4: 运行测试确认通过**

```bash
pytest tests/test_scheduler_worktree.py -v
```

预期：PASS

**Step 5: Commit**

```bash
git add app/scheduler.py tests/test_scheduler_worktree.py
git commit -m "fix: reuse existing worktree_path on re-enqueue after approval"
```

---

## Task 3: 修复 Critic 虚假 task_id WS 广播（Problem 2）

**Files:**
- Modify: `backend/app/pipeline/executor.py:80-101, 154-165`
- Test: `backend/tests/test_executor_critic.py`

**背景：**
Critic 调用用 `task_id * 10000 + attempt` 作为子进程 key，但 `_call_claude` 会把这个 ID 用于广播
`task:{id}` WS 频道，没有订阅者却产生噪音。正确做法：Critic 用独立的 silent 方法，只负责获取文本，
不广播到任何任务频道。

**Step 1: 写失败测试**

创建 `backend/tests/test_executor_critic.py`：

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.pipeline.executor import StageExecutor
from pydantic import BaseModel

class DummyOutput(BaseModel):
    understanding: str
    assumptions: list[str]
    risks: list[str]
    confidence: float
    blockers: list[str] = []

class DummyExecutor(StageExecutor):
    stage_name = "test_stage"
    def build_prompt(self, title, desc, context, knowledge): return "test prompt"
    def get_output_schema(self): return DummyOutput

@pytest.mark.asyncio
async def test_critic_does_not_broadcast_to_fake_channel():
    """Critic 调用不应广播到 task:{fake_id} 频道"""
    broadcast_calls = []

    async def mock_broadcast(channel, *args, **kwargs):
        broadcast_calls.append(channel)

    dummy_json = '{"understanding":"x","assumptions":["a"],"risks":[],"confidence":0.9}'
    critic_json = '{"score":9,"issues":[],"suggestions":"ok","pass_review":true}'

    call_count = [0]
    async def mock_call_claude(tid, prompt, log_file, cwd="/tmp"):
        call_count[0] += 1
        if call_count[0] == 1:
            return dummy_json
        return critic_json

    executor = DummyExecutor()
    with patch("app.ws.manager.manager.broadcast", side_effect=mock_broadcast), \
         patch.object(executor, "_call_claude", side_effect=mock_call_claude), \
         patch.object(executor, "_call_claude_silent",
                      side_effect=lambda *a, **kw: mock_call_claude(*a, **kw)):
        await executor.run(1, 1, "title", "desc", {})

    # 所有广播只应发到 task:1，不应发到 task:10001 之类
    fake_channels = [c for c in broadcast_calls if c != "task:1"]
    assert fake_channels == [], f"Unexpected channels: {fake_channels}"
```

**Step 2: 运行测试确认失败**

```bash
cd backend && pytest tests/test_executor_critic.py::test_critic_does_not_broadcast_to_fake_channel -v
```

预期：FAIL（当前 Critic 用 `task_id*10000+attempt` 广播）

**Step 3: 修改 executor.py**

在 `StageExecutor` 类中添加 `_call_claude_silent` 方法（紧接在 `_call_claude` 之后）：

```python
    async def _call_claude_silent(
        self,
        key: int,
        prompt: str,
        log_file: str,
        cwd: str = "/tmp",
    ) -> str:
        """调用 Claude，仅收集文本，不广播到任何 WebSocket 频道（用于 Critic）"""
        parts: list[str] = []
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        try:
            async for event in pool.run(key, prompt, cwd, log_file):
                content = event.get("content") or event.get("result", "")
                if content:
                    parts.append(str(content))
        except Exception as e:
            raise RuntimeError(f"Claude call failed: {e}")
        return "".join(parts)
```

然后将 `run` 方法中的 Critic 调用改用 `_call_claude_silent`：

```python
            # Step 3: Critic Pass
            try:
                critic_raw = await self._call_claude_silent(
                    task_id * 10000 + attempt,
                    CRITIC_PROMPT.format(...),
                    f"{log_dir}/task-{task_id}-{self.stage_name}-critic{attempt}.log",
                )
```

**Step 4: 运行测试确认通过**

```bash
pytest tests/test_executor_critic.py -v
```

预期：PASS

**Step 5: Commit**

```bash
git add app/pipeline/executor.py tests/test_executor_critic.py
git commit -m "fix: use silent Claude call for Critic to avoid fake-ID WebSocket broadcasts"
```

---

## Task 4: MetricsStore 添加 reset_at 时间戳（Problem 5）

**Files:**
- Modify: `backend/app/claude/metrics_store.py`
- Modify: `backend/app/routers/metrics.py`（在 `/api/metrics` 响应中加 `reset_at` 字段）

**背景：**
MetricsStore 内存存储重启后清零，但 ClaudeSession 是持久化的，会让用户困惑"为什么会话有50条但调用次数是0"。
简单修复：在 metrics 响应中加 `reset_at`，前端提示"以下统计自服务启动起"。

**Step 1: 读取 metrics_store.py 和 metrics.py**

先确认字段名再修改。

**Step 2: 修改 metrics_store.py**

在 `MetricsStore.__init__` 中添加：

```python
self.reset_at: datetime = datetime.utcnow()
```

**Step 3: 修改 metrics router**

在 `/api/metrics` 响应 dict 中添加：

```python
"reset_at": metrics_store.reset_at.isoformat(),
```

**Step 4: 运行后端确认字段存在**

```bash
cd backend && uvicorn app.main:app --port 8765 &
curl -s http://localhost:8765/api/metrics | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reset_at'))"
```

预期：输出类似 `2026-03-03T...` 的时间戳

**Step 5: Commit**

```bash
git add app/claude/metrics_store.py app/routers/metrics.py
git commit -m "feat: expose reset_at in metrics to indicate stats window start"
```

---

## Task 5: PIN token 持久化（Problem 6）

**Files:**
- Modify: `backend/app/session.py`
- Modify: `backend/app/models.py`（添加 `AuthToken` 表）

**背景：**
`_tokens: dict[str, datetime]` 内存存储，重启后所有 token 失效。用户在 CI 或长时间挂机场景需要稳定 token。
修复：将 token 持久化到 SQLite `auth_tokens` 表。

**Step 1: 在 models.py 添加 AuthToken 表**

```python
class AuthToken(Base):
    __tablename__ = "auth_tokens"
    token: Mapped[str] = mapped_column(String(128), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
```

**Step 2: 修改 session.py**

将 token 的创建和验证从内存 dict 改为 DB 查询：

```python
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .database import engine
from .models import AuthToken
import secrets

TOKEN_TTL_DAYS = 30   # token 有效期 30 天

def create_token() -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS)
    with Session(engine) as db:
        db.add(AuthToken(token=token, expires_at=expires))
        db.commit()
    return token

def verify_token(token: str) -> bool:
    with Session(engine) as db:
        row = db.get(AuthToken, token)
        if row is None:
            return False
        if row.expires_at < datetime.utcnow():
            db.delete(row)
            db.commit()
            return False
        return True
```

**Step 3: 确保表在启动时创建**

`database.py` 的 `Base.metadata.create_all(bind=engine)` 会自动创建新表，无需额外操作。

**Step 4: 手动测试**

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --port 8765
# 在另一个终端：
curl -s -X POST http://localhost:8765/auth/pin -H 'Content-Type: application/json' -d '{"pin":"123456"}'
# 重启服务后再次验证 token 应仍然有效
```

**Step 5: Commit**

```bash
git add app/session.py app/models.py
git commit -m "fix: persist auth tokens to SQLite for restart-safe auth"
```

---

## 执行顺序

按优先级：Task 1 → Task 2 → Task 3 → Task 4 → Task 5

Task 1 和 Task 2 是独立的，可并行；Task 3 依赖对 executor.py 结构的理解，建议串行。

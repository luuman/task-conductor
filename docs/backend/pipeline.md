# 流水线系统

## 阶段状态机

### 阶段顺序（STAGE_ORDER）

```
input → analysis → prd → ui → plan → dev → test → deploy → monitor → done
```

- `input`：初始状态，等待用户触发
- `done`：最终状态，任务完成
- 中间 8 个阶段均由 Claude 自动执行

### 审批节点（APPROVAL_REQUIRED）

```python
APPROVAL_REQUIRED = {"analysis", "prd", "ui", "plan", "test", "deploy"}
```

这 6 个阶段执行完成后，任务状态变为 `waiting_review`，等待人工：
1. 查看结构化输出（置信度/假设/Critic 评分）
2. 决定 approve（继续）或 reject（给出原因，触发重试或终止）

无需审批的阶段（`dev`, `monitor`）执行完成后自动推进到下一阶段。

### 任务状态流转

```
pending
  ↓ scheduler.enqueue()
queued（等待执行槽位）
  ↓ 条件满足
running（执行中）
  ↓ 阶段完成 + 需审批
waiting_review（等待人工）
  ↓ POST /api/tasks/{id}/approve
  ├─ action=approve → POST /api/tasks/{id}/advance → 继续 running
  └─ action=reject  → failed（或重新 enqueue）
  ↓ 所有阶段完成
done
  ↓ 执行异常
failed
```

## StageExecutor：可靠执行框架

`pipeline/executor.py` 中的 `StageExecutor` 是所有阶段的基类：

### 完整执行流程

```
executor.run(task_id, title, description, worktree_path, context_artifacts)
  │
  ├─ 1. 知识库注入（查询 ProjectKnowledge，最近5条同项目错误）
  ├─ 2. build_prompt()（子类实现）
  ├─ 3. _call_claude(task_id, prompt, log_file, cwd) → ClaudePool.run()
  ├─ 4. extract_json(raw_output) → 去除 ```json 包裹
  ├─ 5. 结构化验证 → get_output_schema() 的 Pydantic 模型
  ├─ 6. Critic Pass → 第二次 Claude 调用评审（0-10 分）
  ├─ 7. 重试循环（MAX_RETRIES = 3）
  └─ 8. 返回 (output, metadata)
```

### CriticOutput 数据结构

```python
class CriticOutput(BaseModel):
    score: float        # 0-10 的质量评分
    issues: list[str]   # 发现的问题列表
    suggestions: list[str]  # 改进建议
    pass_review: bool   # 是否通过评审
```

### 知识库工作机制

```
某次执行失败 → ProjectKnowledge 写入记录
          ↓
下一次同项目任务 build_prompt() 时注入：
  "历史经验（请务必参考）：
   1. [validation_fail] 分析阶段输出缺少 recommended 字段...
   2. [wrong_tech_choice] 不要建议使用 Redis 作为持久化方案..."
```

## 已实现的阶段

### AnalysisExecutor（需求分析）

```python
class AnalysisOutput(BaseModel):
    understanding: str       # 核心理解
    assumptions: list[str]   # 明确假设
    risks: list[str]         # 风险点
    options: list[AnalysisOption]  # 3个实现方案（A/B/C）
    recommended: str         # 推荐方案
    confidence: float        # 置信度 [0-1]
    blockers: list[str]      # 阻塞问题
```

### PrdExecutor（产品需求文档）

```python
class PrdOutput(BaseModel):
    title: str
    background: str
    user_stories: list[str]       # "As a X, I want Y, so that Z"
    acceptance_criteria: list[str]
    out_of_scope: list[str]
    assumptions: list[str]
    confidence: float
    blockers: list[str]
```

### PlanExecutor（技术规划）

```python
class PlanOutput(BaseModel):
    architecture: str
    components: list[dict]        # [{name, responsibility, tech}]
    milestones: list[dict]        # [{name, tasks, estimate}]
    tech_decisions: list[TechDecision]
    assumptions: list[str]
    confidence: float
    blockers: list[str]
```

## Pipeline Runner：串行驱动

`pipeline/runner.py` 中的 `run_pipeline()` 负责驱动阶段推进：

```python
async def run_pipeline(task_id: int, worktree_path: str):
    while task.stage != "done":
        # 1. 找到当前阶段 Executor
        # 2. 加载上一阶段产物
        # 3. executor.run() 执行
        # 4. 保存 StageArtifact
        # 5. task.stage = next_stage
        # 6. 需审批 → waiting_review → return
        # 7. 无需审批 → 继续循环
```

## ProjectScheduler：任务调度

### 三种调度模式

| 模式 | 行为 |
|------|------|
| **smart**（默认） | 依赖感知：依赖未完成 → queued；依赖完成 + 有槽位 → running |
| **queue** | 严格串行：有任务运行中 → queued |
| **parallel** | 忽略依赖：有槽位就立即执行 |

### 依赖满足检测

```python
def _check_dependencies(task: Task, db: Session) -> bool:
    if not task.depends_on:
        return True
    dep_ids = json.loads(task.depends_on)
    for dep_id in dep_ids:
        dep = db.query(Task).get(dep_id)
        if not dep or dep.status != "done":
            return False
    return True
```

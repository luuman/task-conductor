# 如何添加新的 Pipeline Stage

本指南面向开发者，介绍如何在 TaskConductor 中为流水线添加新的执行阶段（Stage Executor）。

## 前置了解

流水线的 9 个阶段顺序定义在 `pipeline/engine.py`：

```
input → analysis* → prd* → ui* → plan* → dev → test* → deploy* → monitor → done
```

`*` 表示需要人工审批（定义在 `APPROVAL_REQUIRED` 集合中）。

每个阶段的执行逻辑封装在 `StageExecutor` 子类中，遵循统一的 `validate → critic → retry` 循环。

---

## 步骤一：定义 Pydantic 输出 Schema

在 `backend/app/pipeline/schemas.py` 中添加该阶段的结构化输出模型。

**参考示例**（以 dev 阶段为例）：

```python
class DevOutput(BaseModel):
    """dev 阶段输出：编码实现结果"""
    summary: str                    # 实现摘要（1-2段）
    files_changed: list[str]        # 修改的文件路径列表
    implementation_notes: str       # 关键实现说明
    test_hints: list[str]          # 给 test 阶段的提示
    confidence: float               # 置信度 0.0-1.0
    assumptions: list[str]         # 实现中的假设
```

**要求：**
- 必须包含 `confidence: float` 字段（0.0-1.0），供透明度 UI 显示
- 建议包含 `assumptions: list[str]` 字段（假设列表）
- 建议包含 `summary: str` 字段（供审批通知摘要使用）

---

## 步骤二：继承 StageExecutor 创建新阶段

在 `backend/app/pipeline/stages/` 下新建文件，例如 `dev.py`：

```python
# backend/app/pipeline/stages/dev.py
from typing import Type
from ..executor import StageExecutor
from ..schemas import DevOutput


class DevExecutor(StageExecutor):
    stage_name = "dev"  # 必须与 engine.py STAGE_ORDER 中的阶段名一致

    def build_prompt(
        self,
        title: str,
        desc: str,
        context: dict,
        knowledge: list[str],
    ) -> str:
        """构建发送给 Claude 的执行 prompt。

        Args:
            title: 任务标题
            desc: 任务描述
            context: 上游阶段产物，通常包含 prd_output、plan_output 等
            knowledge: 项目知识库条目（以往错误经验），自动注入
        """
        knowledge_block = ""
        if knowledge:
            items = "\n".join(f"- {k}" for k in knowledge)
            knowledge_block = f"\n\n【项目经验库（请注意避免重蹈覆辙）】\n{items}"

        plan_output = context.get("plan_output", {})
        prd_output = context.get("prd_output", {})

        return f"""你是资深全栈工程师。请根据以下规划实现代码。

## 任务
{title}

## 描述
{desc}

## PRD 摘要
{prd_output.get("summary", "（无）")}

## 实施计划
{plan_output.get("implementation_steps", "（无）")}
{knowledge_block}

请直接输出 JSON（无 markdown 包裹）：
{{
  "summary": "实现摘要",
  "files_changed": ["src/foo.ts", "backend/app/bar.py"],
  "implementation_notes": "关键实现说明",
  "test_hints": ["需要测试的场景1", "场景2"],
  "confidence": 0.85,
  "assumptions": ["假设1", "假设2"]
}}"""

    def get_output_schema(self) -> Type[DevOutput]:
        return DevOutput
```

**关键要点：**
- `stage_name` 必须与 `engine.py` 中 `STAGE_ORDER` 的字符串完全一致
- `build_prompt` 中的 `context` 包含所有上游阶段已持久化的 artifact，键名约定为 `{stage}_output`
- `knowledge` 是自动从数据库查出的项目知识库条目，可直接注入 prompt
- prompt 末尾要求 Claude 输出纯 JSON，不要 markdown 包裹

---

## 步骤三：在 runner.py 注册新阶段

打开 `backend/app/pipeline/runner.py`，找到 `STAGE_EXECUTORS` 字典并注册：

```python
# backend/app/pipeline/runner.py

from .stages.analysis import AnalysisExecutor
from .stages.prd import PrdExecutor
from .stages.plan import PlanExecutor
from .stages.dev import DevExecutor  # 新增

STAGE_EXECUTORS: dict[str, StageExecutor] = {
    "analysis": AnalysisExecutor(),
    "prd": PrdExecutor(),
    "plan": PlanExecutor(),
    "dev": DevExecutor(),  # 新增
}
```

---

## 步骤四：验证

### 4.1 确认 schema 可导入

```bash
cd backend
source .venv/bin/activate
python -c "from app.pipeline.stages.dev import DevExecutor; e = DevExecutor(); print(e.stage_name)"
# 应输出: dev
```

### 4.2 确认 runner 注册正确

```bash
python -c "
from app.pipeline.runner import STAGE_EXECUTORS
print(list(STAGE_EXECUTORS.keys()))
"
# 应包含 'dev'
```

### 4.3 运行单元测试

```bash
cd backend
pytest tests/ -v
```

---

## 执行流程说明

注册完成后，当 pipeline runner 推进到该阶段时，执行流程如下：

```
runner.py: run_pipeline(task_id)
  └── executor = STAGE_EXECUTORS[current_stage]
      └── executor.run(task_id, title, desc, context, worktree_path)
          ├── 1. 从 ProjectKnowledge 读取知识库
          ├── 2. build_prompt() 构建 prompt
          ├── 3. ClaudePool.run() 调用 Claude Code（headless）
          ├── 4. 解析 JSON 输出，按 get_output_schema() 验证
          ├── 5. Critic 评审（CriticOutput.pass_review？）
          │     ├── pass → 持久化到 StageArtifact，广播 WebSocket
          │     └── fail → 重试（最多 pipeline_max_retries 次）
          └── 6. 如果阶段在 APPROVAL_REQUIRED → 暂停等待人工审批
```

---

## 常见问题

**Q: Critic 总是不通过，阶段一直重试**

A: 检查 `build_prompt` 是否明确指定了输出格式。Critic 审核时会对照 schema 字段完整性打分，输出不完整会导致低分。调低 `pipeline_max_retries` 可加快调试。

**Q: 如何在前端透明度 UI 中展示新阶段的假设列表？**

A: schema 中包含 `assumptions: list[str]` 字段，`TaskPipeline.tsx` 会自动读取并展示。

**Q: 新阶段需要审批怎么配置？**

A: 在 `backend/app/pipeline/engine.py` 的 `APPROVAL_REQUIRED` 集合中添加阶段名：

```python
APPROVAL_REQUIRED = {"analysis", "prd", "ui", "plan", "test", "deploy", "your_stage"}
```

**Q: 如何访问上游阶段产物？**

A: `runner.py` 在调用 `executor.run()` 时，会将所有已完成阶段的 artifact 以 `{stage}_output` 为键放入 `context` dict 传入。在 `build_prompt` 中通过 `context.get("prd_output", {})` 等方式获取。

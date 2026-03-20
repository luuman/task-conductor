import json
from typing import Optional

STAGE_ORDER = [
    "input", "analysis", "prd", "ui", "plan",
    "dev", "test", "deploy", "monitor", "done"
]

APPROVAL_REQUIRED = {"analysis", "prd", "ui", "plan", "test", "deploy"}


def _get_approval_stages() -> set[str]:
    """从设置中动态读取需审批的阶段列表"""
    try:
        from ..routers.settings_router import _load
        stages = _load().get("pipeline_approval_stages", list(APPROVAL_REQUIRED))
        return set(stages)
    except Exception:
        return APPROVAL_REQUIRED


class StageTransitionError(Exception):
    pass


def get_task_stages(task) -> list[str]:
    """获取任务的阶段列表：优先 task.stages，fallback STAGE_ORDER"""
    if task and hasattr(task, 'stages') and task.stages:
        try:
            stages = json.loads(task.stages)
            if isinstance(stages, list) and stages:
                # 确保以 done 结尾
                if stages[-1] != "done":
                    stages.append("done")
                return stages
        except (json.JSONDecodeError, TypeError):
            pass
    return STAGE_ORDER


class PipelineEngine:
    def next_stage(self, current: str, stages: Optional[list[str]] = None) -> str:
        order = stages or STAGE_ORDER
        if current not in order:
            raise StageTransitionError(f"Unknown stage: {current}")
        idx = order.index(current)
        if idx >= len(order) - 1:
            raise StageTransitionError("Already at final stage")
        return order[idx + 1]

    def requires_approval(self, stage: str) -> bool:
        return stage in _get_approval_stages()

    def can_proceed(self, stage: str, status: str) -> bool:
        if self.requires_approval(stage):
            return status == "approved"
        return status == "done"

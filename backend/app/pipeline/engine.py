import json
from typing import Optional

STAGE_ORDER = [
    "input", "discovery", "analysis", "prd", "architecture",
    "ui", "plan", "dev", "review", "test", "security",
    "staging", "deploy", "monitor", "done"
]

APPROVAL_REQUIRED = {
    "discovery", "analysis", "prd", "architecture",
    "ui", "plan", "review", "test", "security", "staging", "deploy"
}

# 各阶段说明（供 UI 展示）
STAGE_LABELS: dict[str, str] = {
    "input":        "需求输入",
    "discovery":    "市场与用户调研",
    "analysis":     "需求分析与方案评估",
    "prd":          "产品需求文档",
    "architecture": "系统架构设计",
    "ui":           "UI/UX 设计",
    "plan":         "技术规划与里程碑",
    "dev":          "代码实现",
    "review":       "代码审查",
    "test":         "测试",
    "security":     "安全审查",
    "staging":      "预发布环境验证",
    "deploy":       "生产部署",
    "monitor":      "监控与告警",
    "done":         "完成",
}


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


def get_effective_stages(project_stages_config: Optional[str]) -> list[str]:
    """根据项目的 stages_config（JSON string）返回实际启用的阶段序列。
    None 表示全部启用（返回完整 STAGE_ORDER）。
    input 和 done 始终保留。
    """
    if not project_stages_config:
        return STAGE_ORDER
    try:
        enabled = set(json.loads(project_stages_config))
    except (json.JSONDecodeError, TypeError):
        return STAGE_ORDER
    enabled |= {"input", "done"}
    return [s for s in STAGE_ORDER if s in enabled]


def get_task_stages(task, project_stages_config: Optional[str] = None) -> list[str]:
    """获取任务的阶段列表：优先 task.stages，fallback project stages_config，fallback STAGE_ORDER"""
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
    return get_effective_stages(project_stages_config)


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

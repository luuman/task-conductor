from typing import Optional

STAGE_ORDER = [
    "input", "analysis", "prd", "ui", "plan",
    "dev", "test", "deploy", "monitor", "done"
]

APPROVAL_REQUIRED = {"analysis", "prd", "ui", "plan", "test", "deploy"}

class StageTransitionError(Exception):
    pass

class PipelineEngine:
    def next_stage(self, current: str) -> str:
        if current not in STAGE_ORDER:
            raise StageTransitionError(f"Unknown stage: {current}")
        idx = STAGE_ORDER.index(current)
        if idx >= len(STAGE_ORDER) - 1:
            raise StageTransitionError("Already at final stage")
        return STAGE_ORDER[idx + 1]

    def requires_approval(self, stage: str) -> bool:
        return stage in APPROVAL_REQUIRED

    def can_proceed(self, stage: str, status: str) -> bool:
        if self.requires_approval(stage):
            return status == "approved"
        return status == "done"

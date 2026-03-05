# backend/app/pipeline/runner.py
"""
Pipeline Runner：驱动单个 task 从当前阶段串行执行。
遇到审批阶段时暂停，等人工调用 /approve + /advance 后继续。
"""
import json
import logging
import os
from datetime import datetime
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
    "prd":      PrdExecutor(),
    "plan":     PlanExecutor(),
}

# 需要人工审批后才能推进的阶段
APPROVAL_STAGES = {"analysis", "prd", "ui", "plan", "test", "deploy"}

STAGE_ORDER = [
    "input", "analysis", "prd", "ui", "plan",
    "dev", "test", "deploy", "monitor", "done"
]


def _get_context(task_id: int) -> dict:
    """从已有 StageArtifact 提取上下文，传给下一个阶段"""
    ctx: dict = {}
    with Session(engine) as db:
        artifacts = db.query(StageArtifact).filter(
            StageArtifact.task_id == task_id
        ).order_by(StageArtifact.created_at).all()
        for a in artifacts:
            try:
                ctx[a.stage] = json.loads(a.content)
                if a.assumptions:
                    ctx[f"{a.stage}_assumptions"] = json.loads(a.assumptions)
            except Exception:
                pass
    return ctx


async def run_pipeline(task_id: int, worktree_path: str):
    """
    从 task.stage 开始执行，自动推进到下一个审批节点后暂停。
    审批后由 /advance 端点再次调用本函数继续。
    """
    log_dir = os.getenv("TC_LOG_DIR", "/tmp/task-conductor/logs")
    os.makedirs(log_dir, exist_ok=True)

    with Session(engine) as db:
        task = db.get(Task, task_id)
        if not task:
            return
        # input 阶段等同于从 analysis 开始
        current_stage = task.stage if task.stage != "input" else "analysis"
        project_id = task.project_id
        title, description = task.title, task.description

    while current_stage != "done":
        executor = EXECUTORS.get(current_stage)

        if executor is None:
            # 该阶段尚未实现 executor
            if current_stage in APPROVAL_STAGES:
                # 暂停等人工处理
                with Session(engine) as db:
                    t = db.get(Task, task_id)
                    t.stage = current_stage
                    t.status = "waiting_review"
                    db.commit()
                await manager.broadcast(f"task:{task_id}", "stage_update", {
                    "stage": current_stage, "status": "waiting_review",
                    "message": f"{current_stage} 阶段需要人工操作"
                })
                await notify_human_required(task_id, current_stage, f"{current_stage} 阶段需要人工操作")
                return
            # 无 executor 且不需审批（dev/monitor）→ 直接推进
            idx = STAGE_ORDER.index(current_stage)
            current_stage = STAGE_ORDER[idx + 1]
            continue

        # 更新当前阶段 + 状态
        with Session(engine) as db:
            t = db.get(Task, task_id)
            t.stage = current_stage
            t.status = "running"
            if not t.started_at:
                t.started_at = datetime.utcnow()
            db.commit()

        await manager.broadcast(f"task:{task_id}", "stage_update", {
            "stage": current_stage, "status": "running"
        })

        context = _get_context(task_id)

        # 执行阶段（含 validate + critic + retry）
        try:
            output, meta = await executor.run(
                task_id, project_id, title, description,
                context, worktree_path, log_dir,
            )
        except RuntimeError as e:
            with Session(engine) as db:
                t = db.get(Task, task_id)
                t.status = "failed"
                t.finished_at = datetime.utcnow()
                db.commit()
            err_msg = str(e)
            await manager.broadcast(f"task:{task_id}", "log", f"[error] {err_msg}")
            await manager.broadcast(f"task:{task_id}", "stage_failed", {
                "stage": current_stage, "error": err_msg
            })
            await notify_human_required(task_id, current_stage, f"阶段执行失败，需人工介入: {e}")
            return

        # 持久化 StageArtifact
        with Session(engine) as db:
            artifact = StageArtifact(
                task_id=task_id,
                stage=current_stage,
                artifact_type="json",
                content=output.model_dump_json(),
                confidence=meta["confidence"],
                assumptions=json.dumps(meta["assumptions"], ensure_ascii=False),
                critic_notes=meta["critic_notes"],
                retry_count=meta["retry_count"],
                error_log=meta["error_log"] or None,
            )
            db.add(artifact)
            new_status = "waiting_review" if current_stage in APPROVAL_STAGES else "running"
            t = db.get(Task, task_id)
            t.status = new_status
            db.commit()
            artifact_id = artifact.id

        await manager.broadcast(f"task:{task_id}", "stage_update", {
            "stage": current_stage,
            "status": new_status,
            "artifact_id": artifact_id,
            "confidence": meta["confidence"],
            "assumptions": meta["assumptions"],
            "critic_notes": meta["critic_notes"],
            "retry_count": meta["retry_count"],
            "output": output.model_dump(),
        })

        # 需要审批 → 通知后暂停，等人工 /approve + /advance
        if current_stage in APPROVAL_STAGES:
            await notify_human_required(task_id, current_stage, f"{current_stage} 完成，请审批")
            return

        # 无需审批 → 自动推进
        idx = STAGE_ORDER.index(current_stage)
        current_stage = STAGE_ORDER[idx + 1]

    # 所有阶段完成
    with Session(engine) as db:
        t = db.get(Task, task_id)
        t.status = "done"
        t.stage = "done"
        t.finished_at = datetime.utcnow()
        db.commit()
    await manager.broadcast(f"task:{task_id}", "task_done", {"task_id": task_id})

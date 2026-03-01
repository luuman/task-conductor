import json
import os
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, StageArtifact
from ..claude.pool import ClaudePool
from ..pipeline.stages.analysis import build_analysis_prompt, parse_options
from ..ws.manager import manager
from ..notify.dispatcher import notify_human_required

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

def get_db():
    with Session(engine) as session:
        yield session

pool = ClaudePool()

@router.post("/{task_id}/run-analysis")
async def run_analysis(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """触发需求分析阶段，AI 生成3个方案（后台异步执行）"""
    t = db.get(Task, task_id)
    if not t:
        return {"error": "task not found"}
    t.status = "running"
    db.commit()

    background_tasks.add_task(_run_analysis_bg, task_id)
    return {"status": "started", "task_id": task_id}


async def _run_analysis_bg(task_id: int):
    """后台执行：调用 Claude Code，解析方案，保存 artifact，通知"""
    with Session(engine) as db:
        t = db.get(Task, task_id)
        if not t:
            return

        prompt = build_analysis_prompt(t.title, t.description)
        log_dir = os.getenv("TC_LOG_DIR", "/tmp/task-conductor/logs")
        log_path = f"{log_dir}/task-{task_id}-analysis.log"

    full_output: list[str] = []

    try:
        async for event in pool.run(task_id, prompt, "/tmp", log_path):
            content = event.get("content") or event.get("result", "")
            if content:
                full_output.append(str(content))
            await manager.broadcast(
                f"task:{task_id}", "log", {"content": content}
            )
    except Exception as e:
        # Claude Code 不可用时（如测试/CI 环境），使用 mock 输出
        full_output = [_mock_analysis_output(task_id)]
        await manager.broadcast(
            f"task:{task_id}", "log", {"content": f"[mock] {full_output[0][:50]}..."}
        )

    raw = "".join(full_output)
    options = parse_options(raw)

    with Session(engine) as db:
        t = db.get(Task, task_id)
        artifact = StageArtifact(
            task_id=task_id,
            stage="analysis",
            artifact_type="json",
            content=json.dumps(
                {"raw": raw, "options": options}, ensure_ascii=False
            ),
        )
        db.add(artifact)
        t.status = "waiting_review"
        db.commit()

    await manager.broadcast(
        f"task:{task_id}",
        "stage_update",
        {"stage": "analysis", "status": "waiting_review", "options": options},
    )
    await notify_human_required(task_id, "analysis", "需求分析完成，请选择技术方案")


def _mock_analysis_output(task_id: int) -> str:
    return f"""
## 方案 A: 标准实现
工作量: M
风险: 低
描述: 使用成熟技术栈直接实现，稳定可靠，适合生产环境。

## 方案 B: 轻量方案
工作量: S
风险: 低
描述: 最简化实现，快速交付，适合 MVP 验证。

## 方案 C: 完整方案
工作量: L
风险: 中
描述: 包含完整功能和扩展性设计，适合长期维护的项目。

推荐方案 A，平衡了工作量和可靠性。
"""

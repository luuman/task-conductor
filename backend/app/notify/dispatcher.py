import os
import logging
from .tts import TtsNotifier
from .webhook import WebhookNotifier

logger = logging.getLogger(__name__)

tts = TtsNotifier()
webhook = WebhookNotifier(url=os.getenv("WEBHOOK_URL", ""))

async def notify_human_required(task_id: int, stage: str, message: str):
    """触发人工介入通知（TTS + webhook + 飞书卡片，web 端通知由调用方通过 WebSocket 推送）"""
    tts.notify(f"任务{task_id}，{stage}阶段，{message}")
    await webhook.notify(message, task_id, stage)

    # 飞书审批通知
    try:
        from ..feishu.client import feishu_client
        from ..feishu.cards import build_approval_card
        if not feishu_client.enabled:
            return

        from sqlalchemy.orm import Session
        from ..database import engine
        from ..models import Task, Project, StageArtifact

        with Session(engine) as db:
            task = db.get(Task, task_id)
            if not task:
                return
            project = db.get(Project, task.project_id)
            if not project or not project.feishu_chat_id:
                return
            chat_id = project.feishu_chat_id

            # 获取最新阶段产物的 confidence 和 summary
            artifact = (
                db.query(StageArtifact)
                .filter(StageArtifact.task_id == task_id, StageArtifact.stage == stage)
                .order_by(StageArtifact.created_at.desc())
                .first()
            )
            confidence = int(artifact.confidence or 0) if artifact else 0
            summary = (artifact.content[:200] if artifact else message)

        card = build_approval_card(
            task_id=task_id,
            stage=stage,
            summary=summary,
            confidence=confidence,
        )
        await feishu_client.send_card(chat_id, card)
    except Exception as e:
        logger.warning(f"[Feishu] 审批通知发送失败: {e}")

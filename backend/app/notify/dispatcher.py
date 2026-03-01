import os
from .tts import TtsNotifier
from .webhook import WebhookNotifier

tts = TtsNotifier()
webhook = WebhookNotifier(url=os.getenv("WEBHOOK_URL", ""))

async def notify_human_required(task_id: int, stage: str, message: str):
    """触发人工介入通知（TTS + webhook，web 端通知由调用方通过 WebSocket 推送）"""
    tts.notify(f"任务{task_id}，{stage}阶段，{message}")
    await webhook.notify(message, task_id, stage)

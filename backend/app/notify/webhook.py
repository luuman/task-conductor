import httpx

class WebhookNotifier:
    def __init__(self, url: str):
        self.url = url

    def build_payload(self, message: str, task_id: int, stage: str) -> dict:
        return {
            "msgtype": "text",
            "text": {"content": f"[TaskConductor] {message}"},
            "task_id": task_id,
            "stage": stage,
        }

    async def notify(self, message: str, task_id: int, stage: str):
        if not self.url:
            return
        payload = self.build_payload(message, task_id, stage)
        try:
            async with httpx.AsyncClient() as client:
                await client.post(self.url, json=payload, timeout=5)
        except Exception as e:
            print(f"[Webhook] 通知失败: {e}")

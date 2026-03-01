from app.notify.tts import TtsNotifier
from app.notify.webhook import WebhookNotifier

def test_tts_notifier_builds_command():
    n = TtsNotifier(pipe_path="/tmp/fake-pipe")
    cmd = n.build_command("任务完成，请审批")
    assert "任务完成，请审批" in " ".join(cmd)

def test_tts_notifier_default_path():
    n = TtsNotifier()
    assert n.pipe_path is not None
    assert len(n.pipe_path) > 0

def test_webhook_notifier_builds_payload():
    n = WebhookNotifier(url="https://example.com/hook")
    payload = n.build_payload("任务 #1 需要审批", task_id=1, stage="prd")
    assert "任务 #1 需要审批" in str(payload)
    assert payload["task_id"] == 1
    assert payload["stage"] == "prd"

def test_webhook_notifier_empty_url():
    n = WebhookNotifier(url="")
    assert n.url == ""

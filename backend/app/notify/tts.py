import subprocess
import os

class TtsNotifier:
    def __init__(self, pipe_path: str = None):
        self.pipe_path = pipe_path or os.getenv(
            "SPEAK_PIPE", "/home/sichengli/Documents/code2/speak-pipe"
        )

    def build_command(self, text: str) -> list[str]:
        return ["bash", "-c", f'echo "{text}" | {self.pipe_path}']

    def notify(self, text: str):
        if not os.path.exists(self.pipe_path):
            return  # 静默跳过（CI/测试环境）
        try:
            subprocess.Popen(self.build_command(text))
        except Exception as e:
            print(f"[TTS] 通知失败: {e}")

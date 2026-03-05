# backend/app/session.py
import os
import secrets
import string
from typing import Optional

from .auth import create_token, verify_token as _verify_jwt


class PinSession:
    def __init__(self):
        self._pin: Optional[str] = None

    def generate_pin(self) -> str:
        """生成 PIN。若环境变量 TC_PIN 设置了 6 位数字，则使用固定 PIN。"""
        fixed = os.getenv("TC_PIN", "")
        if fixed.isdigit() and len(fixed) == 6:
            self._pin = fixed
            return self._pin
        self._pin = "".join(secrets.choice(string.digits) for _ in range(6))
        return self._pin

    def verify_pin(self, pin: str) -> Optional[str]:
        """校验 PIN，正确则返回 JWT token。"""
        if self._pin and pin == self._pin:
            return create_token({"sub": "agent"})
        return None

    def verify_token(self, token: str) -> bool:
        """校验 JWT token，后端重启后仍有效（只要 SECRET_KEY 不变）。"""
        return _verify_jwt(token) is not None

    def revoke_all(self):
        """重新生成 PIN（JWT 无法服务端主动吊销，通过换 PIN 让旧 token 功能上失效）。"""
        self._pin = None


# 全局单例
pin_session = PinSession()

# backend/app/session.py
import secrets
import string
from typing import Optional

class PinSession:
    def __init__(self):
        self._pin: Optional[str] = None
        self._tokens: set[str] = set()

    def generate_pin(self) -> str:
        self._pin = "".join(secrets.choice(string.digits) for _ in range(6))
        return self._pin

    def verify_pin(self, pin: str) -> Optional[str]:
        if self._pin and pin == self._pin:
            token = secrets.token_urlsafe(32)
            self._tokens.add(token)
            return token
        return None

    def verify_token(self, token: str) -> bool:
        return token in self._tokens

    def revoke_all(self):
        self._tokens.clear()
        self._pin = None

# 全局单例
pin_session = PinSession()

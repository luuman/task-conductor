import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-use-32-char-min")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 365

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

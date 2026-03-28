"""
GitHub 备份同步 API。

GET  /api/sync/status        → 同步状态
PUT  /api/sync/config        → 更新配置
GET  /api/sync/crypto-params → 加密参数（桌面端使用）
POST /api/sync/push          → 手动触发备份
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..auth import verify_token as _verify_jwt
from ..database import engine
from ..models import BackupRecord
from ..sync.config import load_sync_config, update_sync_config
from ..sync.crypto import derive_master_key
from ..sync.job import run_sync_job

router = APIRouter(prefix="/api/sync", tags=["同步"])


def verify_token(authorization: str = Header(default="")) -> str:
    """Bearer token 鉴权依赖。"""
    token = authorization.removeprefix("Bearer ").strip()
    if not token or _verify_jwt(token) is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token


def _count_backup_records() -> int:
    with Session(engine) as db:
        return db.query(BackupRecord).count()


@router.get("/status")
def get_sync_status(_: str = Depends(verify_token)):
    cfg = load_sync_config()
    return {
        "enabled": cfg.enabled if cfg else False,
        "github_repo": cfg.github_repo if cfg else "",
        "last_push_at": cfg.last_push_at.isoformat() if (cfg and cfg.last_push_at) else None,
        "total_backed_up": _count_backup_records(),
    }


@router.put("/config")
def put_sync_config(body: dict, _: str = Depends(verify_token)):
    cfg = update_sync_config(body)
    return {"ok": True, "enabled": cfg.enabled, "github_repo": cfg.github_repo}


@router.get("/crypto-params")
def get_crypto_params(_: str = Depends(verify_token)):
    cfg = load_sync_config()
    if cfg is None or not cfg.encrypt_password or not cfg.salt:
        raise HTTPException(status_code=503, detail="sync not configured")
    master_key = derive_master_key(
        cfg.encrypt_password,
        cfg.salt,
        cfg.argon2_time_cost,
        cfg.argon2_memory_kb,
        cfg.argon2_parallelism,
    )
    return {
        "master_key_hex": master_key.hex(),
        "github_repo": cfg.github_repo,
        "github_pat": cfg.github_pat,
    }


@router.post("/push")
def manual_push(background_tasks: BackgroundTasks, _: str = Depends(verify_token)):
    background_tasks.add_task(run_sync_job)
    return {"ok": True, "message": "backup job started"}

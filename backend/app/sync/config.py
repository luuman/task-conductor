"""SyncConfig CRUD helpers。"""
from sqlalchemy.orm import Session

from ..database import engine
from ..models import SyncConfig
from .crypto import new_salt


def ensure_sync_config() -> None:
    """若 sync_config 表为空则插入默认行（id=1）。"""
    with Session(engine) as db:
        existing = db.get(SyncConfig, 1)
        if existing is None:
            cfg = SyncConfig(id=1, salt=new_salt())
            db.add(cfg)
            db.commit()


def load_sync_config() -> SyncConfig | None:
    """返回单行 SyncConfig（id=1），不存在返回 None。"""
    with Session(engine) as db:
        cfg = db.get(SyncConfig, 1)
        if cfg is not None:
            db.refresh(cfg)
        return cfg


def update_sync_config(data: dict) -> SyncConfig:
    """更新 SyncConfig 字段，只更新 data 中出现的 key。"""
    allowed = {
        "github_repo", "github_pat", "encrypt_password",
        "argon2_time_cost", "argon2_memory_kb", "argon2_parallelism",
        "enabled",
    }
    with Session(engine) as db:
        cfg = db.get(SyncConfig, 1)
        if cfg is None:
            cfg = SyncConfig(id=1, salt=new_salt())
            db.add(cfg)
        for key, value in data.items():
            if key in allowed:
                setattr(cfg, key, value)
        db.commit()
        db.refresh(cfg)
        return cfg

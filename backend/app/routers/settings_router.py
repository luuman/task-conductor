import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["设置"])

# 持久化到 backend/tc_settings.json（与 task_conductor.db 同级）
SETTINGS_FILE = Path(__file__).parent.parent.parent / "tc_settings.json"
DEFAULT_WORKSPACE_ROOT = "/home/sichengli/Documents/code2"


def _load() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"workspace_root": DEFAULT_WORKSPACE_ROOT}


def _save(data: dict):
    SETTINGS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


class SettingsOut(BaseModel):
    workspace_root: str


class SettingsUpdate(BaseModel):
    workspace_root: str


@router.get("", response_model=SettingsOut, summary="获取全局设置")
def get_settings():
    """返回全局设置（目前包含工作区根目录）。"""
    return _load()


@router.put("", response_model=SettingsOut, summary="更新全局设置")
def update_settings(body: SettingsUpdate):
    """
    更新全局设置。

    - `workspace_root`: 项目根目录，新项目将创建在此目录下。
      路径必须已存在于服务器文件系统中。
    """
    path = body.workspace_root.strip().rstrip("/")
    if not path:
        raise HTTPException(400, "路径不能为空")
    if not os.path.isdir(path):
        raise HTTPException(400, f"路径不存在或不是目录: {path}")
    data = _load()
    data["workspace_root"] = path
    _save(data)
    return data

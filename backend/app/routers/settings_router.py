import json
import os
import signal
import sys
from pathlib import Path
from typing import Optional
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
    feishu_app_id: str = ""
    feishu_app_secret: str = ""
    feishu_owner_id: str = ""
    feishu_default_chat_id: str = ""

    # 通知设置
    notify_tts_enabled: bool = True
    notify_tts_pipe_path: str = "/home/sichengli/Documents/code2/speak-pipe"
    notify_webhook_url: str = ""
    notify_webhook_enabled: bool = False
    notify_browser_enabled: bool = True

    # 流水线配置
    pipeline_approval_stages: list[str] = ["analysis", "prd", "ui", "plan", "test", "deploy"]
    pipeline_max_retries: int = 3
    pipeline_confidence_threshold: float = 0.5

    # 观测层设置
    observe_session_limit: int = 50
    observe_event_limit: int = 200
    observe_auto_cleanup: bool = False
    observe_cleanup_days: int = 30

    # 界面偏好
    ui_theme: str = "dark"
    ui_sidebar_collapsed: bool = False
    ui_default_page: str = "dashboard"
    ui_log_max_lines: int = 500

    # 安全设置
    security_tunnel_enabled: bool = False


class SettingsUpdate(BaseModel):
    workspace_root: str


class SettingsUpdateAll(BaseModel):
    workspace_root: Optional[str] = None
    feishu_app_id: Optional[str] = None
    feishu_app_secret: Optional[str] = None
    feishu_owner_id: Optional[str] = None
    feishu_default_chat_id: Optional[str] = None

    # 通知设置
    notify_tts_enabled: Optional[bool] = None
    notify_tts_pipe_path: Optional[str] = None
    notify_webhook_url: Optional[str] = None
    notify_webhook_enabled: Optional[bool] = None
    notify_browser_enabled: Optional[bool] = None

    # 流水线配置
    pipeline_approval_stages: Optional[list[str]] = None
    pipeline_max_retries: Optional[int] = None
    pipeline_confidence_threshold: Optional[float] = None

    # 观测层设置
    observe_session_limit: Optional[int] = None
    observe_event_limit: Optional[int] = None
    observe_auto_cleanup: Optional[bool] = None
    observe_cleanup_days: Optional[int] = None

    # 界面偏好
    ui_theme: Optional[str] = None
    ui_sidebar_collapsed: Optional[bool] = None
    ui_default_page: Optional[str] = None
    ui_log_max_lines: Optional[int] = None

    # 安全设置
    security_tunnel_enabled: Optional[bool] = None


class FeishuConfigUpdate(BaseModel):
    feishu_app_id: Optional[str] = None
    feishu_app_secret: Optional[str] = None
    feishu_owner_id: Optional[str] = None
    feishu_default_chat_id: Optional[str] = None


@router.get("", response_model=SettingsOut, summary="获取全局设置")
def get_settings():
    """返回全局设置（工作区根目录 + 飞书配置 + 通知/流水线/观测/界面/安全设置）。"""
    data = _load()
    defaults = SettingsOut(workspace_root=DEFAULT_WORKSPACE_ROOT)
    result = {
        "workspace_root": data.get("workspace_root", DEFAULT_WORKSPACE_ROOT),
        "feishu_app_id": os.getenv("FEISHU_APP_ID", ""),
        "feishu_app_secret": _mask_secret(os.getenv("FEISHU_APP_SECRET", "")),
        "feishu_owner_id": os.getenv("FEISHU_OWNER_ID", ""),
        "feishu_default_chat_id": data.get("feishu_default_chat_id", ""),
    }
    # 从持久化数据中读取扩展字段，使用 SettingsOut 默认值作为 fallback
    for field_name, field_info in SettingsOut.model_fields.items():
        if field_name not in result:
            result[field_name] = data.get(field_name, getattr(defaults, field_name))
    return result


def _mask_secret(secret: str) -> str:
    """遮蔽密钥，只显示前4位和后4位。"""
    if len(secret) <= 8:
        return "*" * len(secret)
    return secret[:4] + "*" * (len(secret) - 8) + secret[-4:]


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
    return get_settings()


@router.put("/feishu", summary="更新飞书配置")
def update_feishu_config(body: FeishuConfigUpdate):
    """更新飞书 API 配置。app_id/app_secret/owner_id 写入环境变量，default_chat_id 持久化到文件。"""
    data = _load()

    if body.feishu_app_id is not None:
        os.environ["FEISHU_APP_ID"] = body.feishu_app_id
    if body.feishu_app_secret is not None and "*" not in body.feishu_app_secret:
        os.environ["FEISHU_APP_SECRET"] = body.feishu_app_secret
    if body.feishu_owner_id is not None:
        os.environ["FEISHU_OWNER_ID"] = body.feishu_owner_id
    if body.feishu_default_chat_id is not None:
        data["feishu_default_chat_id"] = body.feishu_default_chat_id

    _save(data)

    # 刷新 feishu_client 单例
    from ..feishu.client import feishu_client
    feishu_client.app_id = os.getenv("FEISHU_APP_ID", "")
    feishu_client.app_secret = os.getenv("FEISHU_APP_SECRET", "")
    feishu_client.owner_id = os.getenv("FEISHU_OWNER_ID", "")

    return get_settings()


@router.post("/restart", summary="重启服务")
def restart_service():
    """重启后端服务进程（通过 exec 替换当前进程）。"""
    import subprocess
    # uvicorn --reload 模式下，修改文件即可触发重启
    # 但显式重启更可靠：用新进程替换当前进程
    os.execv(sys.executable, [sys.executable] + sys.argv)

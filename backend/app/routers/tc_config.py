"""
TaskConductor 全局配置管理 —— 读写 tc_global_config.json
供前端 Claude 配置页面的「全局配置」section 使用。
"""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/tc-config", tags=["全局配置"])

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "tc_global_config.json"

# ── 默认配置 ─────────────────────────────────────────────────────────

DEFAULT_CONFIG: dict[str, Any] = {
    "project": {
        "name": "",
        "description": "",
        "workDir": "./",
        "framework": "auto",
    },
    "api": {
        "apiKey": "",
        "endpoint": "https://api.anthropic.com",
        "version": "v1",
        "timeout": 30,
        "retries": 3,
    },
    "model": {
        "model": "claude-sonnet-4-6",
        "temperature": 0.7,
        "maxTokens": 4096,
        "topP": 0.9,
        "frequencyPenalty": 0,
        "presencePenalty": 0,
    },
    "features": {
        "autoComplete": True,
        "realTimeAnalysis": True,
        "errorDetection": True,
        "performanceSuggestions": False,
        "securityAudit": True,
        "docGeneration": False,
    },
    "advanced": {
        "concurrency": 5,
        "cacheSize": 100,
        "logLevel": "info",
        "logRetentionDays": 7,
        "proxy": "",
        "customHeaders": {},
    },
    "permissions": {
        "fileAccess": ["read"],
        "networkAccess": True,
        "terminalExec": False,
        "envVars": {},
        "whitelistPaths": [],
        "blacklistFiles": [".env", "config.json"],
    },
    "notifications": {
        "emailEnabled": False,
        "email": "",
        "slackWebhook": "",
        "discordWebhook": "",
        "notifyLevel": "error",
    },
    "monitoring": {
        "enabled": True,
        "sampleRate": 10,
        "alertThresholdMs": 2000,
        "dataRetentionDays": 30,
    },
    "integrations": {
        "gitAutoCommit": False,
        "jiraUrl": "",
        "jiraToken": "",
        "githubToken": "",
        "slackBotToken": "",
    },
    "ui": {
        "theme": "system",
        "fontSize": "medium",
        "codeHighlight": True,
        "autoSave": True,
    },
}


# ── 读写辅助 ─────────────────────────────────────────────────────────


def _read() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return _deep_copy(DEFAULT_CONFIG)
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        # 合并缺失字段
        merged = _deep_copy(DEFAULT_CONFIG)
        _deep_merge(merged, data)
        return merged
    except Exception:
        return _deep_copy(DEFAULT_CONFIG)


def _write(data: dict[str, Any]):
    CONFIG_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _deep_copy(d: dict) -> dict:
    return json.loads(json.dumps(d))


def _deep_merge(base: dict, override: dict):
    for k, v in override.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


# ── Pydantic 模型 ────────────────────────────────────────────────────


class SectionUpdate(BaseModel):
    section: str
    data: dict[str, Any]


class FullConfigUpdate(BaseModel):
    config: dict[str, Any]


# ── 端点 ─────────────────────────────────────────────────────────────


@router.get("", summary="读取全局配置")
def get_config() -> dict[str, Any]:
    return _read()


@router.get("/defaults", summary="获取默认配置")
def get_defaults() -> dict[str, Any]:
    return _deep_copy(DEFAULT_CONFIG)


@router.put("/section", summary="更新某个配置分区")
def update_section(body: SectionUpdate) -> dict[str, Any]:
    config = _read()
    if body.section in config and isinstance(config[body.section], dict):
        config[body.section].update(body.data)
    else:
        config[body.section] = body.data
    _write(config)
    return config


@router.put("", summary="覆盖整个配置")
def update_full(body: FullConfigUpdate) -> dict[str, Any]:
    merged = _deep_copy(DEFAULT_CONFIG)
    _deep_merge(merged, body.config)
    _write(merged)
    return merged


@router.post("/reset", summary="重置为默认配置")
def reset_config() -> dict[str, Any]:
    defaults = _deep_copy(DEFAULT_CONFIG)
    _write(defaults)
    return defaults


@router.post("/export", summary="导出配置")
def export_config() -> dict[str, Any]:
    return _read()


@router.post("/import", summary="导入配置")
def import_config(body: FullConfigUpdate) -> dict[str, Any]:
    merged = _deep_copy(DEFAULT_CONFIG)
    _deep_merge(merged, body.config)
    _write(merged)
    return merged

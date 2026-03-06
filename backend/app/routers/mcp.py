# backend/app/routers/mcp.py
"""MCP 服务市场 — 推荐列表 + 一键安装/卸载"""
import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter

router = APIRouter(prefix="/api/mcp", tags=["MCP 市场"])

CLAUDE_JSON = Path.home() / ".claude.json"

# ── 内置推荐列表 ──────────────────────────────────────────────────
REGISTRY: list[dict] = [
    {
        "id": "deepwiki",
        "name": "DeepWiki",
        "description": "AI 驱动的 GitHub 仓库文档，快速了解任意开源项目",
        "icon": "book-open",
        "type": "sse",
        "url": "https://mcp.deepwiki.com/mcp",
        "auth_type": "none",
        "category": "knowledge",
    },
    {
        "id": "figma",
        "name": "Figma",
        "description": "读取 Figma 设计稿，生成代码，管理 Code Connect",
        "icon": "figma",
        "type": "http",
        "url": "https://mcp.figma.com/mcp",
        "auth_type": "none",
        "category": "design",
    },
    {
        "id": "google-calendar",
        "name": "Google Calendar",
        "description": "查看和管理 Google 日历事件",
        "icon": "calendar",
        "type": "sse",
        "url": "https://gcal.mcp.claude.com/mcp",
        "auth_type": "oauth",
        "auth_note": "需要在 claude.ai 中完成 Google 授权",
        "category": "productivity",
    },
    {
        "id": "gmail",
        "name": "Gmail",
        "description": "搜索和阅读 Gmail 邮件",
        "icon": "mail",
        "type": "sse",
        "url": "https://gmail.mcp.claude.com/mcp",
        "auth_type": "oauth",
        "auth_note": "需要在 claude.ai 中完成 Google 授权",
        "category": "productivity",
    },
    {
        "id": "github",
        "name": "GitHub",
        "description": "搜索代码、管理 PR/Issue、读取仓库内容",
        "icon": "github",
        "type": "sse",
        "url": "https://api.githubcopilot.com/mcp/",
        "auth_type": "none",
        "category": "development",
    },
    {
        "id": "fetch",
        "name": "Web Fetch",
        "description": "抓取网页内容并转为 Markdown，支持 robots.txt",
        "icon": "globe",
        "type": "command",
        "command": "uvx",
        "args": ["mcp-server-fetch"],
        "auth_type": "none",
        "category": "utility",
    },
    {
        "id": "filesystem",
        "name": "Filesystem",
        "description": "安全的文件系统访问，支持读写、搜索、目录操作",
        "icon": "folder",
        "type": "command",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
        "auth_type": "none",
        "category": "utility",
    },
    {
        "id": "postgres",
        "name": "PostgreSQL",
        "description": "连接 PostgreSQL 数据库，执行只读查询和表结构分析",
        "icon": "database",
        "type": "command",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"],
        "auth_type": "token",
        "auth_note": "需要提供 PostgreSQL 连接字符串",
        "auth_env": "POSTGRES_CONNECTION_STRING",
        "category": "database",
    },
    {
        "id": "sentry",
        "name": "Sentry",
        "description": "查询 Sentry 错误和性能数据，辅助调试",
        "icon": "bug",
        "type": "command",
        "command": "npx",
        "args": ["-y", "@sentry/mcp-server"],
        "auth_type": "token",
        "auth_note": "需要 Sentry Auth Token",
        "auth_env": "SENTRY_AUTH_TOKEN",
        "category": "development",
    },
    {
        "id": "linear",
        "name": "Linear",
        "description": "管理 Linear 项目、Issue 和团队工作流",
        "icon": "layout-list",
        "type": "command",
        "command": "npx",
        "args": ["-y", "@linear/mcp-server"],
        "auth_type": "token",
        "auth_note": "需要 Linear API Key",
        "auth_env": "LINEAR_API_KEY",
        "category": "productivity",
    },
]


def _read_claude_json() -> dict:
    if CLAUDE_JSON.exists():
        try:
            return json.loads(CLAUDE_JSON.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _write_claude_json(data: dict):
    CLAUDE_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _get_installed() -> dict:
    return _read_claude_json().get("mcpServers", {})


@router.get("/servers", summary="获取 MCP 服务列表（含安装状态）")
def list_servers():
    installed = _get_installed()
    result = []
    for srv in REGISTRY:
        entry = {**srv, "installed": srv["id"] in installed}
        result.append(entry)

    # 也列出用户手动安装但不在推荐列表中的服务
    registry_ids = {s["id"] for s in REGISTRY}
    for sid, cfg in installed.items():
        if sid not in registry_ids:
            result.append({
                "id": sid,
                "name": sid,
                "description": "用户自定义 MCP 服务",
                "icon": "puzzle",
                "type": cfg.get("type", "unknown"),
                "url": cfg.get("url", ""),
                "auth_type": "none",
                "category": "custom",
                "installed": True,
            })
    return result


@router.post("/servers/{server_id}/install", summary="安装 MCP 服务")
def install_server(server_id: str, body: Optional[dict] = None):
    body = body or {}
    srv = next((s for s in REGISTRY if s["id"] == server_id), None)
    if not srv:
        return {"ok": False, "error": "未知的 MCP 服务"}

    data = _read_claude_json()
    servers = data.setdefault("mcpServers", {})

    # 构建 MCP 配置
    if srv["type"] in ("sse", "http"):
        config: dict = {"type": srv["type"], "url": srv["url"]}
    elif srv["type"] == "command":
        config = {
            "type": "stdio",
            "command": srv["command"],
            "args": srv.get("args", []),
        }
        # 如果需要环境变量（token 类型认证）
        if srv.get("auth_env") and body.get("token"):
            config["env"] = {srv["auth_env"]: body["token"]}
    else:
        return {"ok": False, "error": f"不支持的类型: {srv['type']}"}

    servers[server_id] = config
    _write_claude_json(data)
    return {"ok": True, "config": config}


@router.delete("/servers/{server_id}/uninstall", summary="卸载 MCP 服务")
def uninstall_server(server_id: str):
    data = _read_claude_json()
    servers = data.get("mcpServers", {})
    if server_id not in servers:
        return {"ok": False, "error": "该服务未安装"}
    del servers[server_id]
    _write_claude_json(data)
    return {"ok": True}

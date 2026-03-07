"""飞书开放平台 API 客户端（单例模式）"""

from __future__ import annotations

import os
import time

import httpx

FEISHU_API_BASE = "https://open.feishu.cn/open-apis"


def _http_proxy() -> str | None:
    """获取 HTTP 代理地址（避免使用 socks5 代理）"""
    return os.getenv("https_proxy") or os.getenv("http_proxy") or None


def _client() -> httpx.AsyncClient:
    """创建 httpx 客户端，显式使用 HTTP 代理避免 socks5 问题"""
    proxy = _http_proxy()
    if proxy and proxy.startswith("socks"):
        proxy = None  # 跳过 socks 代理
    return httpx.AsyncClient(proxy=proxy, timeout=15)


class FeishuClient:
    """飞书 API 异步客户端，全局单例。"""

    def __init__(self) -> None:
        self.app_id: str = os.getenv("FEISHU_APP_ID", "")
        self.app_secret: str = os.getenv("FEISHU_APP_SECRET", "")
        self.owner_id: str = os.getenv("FEISHU_OWNER_ID", "")

        self._tenant_token: str = ""
        self._token_expires_at: float = 0.0

    # ------------------------------------------------------------------
    # 属性
    # ------------------------------------------------------------------

    @property
    def enabled(self) -> bool:
        """飞书集成是否已配置。"""
        return bool(self.app_id and self.app_secret)

    # ------------------------------------------------------------------
    # Token 管理
    # ------------------------------------------------------------------

    async def get_tenant_token(self) -> str:
        """获取 tenant_access_token，带缓存，提前 60s 刷新。"""
        if self._tenant_token and time.time() < self._token_expires_at:
            return self._tenant_token

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal",
                json={"app_id": self.app_id, "app_secret": self.app_secret},
            )
            resp.raise_for_status()
            data = resp.json()

        self._tenant_token = data["tenant_access_token"]
        # expire 字段为秒数，提前 60 秒刷新
        self._token_expires_at = time.time() + data.get("expire", 7200) - 60
        return self._tenant_token

    async def _headers(self) -> dict[str, str]:
        token = await self.get_tenant_token()
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}

    # ------------------------------------------------------------------
    # 群聊
    # ------------------------------------------------------------------

    async def create_group(self, name: str) -> dict:
        """创建群聊，拉入 owner。返回响应 data。"""
        headers = await self._headers()
        body: dict = {"name": name}
        if self.owner_id:
            body["owner_id"] = self.owner_id
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{FEISHU_API_BASE}/im/v1/chats",
                headers=headers,
                json=body,
            )
            resp.raise_for_status()
            return resp.json().get("data", {})

    async def add_member(self, chat_id: str, user_id: str) -> dict:
        """拉人入群。"""
        headers = await self._headers()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{FEISHU_API_BASE}/im/v1/chats/{chat_id}/members",
                headers=headers,
                json={"id_list": [user_id]},
            )
            resp.raise_for_status()
            return resp.json().get("data", {})

    # ------------------------------------------------------------------
    # 消息
    # ------------------------------------------------------------------

    async def send_message(self, chat_id: str, msg_type: str, content: str) -> str:
        """发送消息到群聊，返回 message_id。"""
        headers = await self._headers()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{FEISHU_API_BASE}/im/v1/messages",
                headers=headers,
                params={"receive_id_type": "chat_id"},
                json={
                    "receive_id": chat_id,
                    "msg_type": msg_type,
                    "content": content,
                },
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return data.get("message_id", "")

    async def send_card(self, chat_id: str, card: dict) -> str:
        """发送交互卡片，返回 message_id。"""
        import json as _json

        return await self.send_message(chat_id, "interactive", _json.dumps(card))

    async def update_card(self, message_id: str, card: dict) -> dict:
        """更新已发送的交互卡片。"""
        import json as _json

        headers = await self._headers()
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{FEISHU_API_BASE}/im/v1/messages/{message_id}",
                headers=headers,
                json={"msg_type": "interactive", "content": _json.dumps(card)},
            )
            resp.raise_for_status()
            return resp.json().get("data", {})

    async def reply_message(self, message_id: str, msg_type: str, content: str) -> str:
        """回复指定消息，返回新 message_id。"""
        headers = await self._headers()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{FEISHU_API_BASE}/im/v1/messages/{message_id}/reply",
                headers=headers,
                json={"msg_type": msg_type, "content": content},
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return data.get("message_id", "")


# 全局单例
feishu_client = FeishuClient()

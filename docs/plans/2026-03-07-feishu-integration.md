# 飞书集成 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将飞书作为 TaskConductor 的消息入口，支持默认群对话模式和项目群 Pipeline 模式。

**Architecture:** 新增 `backend/app/feishu/` 模块，包含飞书 API 客户端、消息分发器、卡片模板。通过 `/hooks/feishu/event` 接收飞书事件订阅，`/hooks/feishu/card` 接收卡片按钮回调。复用现有 `ClaudePool` 执行 Claude Code，复用 `notify/dispatcher.py` 集成审批通知。

**Tech Stack:** FastAPI, httpx (飞书 API), 飞书开放平台 Event Subscription v2.0, MessageCard v2

---

## Task 1: FeishuClient — 飞书 API 客户端

**Files:**
- Create: `backend/app/feishu/__init__.py`
- Create: `backend/app/feishu/client.py`

**Step 1: 创建模块和客户端**

`backend/app/feishu/__init__.py`:
```python
```

`backend/app/feishu/client.py`:
```python
import os
import time
import httpx
import logging

logger = logging.getLogger(__name__)

FEISHU_BASE = "https://open.feishu.cn/open-apis"


class FeishuClient:
    """飞书开放平台 API 客户端，单例模式"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._token = None
            cls._instance._token_expires = 0
        return cls._instance

    @property
    def app_id(self) -> str:
        return os.getenv("FEISHU_APP_ID", "")

    @property
    def app_secret(self) -> str:
        return os.getenv("FEISHU_APP_SECRET", "")

    @property
    def owner_id(self) -> str:
        return os.getenv("FEISHU_OWNER_ID", "")

    @property
    def enabled(self) -> bool:
        return bool(self.app_id and self.app_secret)

    async def get_tenant_token(self) -> str:
        """获取 tenant_access_token，自动缓存和刷新"""
        if self._token and time.time() < self._token_expires - 60:
            return self._token
        async with httpx.AsyncClient() as c:
            resp = await c.post(
                f"{FEISHU_BASE}/auth/v3/tenant_access_token/internal",
                json={"app_id": self.app_id, "app_secret": self.app_secret},
                timeout=10,
            )
            data = resp.json()
            self._token = data["tenant_access_token"]
            self._token_expires = time.time() + data.get("expire", 7200)
        return self._token

    async def _headers(self) -> dict:
        token = await self.get_tenant_token()
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}

    async def create_group(self, name: str) -> str:
        """创建群聊并拉入 owner，返回 chat_id"""
        headers = await self._headers()
        async with httpx.AsyncClient() as c:
            resp = await c.post(
                f"{FEISHU_BASE}/im/v1/chats",
                headers=headers,
                json={
                    "name": name,
                    "chat_mode": "group",
                    "chat_type": "private",
                    "owner_id": self.owner_id,
                    "user_id_type": "open_id",
                },
                timeout=10,
            )
            data = resp.json()
            chat_id = data["data"]["chat_id"]
        # 拉 owner 入群
        await self.add_member(chat_id, self.owner_id)
        logger.info(f"[Feishu] 创建群: {name} -> {chat_id}")
        return chat_id

    async def add_member(self, chat_id: str, user_id: str):
        headers = await self._headers()
        async with httpx.AsyncClient() as c:
            await c.post(
                f"{FEISHU_BASE}/im/v1/chats/{chat_id}/members",
                headers=headers,
                params={"member_id_type": "open_id"},
                json={"id_list": [user_id]},
                timeout=10,
            )

    async def send_message(self, chat_id: str, msg_type: str, content: str) -> str:
        """发送消息，返回 message_id"""
        headers = await self._headers()
        async with httpx.AsyncClient() as c:
            resp = await c.post(
                f"{FEISHU_BASE}/im/v1/messages",
                headers=headers,
                params={"receive_id_type": "chat_id"},
                json={
                    "receive_id": chat_id,
                    "msg_type": msg_type,
                    "content": content,
                },
                timeout=10,
            )
            data = resp.json()
            return data.get("data", {}).get("message_id", "")

    async def send_card(self, chat_id: str, card: dict) -> str:
        """发送交互卡片"""
        import json
        return await self.send_message(chat_id, "interactive", json.dumps(card))

    async def update_card(self, message_id: str, card: dict):
        """更新已发送的卡片内容（用于审批后更新状态）"""
        import json
        headers = await self._headers()
        async with httpx.AsyncClient() as c:
            await c.patch(
                f"{FEISHU_BASE}/im/v1/messages/{message_id}",
                headers=headers,
                json={
                    "msg_type": "interactive",
                    "content": json.dumps(card),
                },
                timeout=10,
            )

    async def reply_message(self, message_id: str, msg_type: str, content: str) -> str:
        """回复消息"""
        headers = await self._headers()
        async with httpx.AsyncClient() as c:
            resp = await c.post(
                f"{FEISHU_BASE}/im/v1/messages/{message_id}/reply",
                headers=headers,
                json={
                    "msg_type": msg_type,
                    "content": content,
                },
                timeout=10,
            )
            data = resp.json()
            return data.get("data", {}).get("message_id", "")


feishu_client = FeishuClient()
```

**Step 2: 验证模块可导入**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -c "from app.feishu.client import feishu_client; print('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add backend/app/feishu/__init__.py backend/app/feishu/client.py
git commit -m "feat(feishu): add FeishuClient API wrapper"
```

---

## Task 2: 卡片模板构建器

**Files:**
- Create: `backend/app/feishu/cards.py`

**Step 1: 创建卡片模板**

`backend/app/feishu/cards.py`:
```python
"""飞书 MessageCard 模板构建"""
import json


def build_result_card(content: str, cost_ms: int = 0, cwd: str = "") -> dict:
    """Claude 执行结果卡片"""
    # 截断过长内容
    display = content[:3000] + "\n...(已截断)" if len(content) > 3000 else content
    note_parts = []
    if cost_ms:
        note_parts.append(f"⏱ {cost_ms / 1000:.1f}s")
    if cwd:
        note_parts.append(f"📁 {cwd}")
    elements = [
        {"tag": "markdown", "content": display},
    ]
    if note_parts:
        elements.append({
            "tag": "note",
            "elements": [{"tag": "plain_text", "content": " | ".join(note_parts)}],
        })
    return {
        "header": {
            "template": "blue",
            "title": {"tag": "plain_text", "content": "Claude Code"},
        },
        "elements": elements,
    }


def build_thinking_card() -> dict:
    """思考中占位卡片"""
    return {
        "header": {
            "template": "blue",
            "title": {"tag": "plain_text", "content": "Claude Code"},
        },
        "elements": [
            {"tag": "markdown", "content": "⏳ 正在思考..."},
        ],
    }


def build_error_card(error: str) -> dict:
    """错误卡片"""
    return {
        "header": {
            "template": "red",
            "title": {"tag": "plain_text", "content": "❌ 执行失败"},
        },
        "elements": [
            {"tag": "markdown", "content": f"```\n{error[:2000]}\n```"},
        ],
    }


def build_approval_card(task_id: int, stage: str, summary: str, confidence: float = 0) -> dict:
    """Pipeline 审批卡片"""
    conf_text = f"**置信度：** {confidence:.0%}\n" if confidence else ""
    return {
        "header": {
            "template": "orange",
            "title": {"tag": "plain_text", "content": f"🔍 {stage} 阶段完成 - 待审批"},
        },
        "elements": [
            {
                "tag": "markdown",
                "content": f"**任务 #{task_id}**\n{conf_text}\n{summary[:2000]}",
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "✅ 通过"},
                        "type": "primary",
                        "value": json.dumps({"action": "approve", "task_id": task_id}),
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "❌ 驳回"},
                        "type": "danger",
                        "value": json.dumps({"action": "reject", "task_id": task_id}),
                    },
                ],
            },
        ],
    }


def build_approved_card(task_id: int, stage: str, action: str) -> dict:
    """审批完成后更新的卡片"""
    if action == "approve":
        template, icon, label = "green", "✅", "已通过"
    else:
        template, icon, label = "red", "❌", "已驳回"
    return {
        "header": {
            "template": template,
            "title": {"tag": "plain_text", "content": f"{icon} {stage} 阶段 - {label}"},
        },
        "elements": [
            {"tag": "markdown", "content": f"任务 #{task_id} 的 {stage} 阶段已{label}。"},
        ],
    }


def build_task_created_card(task_id: int, title: str, project_name: str) -> dict:
    """任务创建通知卡片"""
    return {
        "header": {
            "template": "green",
            "title": {"tag": "plain_text", "content": "📋 任务已创建"},
        },
        "elements": [
            {
                "tag": "markdown",
                "content": f"**#{task_id}** {title}\n**项目：** {project_name}\n\n流水线已启动，将在需要审批时通知你。",
            },
        ],
    }


def build_welcome_card(project_name: str) -> dict:
    """项目群欢迎卡片"""
    return {
        "header": {
            "template": "blue",
            "title": {"tag": "plain_text", "content": f"🎉 {project_name}"},
        },
        "elements": [
            {
                "tag": "markdown",
                "content": (
                    f"项目群已就绪。\n\n"
                    f"**对话模式：** 直接发消息，Claude 会在项目目录下执行\n"
                    f"**创建任务：** 发送 `/task 任务标题` 创建 Pipeline 任务\n"
                ),
            },
        ],
    }
```

**Step 2: 验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -c "from app.feishu.cards import build_result_card; print(build_result_card('hello', 1500, '/tmp'))"`
Expected: 输出 dict 结构

**Step 3: Commit**

```bash
git add backend/app/feishu/cards.py
git commit -m "feat(feishu): add MessageCard templates"
```

---

## Task 3: 消息处理器 — ChatHandler

**Files:**
- Create: `backend/app/feishu/handler.py`

**Step 1: 实现 ChatHandler**

`backend/app/feishu/handler.py`:
```python
"""飞书消息处理：对话模式 + Pipeline 模式"""
import asyncio
import json
import logging
import time
from datetime import datetime
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Project, Task
from ..claude.pool import ClaudePool
from ..routers.settings_router import _load as _load_settings
from .client import feishu_client
from .cards import (
    build_result_card,
    build_thinking_card,
    build_error_card,
    build_task_created_card,
)

logger = logging.getLogger(__name__)
pool = ClaudePool()


async def handle_chat(prompt: str, chat_id: str, cwd: str):
    """对话模式：调用 Claude Code，结果发回飞书"""
    # 发送占位卡片
    msg_id = await feishu_client.send_card(chat_id, build_thinking_card())

    start = time.time()
    try:
        result_parts = []
        async for event in pool.run(
            task_id=f"feishu-{int(time.time())}",
            prompt=prompt,
            worktree_path=cwd,
            log_file=f"/tmp/task-conductor/logs/feishu-{int(time.time())}.log",
        ):
            content = event.get("content") or event.get("result", "")
            if content:
                result_parts.append(str(content))

        result = "\n".join(result_parts) if result_parts else "(无输出)"
        cost_ms = int((time.time() - start) * 1000)

        # 更新卡片为结果
        await feishu_client.update_card(msg_id, build_result_card(result, cost_ms, cwd))
    except Exception as e:
        logger.exception("[Feishu] handle_chat failed")
        await feishu_client.update_card(msg_id, build_error_card(str(e)))


async def handle_task_create(title: str, chat_id: str, project_id: int, project_name: str):
    """Pipeline 模式：创建任务并启动流水线"""
    with Session(engine) as db:
        task = Task(
            project_id=project_id,
            title=title,
            description=title,
            stage="input",
            status="pending",
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        task_id = task.id

    await feishu_client.send_card(
        chat_id,
        build_task_created_card(task_id, title, project_name),
    )

    # 异步启动 Pipeline
    from ..pipeline.runner import run_pipeline
    worktree = _get_project_cwd(project_id)
    asyncio.create_task(run_pipeline(task_id, worktree))


def _get_project_cwd(project_id: int) -> str:
    """获取项目工作目录"""
    with Session(engine) as db:
        project = db.get(Project, project_id)
        if project and project.repo_url:
            return project.repo_url
    return _load_settings().get("workspace_root", "/tmp")
```

**Step 2: 验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -c "from app.feishu.handler import handle_chat; print('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add backend/app/feishu/handler.py
git commit -m "feat(feishu): add ChatHandler for chat and pipeline modes"
```

---

## Task 4: 消息分发器 + API 端点

**Files:**
- Create: `backend/app/feishu/dispatcher.py`
- Modify: `backend/app/main.py` (注册路由、lifespan 初始化)

**Step 1: 实现 FeishuDispatcher**

`backend/app/feishu/dispatcher.py`:
```python
"""飞书事件分发：路由消息到正确的处理器"""
import asyncio
import json
import logging
from fastapi import APIRouter, Request
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Project
from ..routers.settings_router import _load as _load_settings
from .client import feishu_client
from .handler import handle_chat, handle_task_create

logger = logging.getLogger(__name__)
router = APIRouter(tags=["飞书"])

# 事件去重：记录最近处理过的 event_id
_processed_events: set[str] = set()
_MAX_EVENTS = 1000

# 默认群 chat_id（启动时初始化）
_default_chat_id: str = ""


def set_default_chat_id(chat_id: str):
    global _default_chat_id
    _default_chat_id = chat_id


def get_default_chat_id() -> str:
    return _default_chat_id


def _deduplicate(event_id: str) -> bool:
    """返回 True 表示是重复事件，应跳过"""
    if event_id in _processed_events:
        return True
    _processed_events.add(event_id)
    if len(_processed_events) > _MAX_EVENTS:
        # 简单清理：丢弃一半
        to_remove = list(_processed_events)[:_MAX_EVENTS // 2]
        for eid in to_remove:
            _processed_events.discard(eid)
    return False


def _extract_text(msg: dict) -> str:
    """从飞书消息中提取纯文本"""
    content_str = msg.get("content", "{}")
    try:
        content = json.loads(content_str)
        return content.get("text", "").strip()
    except Exception:
        return ""


def _find_project_by_chat(chat_id: str) -> tuple[int, str, str] | None:
    """根据 chat_id 查找项目，返回 (project_id, project_name, repo_url) 或 None"""
    with Session(engine) as db:
        project = db.query(Project).filter(
            Project.feishu_chat_id == chat_id
        ).first()
        if project:
            return project.id, project.name, project.repo_url or ""
    return None


@router.post("/hooks/feishu/event", summary="飞书事件回调")
async def feishu_event(request: Request):
    body = await request.json()

    # URL 验证（首次配置时飞书发送的 challenge）
    if "challenge" in body:
        return {"challenge": body["challenge"]}

    # v2.0 事件格式
    header = body.get("header", {})
    event_id = header.get("event_id", "")
    event_type = header.get("event_type", "")

    if event_id and _deduplicate(event_id):
        return {"code": 0, "msg": "duplicate"}

    if event_type == "im.message.receive_v1":
        event = body.get("event", {})
        msg = event.get("message", {})
        chat_id = msg.get("chat_id", "")
        text = _extract_text(msg)
        msg_type = msg.get("message_type", "")

        # 只处理文本消息
        if msg_type != "text" or not text:
            return {"code": 0}

        # 忽略机器人自己的消息
        sender = event.get("sender", {}).get("sender_id", {})
        sender_type = event.get("sender", {}).get("sender_type", "")
        if sender_type == "app":
            return {"code": 0}

        # 路由消息
        asyncio.create_task(_dispatch_message(chat_id, text))

    return {"code": 0}


async def _dispatch_message(chat_id: str, text: str):
    """根据 chat_id 路由到不同的处理器"""
    try:
        # 默认群 → 对话模式
        if chat_id == _default_chat_id:
            cwd = _load_settings().get("workspace_root", "/tmp")
            await handle_chat(text, chat_id, cwd)
            return

        # 项目群
        project_info = _find_project_by_chat(chat_id)
        if project_info:
            project_id, project_name, repo_url = project_info
            cwd = repo_url or _load_settings().get("workspace_root", "/tmp")

            # /task 前缀 → Pipeline 模式
            if text.startswith("/task "):
                title = text[6:].strip()
                if title:
                    await handle_task_create(title, chat_id, project_id, project_name)
                return

            # 普通消息 → 对话模式
            await handle_chat(text, chat_id, cwd)
            return

        # 未知群 → 忽略
        logger.debug(f"[Feishu] 未知群 {chat_id}，忽略")
    except Exception:
        logger.exception(f"[Feishu] dispatch error for chat {chat_id}")


@router.post("/hooks/feishu/card", summary="飞书卡片动作回调")
async def feishu_card_action(request: Request):
    """处理审批卡片的按钮点击"""
    body = await request.json()

    action = body.get("action", {})
    value_str = action.get("value", "{}")
    try:
        value = json.loads(value_str) if isinstance(value_str, str) else value_str
    except Exception:
        value = {}

    action_type = value.get("action", "")
    task_id = value.get("task_id")

    if not task_id or action_type not in ("approve", "reject"):
        return {"code": 0}

    # 调用已有的审批逻辑
    from ..routers.tasks import _do_approve, _do_advance
    try:
        if action_type == "approve":
            _do_approve(task_id, "approve", "飞书审批通过")
            _do_advance(task_id)
        else:
            _do_approve(task_id, "reject", "飞书审批驳回")

        # 更新卡片
        from .cards import build_approved_card
        msg_id = body.get("open_message_id", "")
        if msg_id:
            # 获取当前 stage
            with Session(engine) as db:
                from ..models import Task
                task = db.get(Task, task_id)
                stage = task.stage if task else "unknown"
            await feishu_client.update_card(
                msg_id, build_approved_card(task_id, stage, action_type)
            )
    except Exception:
        logger.exception(f"[Feishu] card action failed: task={task_id}")

    return {"code": 0}


@router.get("/api/feishu/status", summary="飞书连接状态")
async def feishu_status():
    return {
        "enabled": feishu_client.enabled,
        "default_chat_id": _default_chat_id,
        "app_id": feishu_client.app_id[:8] + "..." if feishu_client.app_id else "",
    }


@router.post("/api/feishu/bind-group", summary="手动绑定项目群")
async def bind_group(body: dict):
    """手动绑定已有飞书群到项目"""
    project_id = body.get("project_id")
    chat_id = body.get("chat_id", "")
    if not project_id or not chat_id:
        from fastapi import HTTPException
        raise HTTPException(400, "project_id 和 chat_id 必填")
    with Session(engine) as db:
        project = db.get(Project, project_id)
        if not project:
            from fastapi import HTTPException
            raise HTTPException(404, "项目不存在")
        project.feishu_chat_id = chat_id
        db.commit()
    return {"ok": True, "project_id": project_id, "chat_id": chat_id}
```

**Step 2: 在 models.py 中为 Project 添加 feishu_chat_id 字段**

Modify: `backend/app/models.py`

在 `Project` 类中 `sort_order` 行之后添加：
```python
    feishu_chat_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
```

**Step 3: 在 main.py 中注册飞书路由和初始化**

Modify: `backend/app/main.py`

在 imports 区域添加：
```python
from .feishu.dispatcher import router as feishu_router
```

在 `app.include_router(tc_config_router.router)` 之后添加：
```python
app.include_router(feishu_router)
```

在 `lifespan` 函数的 `yield` 之前添加飞书初始化：
```python
    # 飞书初始化
    from .feishu.client import feishu_client
    if feishu_client.enabled:
        asyncio.create_task(_init_feishu())
```

在 `_start_tunnel_bg` 函数之后添加：
```python
async def _init_feishu():
    """启动时初始化飞书：确保默认群存在"""
    import json
    from .feishu.client import feishu_client
    from .feishu.dispatcher import set_default_chat_id
    from .feishu.cards import build_welcome_card

    # 从 tc_settings.json 读取或创建默认群
    from .routers.settings_router import _load, _save, SETTINGS_FILE
    settings = _load()
    default_chat_id = settings.get("feishu_default_chat_id", "")

    if not default_chat_id:
        try:
            default_chat_id = await feishu_client.create_group("Claude 助手")
            settings["feishu_default_chat_id"] = default_chat_id
            _save(settings)
            await feishu_client.send_card(
                default_chat_id,
                {
                    "header": {
                        "template": "blue",
                        "title": {"tag": "plain_text", "content": "🤖 Claude 助手"},
                    },
                    "elements": [{
                        "tag": "markdown",
                        "content": "默认对话群已就绪。直接发消息即可与 Claude Code 交互。",
                    }],
                },
            )
        except Exception as e:
            print(f"  [Feishu] 创建默认群失败: {e}")
            return

    set_default_chat_id(default_chat_id)
    _print_table([
        ("飞书 App", feishu_client.app_id),
        ("默认群", default_chat_id),
    ], title="飞书集成已启动")
```

**Step 4: 验证**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -c "from app.feishu.dispatcher import router; print('ok')"`
Expected: `ok`

**Step 5: Commit**

```bash
git add backend/app/feishu/dispatcher.py backend/app/models.py backend/app/main.py
git commit -m "feat(feishu): add dispatcher, event/card endpoints, feishu init on startup"
```

---

## Task 5: 审批逻辑提取 + Notify 集成

**Files:**
- Modify: `backend/app/routers/tasks.py` (提取 `_do_approve`/`_do_advance` 供飞书复用)
- Modify: `backend/app/notify/dispatcher.py` (添加飞书通知)

**Step 1: 查看 tasks.py 的 approve/advance 逻辑**

先读取 `backend/app/routers/tasks.py` 确认当前结构，然后提取核心逻辑为独立函数 `_do_approve(task_id, action, reason)` 和 `_do_advance(task_id)`，保持原有 HTTP 端点调用这些函数。

**Step 2: 修改 notify/dispatcher.py**

在 `notify_human_required` 中添加飞书通知：
```python
import os
from .tts import TtsNotifier
from .webhook import WebhookNotifier

tts = TtsNotifier()
webhook = WebhookNotifier(url=os.getenv("WEBHOOK_URL", ""))


async def notify_human_required(task_id: int, stage: str, message: str):
    """触发人工介入通知（TTS + webhook + 飞书卡片）"""
    tts.notify(f"任务{task_id}，{stage}阶段，{message}")
    await webhook.notify(message, task_id, stage)

    # 飞书通知
    try:
        from ..feishu.client import feishu_client
        if feishu_client.enabled:
            await _notify_feishu(task_id, stage, message)
    except Exception:
        pass


async def _notify_feishu(task_id: int, stage: str, message: str):
    from ..feishu.client import feishu_client
    from ..feishu.cards import build_approval_card
    from sqlalchemy.orm import Session
    from ..database import engine
    from ..models import Task, Project, StageArtifact
    import json

    with Session(engine) as db:
        task = db.get(Task, task_id)
        if not task:
            return
        project = db.get(Project, task.project_id)
        if not project or not project.feishu_chat_id:
            return
        chat_id = project.feishu_chat_id

        # 获取最新 artifact 的摘要
        artifact = db.query(StageArtifact).filter(
            StageArtifact.task_id == task_id,
            StageArtifact.stage == stage,
        ).order_by(StageArtifact.created_at.desc()).first()

        summary = message
        confidence = 0.0
        if artifact:
            confidence = artifact.confidence or 0.0
            try:
                content = json.loads(artifact.content)
                summary = content.get("summary", message)[:500]
            except Exception:
                pass

    await feishu_client.send_card(
        chat_id,
        build_approval_card(task_id, stage, summary, confidence),
    )
```

**Step 3: Commit**

```bash
git add backend/app/routers/tasks.py backend/app/notify/dispatcher.py
git commit -m "feat(feishu): integrate approval notifications with Feishu cards"
```

---

## Task 6: 项目创建时自动建群

**Files:**
- Modify: `backend/app/routers/projects.py`
- Modify: `backend/app/schemas.py` (ProjectOut 添加 feishu_chat_id)

**Step 1: 修改 create_project**

在 `backend/app/routers/projects.py` 的 `create_project` 函数中，在 `db.commit()` 之后添加飞书建群逻辑：
```python
    # 飞书自动建群
    from ..feishu.client import feishu_client
    if feishu_client.enabled:
        import asyncio
        asyncio.create_task(_create_feishu_group(p.id, p.name))
```

新增辅助函数：
```python
async def _create_feishu_group(project_id: int, project_name: str):
    from ..feishu.client import feishu_client
    from ..feishu.cards import build_welcome_card
    try:
        chat_id = await feishu_client.create_group(f"TC: {project_name}")
        with Session(engine) as db:
            p = db.get(Project, project_id)
            if p:
                p.feishu_chat_id = chat_id
                db.commit()
        await feishu_client.send_card(chat_id, build_welcome_card(project_name))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[Feishu] 建群失败: {e}")
```

**Step 2: 修改 schemas.py**

在 `ProjectOut` 中添加：
```python
    feishu_chat_id: Optional[str] = None
```

**Step 3: Commit**

```bash
git add backend/app/routers/projects.py backend/app/schemas.py
git commit -m "feat(feishu): auto-create Feishu group on project creation"
```

---

## Task 7: 数据库迁移 + 环境变量配置

**Files:**
- Create: `backend/.env.example` (添加飞书配置示例)

**Step 1: 确保 DB 迁移生效**

本项目使用 `Base.metadata.create_all()` 自动建表。新增的 `feishu_chat_id` 列需要手动 ALTER（SQLite 不支持 `create_all` 自动添加列）：

```python
# 在 lifespan 中 create_all 之后添加：
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE projects ADD COLUMN feishu_chat_id VARCHAR(100)"))
        conn.commit()
except Exception:
    pass  # 列已存在
```

Modify: `backend/app/main.py` lifespan 函数

**Step 2: 创建 .env.example**

在 `backend/.env.example` 中添加飞书配置示例（追加到现有内容，如果有的话）。

**Step 3: Commit**

```bash
git add backend/app/main.py backend/.env.example
git commit -m "feat(feishu): add DB migration and env config example"
```

---

## Task 8: 端到端测试

**Step 1: 启动后端确认无报错**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && timeout 5 python -c "from app.main import app; print('app created ok')" || true`

**Step 2: 验证飞书 API 连通性**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -c "
import asyncio
from app.feishu.client import feishu_client
async def test():
    if not feishu_client.enabled:
        print('SKIP: feishu not configured')
        return
    token = await feishu_client.get_tenant_token()
    print(f'token: {token[:20]}...')
asyncio.run(test())
"`

**Step 3: 在飞书开放平台配置事件订阅**

手动操作（不自动化）：
1. 登录 https://open.feishu.cn → 应用 → 配置
2. 事件订阅 URL: `https://<tunnel>/hooks/feishu/event`
3. 添加事件: `im.message.receive_v1`
4. 请求卡片回调 URL: `https://<tunnel>/hooks/feishu/card`
5. 权限: `im:message:receive`, `im:chat:create`, `im:message:send`, `im:chat:member:manage`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(feishu): complete Feishu integration for TaskConductor"
```

---

## 依赖关系

```
Task 1 (client) ──┐
                   ├── Task 3 (handler) ──┐
Task 2 (cards)  ──┘                       ├── Task 4 (dispatcher + routes)
                                          │
                              Task 5 (notify) ← Task 4
                              Task 6 (projects) ← Task 1, Task 2
                              Task 7 (migration) ← Task 4
                              Task 8 (e2e test) ← all
```

Task 1 和 Task 2 可并行。Task 3 依赖 Task 1。Task 4 依赖 Task 1-3。Task 5-7 可在 Task 4 之后并行。Task 8 最后。

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Header, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession
from .database import engine
from .models import Base, ClaudeSession, ClaudeEvent
from .routers import projects, tasks
from .routers import pipeline as pipeline_router
from .routers import metrics as metrics_router
from .routers import sessions as sessions_router
from .routers import task_manager as task_manager_router
from .routers import knowledge as knowledge_router
from .routers import settings_router
from .routers import claude_config as claude_config_router
from .routers import mcp as mcp_router
from .routers import tc_config as tc_config_router
from .feishu.dispatcher import router as feishu_router
from .session import pin_session
from .tunnel import start_cloudflare_tunnel, get_tunnel_url, stop_tunnel, detect_tunnel_url_from_request
from .hooks import parse_hook_event, serialize_json_field
from .claude.metrics_store import metrics_store


def _disp_w(s: str) -> int:
    """计算字符串终端显示宽度（CJK 字符占 2 列）"""
    import unicodedata
    return sum(2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in s)


def _pad(s: str, width: int) -> str:
    """将字符串补空格到 width 显示列"""
    return s + " " * (width - _disp_w(s))


def _print_table(rows: list[tuple[str, str]], title: str = "") -> None:
    """打印两列对齐表格（支持 CJK 双宽字符）"""
    c1 = max(_disp_w(r[0]) for r in rows)
    c2 = max(_disp_w(r[1]) for r in rows)
    sep = "+" + "-" * (c1 + 2) + "+" + "-" * (c2 + 2) + "+"
    if title:
        print(f"\n  {title}")
    print(f"  {sep}")
    for label, value in rows:
        print(f"  | {_pad(label, c1)} | {_pad(value, c2)} |")
        print(f"  {sep}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    # 飞书字段迁移
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN feishu_chat_id VARCHAR(100)"))
            conn.commit()
    except Exception:
        pass  # 列已存在

    pin = pin_session.generate_pin()
    fixed = os.getenv("TC_PIN", "")
    is_fixed = fixed.isdigit() and len(fixed) == 6

    local_url = "http://localhost:7070"
    api_url   = "http://localhost:8765"

    _print_table([
        ("仪表板",    local_url),
        ("API",       api_url),
        ("PIN",       f"{pin}  {'(固定 TC_PIN)' if is_fixed else '(每次重启随机)'}"),
        ("登录方式",  f"打开 {local_url} → 输入 PIN"),
        ("API 文档",  f"{api_url}/docs"),
    ], title="TaskConductor 已启动")

    if os.getenv("TC_TUNNEL", "1") == "1":
        asyncio.create_task(_start_tunnel_bg(pin))
    yield
    stop_tunnel()


async def _start_tunnel_bg(pin: str):
    url = await start_cloudflare_tunnel(8765)
    if url:
        _print_table([
            ("Tunnel URL", url),
            ("PIN",        pin),
            ("登录方式",   f"打开前端 → Tunnel 模式 → 填入上方信息"),
        ], title="Cloudflare Tunnel 已就绪")


tags_metadata = [
    {
        "name": "认证",
        "description": "PIN 鉴权：使用 6 位 PIN 换取 Bearer Token，Token 用于后续所有 API 请求。",
    },
    {
        "name": "项目",
        "description": "项目管理：创建、列出项目，以及在项目下创建/列出任务。",
    },
    {
        "name": "任务",
        "description": "任务管理：查看任务详情、阶段产物，推进或审批流水线阶段。",
    },
    {
        "name": "流水线",
        "description": "AI 流水线：触发各阶段的 Claude Code 自动执行（需求分析、PRD、开发等）。",
    },
    {
        "name": "指标",
        "description": "运行指标：KPI 数据、高可用性仪表盘、周处理量统计。",
    },
    {
        "name": "会话",
        "description": "Claude 会话监控：查看所有 Claude Code 会话及其事件历史。",
    },
    {
        "name": "WebSocket",
        "description": "实时推送：任务日志、会话状态变化的 WebSocket 端点。",
    },
]

app = FastAPI(
    title="TaskConductor",
    description=(
        "**TaskConductor** 是 AI 驱动的任务流水线管理平台，"
        "将需求自动拆解为多个阶段（分析 → PRD → UI → 开发 → 测试 → 发布 → 监控），"
        "由 Claude Code 自动执行，人工在关键节点审批。\n\n"
        "## 鉴权方式\n"
        "1. `POST /auth/pin` 用启动时控制台显示的 6 位 PIN 换取 Token\n"
        "2. 后续请求在 Header 中携带 `Authorization: Bearer <token>`\n\n"
        "## Claude Code Hooks\n"
        "通过 `scripts/install-hooks.sh` 注册 Claude Code 生命周期事件，"
        "事件自动推送到 `POST /hooks/claude`，可在实时监控面板中查看。"
    ),
    version="2.0.0",
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(pipeline_router.router)
app.include_router(metrics_router.router)
app.include_router(sessions_router.router)   # GET /api/sessions, GET /api/sessions/{id}/events
app.include_router(task_manager_router.router)  # POST /api/task-manager/analyze
app.include_router(knowledge_router.router)  # GET/DELETE /api/projects/{id}/knowledge
app.include_router(settings_router.router)   # GET/PUT /api/settings
app.include_router(claude_config_router.router)  # GET/PUT /api/claude-config
app.include_router(mcp_router.router)            # GET/POST/DELETE /api/mcp/servers
app.include_router(tc_config_router.router)      # GET/PUT /api/tc-config
app.include_router(feishu_router)


# ── 基础 endpoints ─────────────────────────────────────────────

@app.get("/health", tags=["认证"], summary="健康检查")
def health():
    """检查后端服务是否正常运行。"""
    return {"status": "ok"}


@app.get("/agent/info", tags=["认证"], summary="Agent 信息")
def agent_info(request: Request):
    """返回当前 Cloudflare Tunnel 公网地址和版本号。"""
    # 从请求 Host header 自动检测公网 URL
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "https")
    detect_tunnel_url_from_request(host, scheme)
    return {
        "tunnel_url": get_tunnel_url(),
        "version": "2.0.0",
    }


@app.post("/api/shutdown", tags=["系统"], summary="关闭服务")
def shutdown():
    """安全关闭后端服务进程。"""
    import signal
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting_down"}


# ── 认证 ────────────────────────────────────────────────────────

from pydantic import BaseModel as PM
from fastapi import HTTPException


class PinRequest(PM):
    pin: str


@app.get("/auth/local", tags=["认证"], summary="本地免 PIN 认证")
def auth_local(request: Request):
    """仅允许来自 127.0.0.1 / ::1 的请求，无需 PIN 直接返回 Token。"""
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(403, "仅允许本地访问")
    from .auth import create_token
    token = create_token({"sub": "agent"})
    return {"token": token}


@app.post("/auth/pin", tags=["认证"], summary="PIN 换 Token")
def auth_pin(body: PinRequest):
    """
    使用 6 位 PIN 码换取 Bearer Token。

    - PIN 在服务启动时打印到控制台
    - 可通过环境变量 `TC_PIN=xxxxxx` 固定 PIN，Token 重启后永久有效
    """
    token = pin_session.verify_pin(body.pin)
    if not token:
        raise HTTPException(401, "Invalid PIN")
    return {"token": token}


@app.get("/auth/check", tags=["认证"], summary="校验 Token")
def auth_check(authorization: str = Header(default="")):
    """
    验证 Bearer Token 是否有效。

    请求头格式：`Authorization: Bearer <token>`
    """
    token = authorization.replace("Bearer ", "")
    if not pin_session.verify_token(token):
        raise HTTPException(401, "Unauthorized")
    return {"ok": True}


# ── WebSocket ────────────────────────────────────────────────────

from .ws.manager import manager


@app.websocket("/ws/task/{task_id}")
async def task_ws(websocket: WebSocket, task_id: str):
    """
    [WebSocket] 任务实时日志与状态推送。

    订阅指定任务的流水线执行日志和状态变化事件。
    消息格式：`{"type": "log"|"stage_update", "data": {...}, "ts": "..."}`
    """
    await manager.connect(websocket, f"task:{task_id}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"task:{task_id}")


@app.websocket("/ws/sessions")
async def sessions_ws(websocket: WebSocket):
    """
    [WebSocket] 全局 Claude 会话概览推送。

    订阅所有 Claude Code 会话的状态变化（PreToolUse / PostToolUse / Stop 等）。
    用于实时监控面板。
    消息格式：`{"type": "session_update", "data": {...}, "ts": "..."}`
    """
    await manager.connect(websocket, "sessions")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "sessions")


@app.websocket("/ws/session/{session_id}")
async def session_detail_ws(websocket: WebSocket, session_id: str):
    """
    [WebSocket] 单个 Claude 会话的实时事件流。

    订阅指定会话的每条 Hook 事件（工具调用详情等）。
    消息格式：`{"type": "claude_event", "data": {...}, "ts": "..."}`
    """
    await manager.connect(websocket, f"session:{session_id}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"session:{session_id}")


# 保留旧的 global monitor 端点（向后兼容）
@app.websocket("/ws/claude-monitor")
async def claude_monitor_ws(websocket: WebSocket):
    """[WebSocket] 同 /ws/sessions，保留向后兼容。"""
    await manager.connect(websocket, "sessions")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "sessions")


# ── Claude Code Hook 接收端 ──────────────────────────────────────

@app.post("/hooks/claude", tags=["会话"], summary="接收 Claude Code Hook 事件")
async def receive_claude_hook(payload: dict):
    """
    接收来自 Claude Code 的 Hook 事件（由 `tc-hook.sh` 调用）。

    **处理流程：**
    1. 根据 `session_id` 创建或更新 `ClaudeSession` 记录
    2. 插入 `ClaudeEvent` 事件记录
    3. 向 `session:{session_id}` 频道广播（供单会话详情页）
    4. 向 `sessions` 频道广播（供全局监控面板）

    **支持的事件类型：** PreToolUse / PostToolUse / PostToolUseFailure /
    Stop / SessionStart / SessionEnd / Notification / SubagentStart / SubagentStop
    """
    event = parse_hook_event(payload)
    session_id = event.get("session_id")
    event_type = event.get("type", "Unknown")

    session_status = "unknown"
    session_db_id = None

    if session_id:
        with DBSession(engine) as db:
            sess = db.query(ClaudeSession).filter_by(session_id=session_id).first()

            if not sess:
                sess = ClaudeSession(
                    session_id=session_id,
                    cwd=event.get("cwd") or "",
                    status="active",
                )
                db.add(sess)
                db.flush()  # 获取自增 id

            # 更新会话状态 & 时间戳
            sess.last_seen_at = datetime.utcnow()
            if event_type == "SessionEnd":
                sess.status = "stopped"
            elif event_type == "Stop":
                sess.status = "idle"
            elif event_type in ("PreToolUse", "UserPromptSubmit", "SessionStart"):
                sess.status = "active"

            # 插入事件
            ev = ClaudeEvent(
                claude_session_id=sess.id,
                event_type=event_type,
                tool_name=event.get("tool_name"),
                tool_input=serialize_json_field(event.get("tool_input")),
                tool_result=serialize_json_field(event.get("tool_result")),
                extra=serialize_json_field(event.get("extra")),
            )
            db.add(ev)
            db.commit()

            session_status = sess.status
            session_db_id = sess.id

    # ── MetricsStore 侧录 ─────────────────────────────────────────
    if event_type == "Stop" and session_id:
        extra = event.get("extra") or {}
        usage = extra.get("usage") or {}
        if usage:
            metrics_store.record_tokens(
                session_id=session_id,
                model=extra.get("model", "default"),
                input_tokens=int(usage.get("input_tokens", 0)),
                output_tokens=int(usage.get("output_tokens", 0)),
                cache_write=int(usage.get("cache_creation_input_tokens", 0)),
                cache_read=int(usage.get("cache_read_input_tokens", 0)),
            )

    if event_type == "PreToolUse" and session_id and event.get("tool_name"):
        metrics_store.record_tool_call(
            tool_name=event["tool_name"],
            session_id=session_id,
        )

    # 向单会话频道推送（供 SessionDetail 页面消费）
    if session_id:
        await manager.broadcast(
            f"session:{session_id}",
            "claude_event",
            {
                "session_id": session_id,
                "event_type": event_type,
                "tool_name": event.get("tool_name"),
                "tool_input": event.get("tool_input"),
                "extra": event.get("extra"),
                "ts": event.get("ts"),
            },
        )

    # 向全局会话概览频道推送（供 Sessions 列表页和 Monitor Panel 消费）
    await manager.broadcast(
        "sessions",
        "session_update",
        {
            "session_id": session_id,
            "session_db_id": session_db_id,
            "event_type": event_type,
            "tool_name": event.get("tool_name"),
            "tool_input": event.get("tool_input"),   # 用于监控面板显示操作详情
            "extra": event.get("extra"),
            "cwd": event.get("cwd"),
            "status": session_status,
            "ts": event.get("ts"),
        },
    )

    return {"ok": True}


# ── tmux 管理（保留原有接口）────────────────────────────────────

from .tmux_manager import list_sessions as tmux_list, create_session, send_command, kill_session


@app.get("/sessions/tmux")
def get_tmux_sessions():
    return {"sessions": tmux_list()}


@app.post("/sessions/tmux/{name}")
def post_tmux_session(name: str, cwd: str = "/tmp"):
    ok = create_session(name, cwd)
    return {"created": ok, "name": name}


@app.post("/sessions/tmux/{name}/send")
async def post_tmux_send(name: str, payload: dict):
    ok = send_command(name, payload.get("command", ""))
    return {"sent": ok}

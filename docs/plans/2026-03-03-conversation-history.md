# 对话历史功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 侧边栏新增「对话历史」导航项，以聊天气泡形式回看 Claude Code 会话记录，并支持对会话添加别名、标签、备注、关联任务。

**Architecture:** 后端新增 `ConversationNote` 表（不修改 `ClaudeSession` 只读表），通过 `GET/PUT /api/sessions/{session_id}/note` 管理；`GET /api/sessions` 响应追加 `note` 字段（LEFT JOIN）。前端新增 `ConversationHistory` 页面（双栏：会话列表 + 气泡视图 + 编辑面板），侧边栏加入对应导航项。

**Tech Stack:** FastAPI + SQLAlchemy 2.0 Mapped（后端）、React + TypeScript + Tailwind（前端）、TestClient（后端测试）

**Design Doc:** `docs/plans/2026-03-03-conversation-history-design.md`

---

## Task 1: 后端 — 新增 ConversationNote 模型

**Files:**
- Modify: `backend/app/models.py`

**Step 1: 在 `models.py` 末尾追加 `ConversationNote` 类**

```python
class ConversationNote(Base):
    """用户对 Claude 会话添加的元数据（别名/标签/备注/关联任务）"""
    __tablename__ = "conversation_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("claude_sessions.id"), unique=True, index=True
    )
    alias: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # JSON list[str]
    linked_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tasks.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    session: Mapped["ClaudeSession"] = relationship()
    linked_task: Mapped[Optional["Task"]] = relationship()
```

**Step 2: 验证启动时表自动创建（`Base.metadata.create_all` 已在 `lifespan` 中调用）**

```bash
cd backend
source .venv/bin/activate
python -c "from app.models import ConversationNote; print('OK')"
```
期望：打印 `OK`，无错误

**Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add ConversationNote model"
```

---

## Task 2: 后端 — 新增 /note 接口 + 更新 sessions 列表

**Files:**
- Modify: `backend/app/routers/sessions.py`
- Create: `backend/tests/test_conversation_note.py`

**Step 1: 写失败测试**

新建 `backend/tests/test_conversation_note.py`：

```python
from fastapi.testclient import TestClient
from app.main import app
from app.database import engine
from app.models import Base, ClaudeSession
from sqlalchemy.orm import Session as DBSession
from datetime import datetime

client = TestClient(app)


def _create_session(session_id: str = "test-session-abc") -> int:
    """在 DB 中直接插入一条测试 ClaudeSession，返回其 id"""
    with DBSession(engine) as db:
        s = ClaudeSession(
            session_id=session_id,
            cwd="/tmp/test",
            status="stopped",
            started_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow(),
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        return s.id


def test_get_note_not_found_returns_empty():
    _create_session("note-test-1")
    resp = client.get("/api/sessions/note-test-1/note")
    assert resp.status_code == 200
    data = resp.json()
    assert data["alias"] is None
    assert data["notes"] is None
    assert data["tags"] == []
    assert data["linked_task_id"] is None


def test_put_note_creates_and_returns():
    _create_session("note-test-2")
    resp = client.put("/api/sessions/note-test-2/note", json={
        "alias": "我的测试会话",
        "tags": ["bug", "重要"],
        "notes": "这是一条备注",
        "linked_task_id": None,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["alias"] == "我的测试会话"
    assert data["tags"] == ["bug", "重要"]
    assert data["notes"] == "这是一条备注"


def test_put_note_updates_existing():
    _create_session("note-test-3")
    client.put("/api/sessions/note-test-3/note", json={"alias": "旧名字"})
    resp = client.put("/api/sessions/note-test-3/note", json={"alias": "新名字"})
    assert resp.status_code == 200
    assert resp.json()["alias"] == "新名字"


def test_sessions_list_includes_note_field():
    _create_session("note-test-4")
    client.put("/api/sessions/note-test-4/note", json={"alias": "列表中的别名"})
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    target = next((s for s in sessions if s["session_id"] == "note-test-4"), None)
    assert target is not None
    assert target["note"]["alias"] == "列表中的别名"
```

**Step 2: 运行测试，确认失败**

```bash
cd backend && pytest tests/test_conversation_note.py -v
```
期望：4 个 FAIL（路由不存在）

**Step 3: 实现接口**

在 `backend/app/routers/sessions.py` 中追加以下内容（在文件末尾）：

首先在文件顶部 import 中加上 `ConversationNote`：
```python
from ..models import ClaudeSession, ClaudeEvent, ConversationNote
```

然后追加路由实现：

```python
# ── ConversationNote Pydantic 模型（内联，无需新建文件）──────────────

from pydantic import BaseModel as PM
from typing import Optional as Opt


class NoteIn(PM):
    alias: Opt[str] = None
    notes: Opt[str] = None
    tags: Opt[list[str]] = None
    linked_task_id: Opt[int] = None


def _note_to_dict(note: ConversationNote | None) -> dict:
    if note is None:
        return {"alias": None, "notes": None, "tags": [], "linked_task_id": None}
    tags = []
    if note.tags:
        try:
            import json as _json
            tags = _json.loads(note.tags)
        except Exception:
            pass
    return {
        "alias": note.alias,
        "notes": note.notes,
        "tags": tags,
        "linked_task_id": note.linked_task_id,
    }


@router.get("/{session_id}/note", summary="获取会话备注")
def get_session_note(session_id: str, db: Session = Depends(get_db)):
    """获取会话的用户备注（别名/标签/备注/关联任务）。若尚未创建，返回空结构。"""
    session = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not session:
        return {"alias": None, "notes": None, "tags": [], "linked_task_id": None}
    note = db.query(ConversationNote).filter_by(session_id=session.id).first()
    return _note_to_dict(note)


@router.put("/{session_id}/note", summary="创建或更新会话备注")
def upsert_session_note(session_id: str, body: NoteIn, db: Session = Depends(get_db)):
    """Upsert 会话的用户备注。不存在则创建，存在则更新。"""
    import json as _json
    session = db.query(ClaudeSession).filter_by(session_id=session_id).first()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(404, "会话不存在")

    note = db.query(ConversationNote).filter_by(session_id=session.id).first()
    tags_json = _json.dumps(body.tags, ensure_ascii=False) if body.tags is not None else None

    if note is None:
        note = ConversationNote(
            session_id=session.id,
            alias=body.alias,
            notes=body.notes,
            tags=tags_json,
            linked_task_id=body.linked_task_id,
        )
        db.add(note)
    else:
        if body.alias is not None:
            note.alias = body.alias
        if body.notes is not None:
            note.notes = body.notes
        if body.tags is not None:
            note.tags = tags_json
        if body.linked_task_id is not None:
            note.linked_task_id = body.linked_task_id

    db.commit()
    db.refresh(note)
    return _note_to_dict(note)
```

同时更新 `list_sessions` 函数，在每条 session 追加 `note` 字段：

找到 `list_sessions` 中的 `result.append({...})` 块，在末尾加入 `"note"` 字段：
```python
    # 在 result.append({...}) 内添加，紧跟在 "event_count": event_count 之后：
    note = db.query(ConversationNote).filter_by(session_id=s.id).first()
    # ...
    result.append({
        "id": s.id,
        "session_id": s.session_id,
        "cwd": s.cwd,
        "status": s.status,
        "linked_task_id": s.linked_task_id,
        "started_at": s.started_at.isoformat(),
        "last_seen_at": s.last_seen_at.isoformat(),
        "event_count": event_count,
        "note": _note_to_dict(note),  # ← 新增
    })
```

**Step 4: 运行测试，确认通过**

```bash
cd backend && pytest tests/test_conversation_note.py -v
```
期望：4 个 PASS

**Step 5: 运行全量测试确认无回归**

```bash
cd backend && pytest --tb=short -q
```
期望：全部通过

**Step 6: Commit**

```bash
git add backend/app/routers/sessions.py backend/tests/test_conversation_note.py
git commit -m "feat: add GET/PUT /api/sessions/{id}/note + note field in session list"
```

---

## Task 3: 前端 — 更新 API 类型和接口

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: 在 `ClaudeSession` 接口追加 `note` 字段**

找到 `api.ts` 中的 `ClaudeSession` interface，修改为：

```typescript
export interface ConversationNote {
  alias: string | null;
  notes: string | null;
  tags: string[];
  linked_task_id: number | null;
}

export interface ClaudeSession {
  id: number;
  session_id: string;
  cwd: string;
  status: "active" | "idle" | "stopped";
  linked_task_id: number | null;
  started_at: string;
  last_seen_at: string;
  event_count: number;
  note: ConversationNote;  // ← 新增
}
```

**Step 2: 在 `api` 对象的 `sessions` 下新增 note 方法**

找到 `api.sessions` 块，追加：

```typescript
sessions: {
  list: () => request<ClaudeSession[]>("/api/sessions"),
  events: (sessionId: string) => request<ClaudeEvent[]>(`/api/sessions/${sessionId}/events`),
  getNote: (sessionId: string) => request<ConversationNote>(`/api/sessions/${sessionId}/note`),
  upsertNote: (sessionId: string, body: Partial<ConversationNote>) =>
    request<ConversationNote>(`/api/sessions/${sessionId}/note`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
},
```

**Step 3: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add ConversationNote type and note API methods"
```

---

## Task 4: 前端 — 侧边栏新增导航项

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: 在 `Sidebar.tsx` 顶部 import 中加入 `MessageSquare`**

找到：
```typescript
import { LayoutDashboard, CheckSquare, Settings, Radio, Plus, ChevronLeft, ChevronRight } from "lucide-react";
```
改为：
```typescript
import { LayoutDashboard, CheckSquare, Settings, Radio, MessageSquare, Plus, ChevronLeft, ChevronRight } from "lucide-react";
```

**Step 2: 在 `NAV_ITEMS` 数组中加入「对话历史」**

找到：
```typescript
const NAV_ITEMS = [
  { id: "dashboard", label: "仪表盘",  Icon: LayoutDashboard },
  { id: "tasks",     label: "任务管理", Icon: CheckSquare     },
  { id: "settings",  label: "设置",    Icon: Settings        },
];
```
改为：
```typescript
const NAV_ITEMS = [
  { id: "dashboard",     label: "仪表盘",   Icon: LayoutDashboard },
  { id: "tasks",         label: "任务管理", Icon: CheckSquare     },
  { id: "conversations", label: "对话历史", Icon: MessageSquare   },
  { id: "settings",      label: "设置",     Icon: Settings        },
];
```

**Step 3: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add 对话历史 nav item to sidebar"
```

---

## Task 5: 前端 — ConvSessionList 组件

**Files:**
- Create: `frontend/src/components/ConvSessionList.tsx`

**Step 1: 创建组件**

```typescript
// frontend/src/components/ConvSessionList.tsx
import { useState } from "react";
import { cn } from "../lib/utils";
import type { ClaudeSession } from "../lib/api";

interface Props {
  sessions: ClaudeSession[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (session: ClaudeSession) => void;
}

function cwdShort(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/") || path;
}

function StatusDot({ status }: { status: ClaudeSession["status"] }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      status === "active"  ? "bg-green-400" :
      status === "idle"    ? "bg-yellow-400" : "bg-gray-500"
    )} />
  );
}

export function ConvSessionList({ sessions, loading, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter(s =>
        (s.note?.alias ?? "").toLowerCase().includes(search.toLowerCase()) ||
        s.cwd.toLowerCase().includes(search.toLowerCase()) ||
        (s.note?.tags ?? []).some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : sessions;

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索别名 / 路径 / 标签..."
          className="w-full text-[11px] font-mono rounded px-2.5 py-1.5 outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-[11px]"
               style={{ color: "var(--text-tertiary)" }}>加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center"
               style={{ color: "var(--text-tertiary)" }}>
            <span className="text-2xl">💬</span>
            <p className="text-[11px]">{search ? "无匹配结果" : "暂无会话记录"}</p>
          </div>
        ) : (
          filtered.map(s => {
            const active = selectedId === s.id;
            const displayName = s.note?.alias || cwdShort(s.cwd) || s.session_id.slice(0, 8);
            const tags = s.note?.tags ?? [];
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full px-3 py-2 text-left transition-colors border-l-2 hover:bg-white/[0.03]"
                style={{
                  borderLeftColor: active ? "var(--accent)" : "transparent",
                  background: active ? "var(--background-tertiary)" : undefined,
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <StatusDot status={s.status} />
                  <span className="text-[12px] font-medium truncate flex-1"
                        style={{ color: "var(--text-primary)" }}>
                    {displayName}
                  </span>
                </div>

                {/* 标签 chips */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {tags.slice(0, 3).map(tag => (
                      <span key={tag}
                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono truncate"
                        style={{ color: "var(--text-tertiary)" }}>
                    {s.session_id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] shrink-0"
                        style={{ color: "var(--text-tertiary)" }}>
                    {s.event_count} 条
                  </span>
                </div>

                {s.note?.linked_task_id && (
                  <span className="text-[9px] mt-0.5 block"
                        style={{ color: "var(--accent)" }}>
                    → Task #{s.note.linked_task_id}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
```

**Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 3: Commit**

```bash
git add frontend/src/components/ConvSessionList.tsx
git commit -m "feat: ConvSessionList component"
```

---

## Task 6: 前端 — ConvBubbles 气泡渲染组件

**Files:**
- Create: `frontend/src/components/ConvBubbles.tsx`

**Step 1: 创建组件**

气泡渲染逻辑：将 `ClaudeEvent[]` 转换成气泡列表，`PreToolUse` 和对应 `PostToolUse` 合并为一张工具卡片。

```typescript
// frontend/src/components/ConvBubbles.tsx
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import type { ClaudeEvent } from "../lib/api";

// ── 工具摘要 ──────────────────────────────────────────────────

function toolSummary(toolName: string | null, input: Record<string, unknown> | null): string {
  if (!toolName || !input) return "";
  switch (toolName) {
    case "Read": case "Write": case "Edit":
      return String(input.file_path || input.notebook_path || "");
    case "Bash":
      return String(input.command || "").slice(0, 120);
    case "Glob":   return String(input.pattern || "");
    case "Grep":   return `"${input.pattern}"${input.path ? "  " + input.path : ""}`;
    case "WebSearch": return String(input.query || "");
    case "WebFetch":  return String(input.url || "");
    case "Agent":  return String(input.description || input.prompt || "").slice(0, 100);
    default:
      try { return JSON.stringify(input).slice(0, 100); } catch { return ""; }
  }
}

// ── 气泡类型 ──────────────────────────────────────────────────

type Bubble =
  | { kind: "banner";  icon: string; text: string; sub?: string; color: string }
  | { kind: "tool";    name: string; detail: string; done: boolean; durationMs?: number; success?: boolean }
  | { kind: "notify";  message: string }
  | { kind: "subagent"; text: string };

function eventsToBubbles(events: ClaudeEvent[]): Bubble[] {
  const bubbles: Bubble[] = [];
  const preMap = new Map<string, ClaudeEvent>();  // tool_name+index → PreToolUse event

  let i = 0;
  while (i < events.length) {
    const e = events[i];

    if (e.event_type === "SessionStart") {
      bubbles.push({ kind: "banner", icon: "▶", text: "会话开始",
        sub: new Date(e.created_at).toLocaleString("zh-CN"),
        color: "text-purple-400" });
      i++; continue;
    }

    if (e.event_type === "SessionEnd" || e.event_type === "Stop") {
      bubbles.push({ kind: "banner", icon: "■", text: "会话结束",
        sub: new Date(e.created_at).toLocaleString("zh-CN"),
        color: "text-gray-400" });
      i++; continue;
    }

    if (e.event_type === "Notification") {
      const msg = String((e.extra as Record<string, unknown>)?.message ||
                         (e.extra as Record<string, unknown>)?.notification || "");
      bubbles.push({ kind: "notify", message: msg });
      i++; continue;
    }

    if (e.event_type === "SubagentStart") {
      bubbles.push({ kind: "subagent", text: "子任务开始" });
      i++; continue;
    }
    if (e.event_type === "SubagentStop") {
      bubbles.push({ kind: "subagent", text: "子任务完成" });
      i++; continue;
    }

    if (e.event_type === "PreToolUse") {
      // 向前查找对应的 PostToolUse
      const next = events[i + 1];
      const detail = toolSummary(e.tool_name, e.tool_input);
      if (next && next.event_type === "PostToolUse" && next.tool_name === e.tool_name) {
        const t0 = new Date(e.created_at).getTime();
        const t1 = new Date(next.created_at).getTime();
        bubbles.push({
          kind: "tool",
          name: e.tool_name || "Unknown",
          detail,
          done: true,
          durationMs: t1 - t0,
          success: next.event_type === "PostToolUse",
        });
        i += 2; continue;
      } else {
        // 没有对应 Post（执行中 or PostToolUseFailure）
        bubbles.push({ kind: "tool", name: e.tool_name || "Unknown", detail, done: false });
        i++; continue;
      }
    }

    // PostToolUse 没有对应 Pre（已被上面消耗），跳过
    i++;
  }
  return bubbles;
}

// ── 气泡组件 ──────────────────────────────────────────────────

function Banner({ b }: { b: Extract<Bubble, { kind: "banner" }> }) {
  return (
    <div className="flex items-center gap-2 py-3 px-4">
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      <span className={cn("text-[11px] font-mono flex items-center gap-1.5", b.color)}>
        <span>{b.icon}</span>
        <span>{b.text}</span>
        {b.sub && <span className="opacity-60 text-[10px]">{b.sub}</span>}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

function ToolCard({ b }: { b: Extract<Bubble, { kind: "tool" }> }) {
  return (
    <div className="mx-4 my-1.5 rounded-lg overflow-hidden"
         style={{ border: "1px solid var(--border)", background: "var(--background-secondary)" }}>
      <div className="flex items-center gap-2 px-3 py-1.5"
           style={{ borderBottom: b.done ? "1px solid var(--border)" : undefined }}>
        <span className="text-[11px] font-semibold text-[#79c0ff]">{b.name}</span>
        {!b.done && (
          <span className="text-[10px] animate-pulse" style={{ color: "var(--text-tertiary)" }}>
            执行中...
          </span>
        )}
        {b.done && (
          <span className={cn("text-[10px] ml-auto", b.success ? "text-green-400" : "text-red-400")}>
            {b.success ? "✓" : "✗"}
            {b.durationMs !== undefined && (
              <span className="ml-1 opacity-70">{(b.durationMs / 1000).toFixed(1)}s</span>
            )}
          </span>
        )}
      </div>
      {b.detail && (
        <div className="px-3 py-1.5 text-[11px] font-mono truncate"
             style={{ color: "var(--text-secondary)" }} title={b.detail}>
          {b.detail}
        </div>
      )}
    </div>
  );
}

function NotifyBar({ b }: { b: Extract<Bubble, { kind: "notify" }> }) {
  return (
    <div className="mx-4 my-1.5 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
         style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", color: "#e3b341" }}>
      <span>◆</span>
      <span className="flex-1 truncate">{b.message || "通知"}</span>
    </div>
  );
}

function SubagentRow({ b }: { b: Extract<Bubble, { kind: "subagent" }> }) {
  return (
    <div className="ml-8 mr-4 my-1 flex items-center gap-2 text-[10px]"
         style={{ color: "var(--text-tertiary)" }}>
      <span className="w-3 h-px" style={{ background: "var(--border)" }} />
      <span>{b.text}</span>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────

interface Props {
  events: ClaudeEvent[];
  loading: boolean;
}

export function ConvBubbles({ events, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[12px]"
           style={{ color: "var(--text-tertiary)" }}>
        加载中...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3"
           style={{ color: "var(--text-tertiary)" }}>
        <span className="text-3xl">💬</span>
        <p className="text-[12px]">选择左侧会话查看对话记录</p>
      </div>
    );
  }

  const bubbles = eventsToBubbles(events);

  return (
    <div className="py-2">
      {bubbles.map((b, idx) => {
        if (b.kind === "banner")  return <Banner  key={idx} b={b} />;
        if (b.kind === "tool")    return <ToolCard key={idx} b={b} />;
        if (b.kind === "notify")  return <NotifyBar key={idx} b={b} />;
        if (b.kind === "subagent") return <SubagentRow key={idx} b={b} />;
        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

**Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 3: Commit**

```bash
git add frontend/src/components/ConvBubbles.tsx
git commit -m "feat: ConvBubbles component (events to chat bubbles)"
```

---

## Task 7: 前端 — ConvEditPanel 编辑面板

**Files:**
- Create: `frontend/src/components/ConvEditPanel.tsx`

**Step 1: 创建组件**

```typescript
// frontend/src/components/ConvEditPanel.tsx
import { useEffect, useState } from "react";
import { api, type ClaudeSession, type ConversationNote, type Project } from "../lib/api";

interface Props {
  session: ClaudeSession;
  projects: Project[];
  onSaved: (updated: ConversationNote) => void;
}

export function ConvEditPanel({ session, projects, onSaved }: Props) {
  const [alias, setAlias]   = useState(session.note?.alias  ?? "");
  const [notes, setNotes]   = useState(session.note?.notes  ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags]     = useState<string[]>(session.note?.tags ?? []);
  const [linkedTaskId, setLinkedTaskId] = useState<number | null>(session.note?.linked_task_id ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // 当切换到新会话时重置表单
  useEffect(() => {
    setAlias(session.note?.alias  ?? "");
    setNotes(session.note?.notes  ?? "");
    setTags(session.note?.tags    ?? []);
    setLinkedTaskId(session.note?.linked_task_id ?? null);
    setTagInput("");
    setSaved(false);
  }, [session.id]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.sessions.upsertNote(session.session_id, {
        alias: alias || null,
        notes: notes || null,
        tags,
        linked_task_id: linkedTaskId,
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // 收集所有任务（跨所有项目）供关联选择
  // 简化：直接用 projects 传入的数据（无 tasks），暂时用 task ID 输入框
  return (
    <div className="px-4 py-3 space-y-3 text-[12px]"
         style={{ borderTop: "1px solid var(--border)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest"
         style={{ color: "var(--text-tertiary)" }}>会话信息</p>

      {/* 别名 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>别名</label>
        <input
          value={alias}
          onChange={e => setAlias(e.target.value)}
          placeholder={session.cwd.split("/").slice(-1)[0] || "会话别名"}
          className="w-full rounded px-2.5 py-1.5 text-[11px] outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 标签 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>标签</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {tags.map(t => (
            <span key={t}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                  onClick={() => removeTag(t)}>
              {t} <span className="opacity-60">×</span>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTag()}
            placeholder="输入标签后按 Enter"
            className="flex-1 rounded px-2.5 py-1.5 text-[11px] outline-none"
            style={{
              background: "var(--background-tertiary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <button onClick={addTag}
                  className="px-2 py-1 rounded text-[11px]"
                  style={{ background: "var(--background-tertiary)", color: "var(--text-secondary)" }}>
            +
          </button>
        </div>
      </div>

      {/* 关联任务 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>关联任务 ID</label>
        <input
          type="number"
          value={linkedTaskId ?? ""}
          onChange={e => setLinkedTaskId(e.target.value ? Number(e.target.value) : null)}
          placeholder="输入 Task ID（可选）"
          className="w-full rounded px-2.5 py-1.5 text-[11px] outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 备注 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>备注</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="自由文本备注..."
          rows={3}
          className="w-full rounded px-2.5 py-1.5 text-[11px] outline-none resize-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-1.5 rounded text-[12px] font-medium transition-colors disabled:opacity-50"
        style={{
          background: saved ? "rgba(34,197,94,0.2)" : "var(--accent)",
          color: saved ? "#22c55e" : "white",
        }}
      >
        {saving ? "保存中..." : saved ? "✓ 已保存" : "保存"}
      </button>
    </div>
  );
}
```

**Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 3: Commit**

```bash
git add frontend/src/components/ConvEditPanel.tsx
git commit -m "feat: ConvEditPanel component (alias/tags/notes/linked_task)"
```

---

## Task 8: 前端 — ConversationHistory 主页面

**Files:**
- Create: `frontend/src/pages/ConversationHistory.tsx`

**Step 1: 创建页面**

```typescript
// frontend/src/pages/ConversationHistory.tsx
import { useEffect, useState } from "react";
import { api, type ClaudeSession, type ClaudeEvent, type ConversationNote, type Project } from "../lib/api";
import { ConvSessionList } from "../components/ConvSessionList";
import { ConvBubbles } from "../components/ConvBubbles";
import { ConvEditPanel } from "../components/ConvEditPanel";

interface Props {
  projects: Project[];
}

export default function ConversationHistory({ projects }: Props) {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [events, setEvents] = useState<ClaudeEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // 加载会话列表（5s 轮询刷新状态）
  const loadSessions = () => {
    api.sessions.list()
      .then(s => { setSessions(s); setSessionsLoading(false); })
      .catch(() => setSessionsLoading(false));
  };

  useEffect(() => {
    loadSessions();
    const id = setInterval(loadSessions, 5000);
    return () => clearInterval(id);
  }, []);

  // 选中会话时加载事件
  const handleSelect = (s: ClaudeSession) => {
    setSelectedSession(s);
    setEventsLoading(true);
    api.sessions.events(s.session_id)
      .then(evs => { setEvents(evs); setEventsLoading(false); })
      .catch(() => setEventsLoading(false));
  };

  // note 保存后更新会话列表中的 note 字段
  const handleNoteSaved = (updated: ConversationNote) => {
    if (!selectedSession) return;
    setSessions(prev => prev.map(s =>
      s.id === selectedSession.id ? { ...s, note: updated } : s
    ));
    setSelectedSession(prev => prev ? { ...prev, note: updated } : prev);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── 左栏：会话列表 ── */}
      <div className="w-[260px] shrink-0 flex flex-col"
           style={{ borderRight: "1px solid var(--border)" }}>
        {/* 标题 */}
        <div className="px-3 py-2.5 shrink-0"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[11px] font-semibold"
                style={{ color: "var(--text-primary)" }}>对话历史</span>
        </div>
        <ConvSessionList
          sessions={sessions}
          loading={sessionsLoading}
          selectedId={selectedSession?.id ?? null}
          onSelect={handleSelect}
        />
      </div>

      {/* ── 右栏：气泡 + 编辑面板 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 头部：会话信息 */}
        {selectedSession && (
          <div className="px-4 py-2 shrink-0 flex items-center gap-3"
               style={{ borderBottom: "1px solid var(--border)", background: "var(--background-secondary)" }}>
            <span className="text-[12px] font-semibold"
                  style={{ color: "var(--text-primary)" }}>
              {selectedSession.note?.alias || selectedSession.cwd.split("/").slice(-1)[0] || selectedSession.session_id.slice(0, 8)}
            </span>
            <span className="text-[10px] font-mono"
                  style={{ color: "var(--text-tertiary)" }}>
              {selectedSession.session_id.slice(0, 16)}
            </span>
            <span className="text-[10px] ml-auto"
                  style={{ color: "var(--text-tertiary)" }}>
              {selectedSession.event_count} 条事件
            </span>
          </div>
        )}

        {/* 气泡区（可滚动） */}
        <div className="flex-1 overflow-y-auto">
          <ConvBubbles events={events} loading={eventsLoading} />
        </div>

        {/* 编辑面板（固定底部） */}
        {selectedSession && (
          <div className="shrink-0" style={{ maxHeight: "280px", overflowY: "auto" }}>
            <ConvEditPanel
              session={selectedSession}
              projects={projects}
              onSaved={handleNoteSaved}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 3: Commit**

```bash
git add frontend/src/pages/ConversationHistory.tsx
git commit -m "feat: ConversationHistory page"
```

---

## Task 9: 前端 — 接入 App.tsx 路由

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: 导入页面**

在 `App.tsx` 的 import 区域，加入：
```typescript
import ConversationHistory from "./pages/ConversationHistory";
```

**Step 2: 扩展 Page 类型**

找到：
```typescript
type Page = "dashboard" | "project" | "task" | "sessions" | "settings" | "tasks";
```
改为：
```typescript
type Page = "dashboard" | "project" | "task" | "sessions" | "settings" | "tasks" | "conversations";
```

**Step 3: 在 `renderContent()` 中加入路由分支**

在 `if (page === "tasks")` 分支之后、`return <Dashboard .../>` 之前插入：

```typescript
if (page === "conversations") {
  return <ConversationHistory projects={projects} />;
}
```

**Step 4: 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
期望：无错误

**Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire ConversationHistory into App router"
```

---

## Task 10: 集成验证

**Step 1: 启动前后端**

```bash
bash start.sh
```

**Step 2: 手动验证流程**

1. 打开 `http://localhost:7070`，登录
2. 侧边栏可见「对话历史」导航项
3. 点击「对话历史」，左侧显示会话列表（若无数据：先运行任意 `claude -p "hello"` 产生会话）
4. 点击一条会话，右侧展示气泡视图
5. 在编辑面板输入别名「测试别名」+ 标签「bug」，点击保存
6. 刷新页面，别名和标签仍然显示
7. `GET http://localhost:8765/api/sessions/{session_id}/note` 确认数据已持久化

**Step 3: 运行后端测试**

```bash
cd backend && pytest --tb=short -q
```
期望：全部通过，含新增的 4 条 conversation_note 测试

**Step 4: 最终 Commit（如有遗漏文件）**

```bash
git add -A
git status  # 确认无意外文件
git commit -m "feat: 对话历史功能完整实现"
```
```

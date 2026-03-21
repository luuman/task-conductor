# backend/app/mcp_server.py
"""TaskConductor MCP Server — 让 Claude Code 在任意会话中调用 TC 的能力"""
import json
from typing import Any

from mcp.server.fastmcp import FastMCP
from sqlalchemy.orm import Session

from .database import engine
from .models import (
    Project, Task, StageArtifact, ClaudeSession, ClaudeEvent,
    ProjectKnowledge, InterviewMessage,
)
from .pipeline.engine import PipelineEngine, StageTransitionError, get_task_stages
from .claude.pool import ClaudePool

mcp = FastMCP(
    "TaskConductor",
    instructions=(
        "TaskConductor 是一个 AI 驱动的任务流水线编排系统。"
        "你可以通过这些工具查看项目/任务状态、推进流水线、管理知识库、"
        "查看 Claude 会话记录、浏览项目文件和 Git 状态等。"
    ),
)

pipeline_engine = PipelineEngine()
claude_pool = ClaudePool()


# ── 辅助函数 ────────────────────────────────────────────────────

def _db():
    return Session(engine)


def _serialize(obj) -> dict[str, Any]:
    """将 ORM 对象序列化为 dict（简单实现）"""
    d = {}
    for c in obj.__table__.columns:
        v = getattr(obj, c.name)
        if hasattr(v, "isoformat"):
            v = v.isoformat()
        d[c.name] = v
    return d


def _json_text(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


# ══════════════════════════════════════════════════════════════════
#  项目 & 任务（读）
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def list_projects() -> str:
    """列出所有项目，返回项目 ID、名称、仓库路径、任务数量"""
    with _db() as db:
        projects = db.query(Project).order_by(Project.sort_order, Project.id).all()
        result = []
        for p in projects:
            d = _serialize(p)
            d["task_count"] = db.query(Task).filter(Task.project_id == p.id).count()
            result.append(d)
        return _json_text(result)


@mcp.tool()
def get_project(project_id: int) -> str:
    """获取项目详情，包含项目配置和任务列表概览"""
    with _db() as db:
        p = db.get(Project, project_id)
        if not p:
            return "项目不存在"
        d = _serialize(p)
        tasks = db.query(Task).filter(Task.project_id == project_id).all()
        d["tasks"] = [{"id": t.id, "title": t.title, "stage": t.stage, "status": t.status} for t in tasks]
        return _json_text(d)


@mcp.tool()
def list_tasks(project_id: int) -> str:
    """列出项目下所有任务，包含 ID、标题、当前阶段、状态"""
    with _db() as db:
        tasks = db.query(Task).filter(Task.project_id == project_id).order_by(Task.id).all()
        return _json_text([_serialize(t) for t in tasks])


@mcp.tool()
def get_task(task_id: int) -> str:
    """获取任务详情，包含所有字段和阶段产物"""
    with _db() as db:
        t = db.get(Task, task_id)
        if not t:
            return "任务不存在"
        d = _serialize(t)
        artifacts = db.query(StageArtifact).filter(StageArtifact.task_id == task_id).all()
        d["artifacts"] = [_serialize(a) for a in artifacts]
        return _json_text(d)


@mcp.tool()
def list_sessions(limit: int = 50) -> str:
    """列出最近的 Claude Code 会话，按最后活跃时间倒序"""
    with _db() as db:
        sessions = (
            db.query(ClaudeSession)
            .order_by(ClaudeSession.last_seen_at.desc())
            .limit(limit)
            .all()
        )
        result = []
        for s in sessions:
            d = _serialize(s)
            d["event_count"] = db.query(ClaudeEvent).filter(ClaudeEvent.claude_session_id == s.id).count()
            result.append(d)
        return _json_text(result)


@mcp.tool()
def get_session_events(session_id: str, limit: int = 200) -> str:
    """获取指定 Claude 会话的工具调用事件"""
    with _db() as db:
        sess = db.query(ClaudeSession).filter(ClaudeSession.session_id == session_id).first()
        if not sess:
            return "会话不存在"
        events = (
            db.query(ClaudeEvent)
            .filter(ClaudeEvent.claude_session_id == sess.id)
            .order_by(ClaudeEvent.created_at.desc())
            .limit(limit)
            .all()
        )
        return _json_text([_serialize(e) for e in events])


@mcp.tool()
def get_session_transcript(session_id: str) -> str:
    """获取 Claude 会话的完整 JSONL 转录文件内容（从本地文件读取）"""
    import os
    with _db() as db:
        sess = db.query(ClaudeSession).filter(ClaudeSession.session_id == session_id).first()
        if not sess:
            return "会话不存在"
        cwd = sess.cwd or ""
        project_path = cwd.replace("/", "-")
        home = os.path.expanduser("~")
        path = os.path.join(home, ".claude", "projects", project_path, f"{session_id}.jsonl")
        if not os.path.exists(path):
            return f"转录文件不存在: {path}"
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            # 限制大小，避免返回过大
            if len(content) > 100_000:
                return content[:100_000] + "\n... (截断，共 {} 字节)".format(len(content))
            return content
        except Exception as e:
            return f"读取失败: {e}"


# ══════════════════════════════════════════════════════════════════
#  项目 & 任务（写）
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def create_project(name: str, repo_url: str = "") -> str:
    """创建新项目。name: 项目名称，repo_url: 可选的本地仓库路径"""
    import os
    with _db() as db:
        p = Project(name=name, repo_url=repo_url)
        db.add(p)
        db.commit()
        db.refresh(p)
        if repo_url:
            os.makedirs(repo_url, exist_ok=True)
        return _json_text({"id": p.id, "name": p.name, "repo_url": p.repo_url})


@mcp.tool()
def create_task(project_id: int, title: str, description: str = "") -> str:
    """在项目下创建新任务"""
    with _db() as db:
        p = db.get(Project, project_id)
        if not p:
            return "项目不存在"
        t = Task(project_id=project_id, title=title, description=description)
        db.add(t)
        db.commit()
        db.refresh(t)
        return _json_text(_serialize(t))


@mcp.tool()
def approve_task(task_id: int, action: str, reason: str = "") -> str:
    """审批任务。action: 'approve' 或 'reject'，reason: 可选的原因说明"""
    with _db() as db:
        t = db.get(Task, task_id)
        if not t:
            return "任务不存在"
        if action == "approve":
            t.status = "approved"
        elif action == "reject":
            t.status = "rejected"
        else:
            return "action 必须是 'approve' 或 'reject'"
        db.commit()
        db.refresh(t)
        return _json_text({"id": t.id, "stage": t.stage, "status": t.status})


@mcp.tool()
def advance_task(task_id: int) -> str:
    """推进任务到下一阶段（需先审批通过）"""
    with _db() as db:
        t = db.get(Task, task_id)
        if not t:
            return "任务不存在"
        if not pipeline_engine.can_proceed(t.stage, t.status):
            return f"无法推进: stage={t.stage} status={t.status}"
        try:
            task_stages = get_task_stages(t)
            next_stage = pipeline_engine.next_stage(t.stage, stages=task_stages)
        except StageTransitionError as e:
            return str(e)
        t.stage = next_stage
        t.status = "pending"
        db.commit()
        db.refresh(t)
        return _json_text({"id": t.id, "stage": t.stage, "status": t.status})


# ══════════════════════════════════════════════════════════════════
#  流水线
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def run_stage(task_id: int, stage: str = "") -> str:
    """触发指定阶段执行。stage 为空则执行当前阶段。支持: analysis, prd, plan"""
    # 这里只能返回启动提示，实际执行是异步的
    import asyncio
    with _db() as db:
        t = db.get(Task, task_id)
        if not t:
            return "任务不存在"
        target_stage = stage or t.stage
        return _json_text({
            "message": f"请通过 POST /api/pipeline/{task_id}/run/{target_stage} 触发执行",
            "task_id": task_id,
            "current_stage": t.stage,
            "target_stage": target_stage,
            "hint": "MCP 工具为同步调用，流水线执行需要通过 HTTP API 异步触发",
        })


@mcp.tool()
def get_pipeline_status(task_id: int) -> str:
    """获取任务的流水线状态：当前阶段、状态、所有阶段列表"""
    with _db() as db:
        t = db.get(Task, task_id)
        if not t:
            return "任务不存在"
        task_stages = get_task_stages(t)
        current_idx = task_stages.index(t.stage) if t.stage in task_stages else -1
        return _json_text({
            "task_id": t.id,
            "title": t.title,
            "current_stage": t.stage,
            "status": t.status,
            "stages": task_stages,
            "current_index": current_idx,
            "total_stages": len(task_stages),
            "progress_pct": round((current_idx / max(len(task_stages) - 1, 1)) * 100),
        })


# ══════════════════════════════════════════════════════════════════
#  ClaudePool
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def run_claude(task_id: int, prompt: str, cwd: str = "") -> str:
    """启动 headless Claude 子进程执行 prompt（异步，返回启动确认）"""
    if not cwd:
        with _db() as db:
            t = db.get(Task, task_id)
            if t and t.project:
                cwd = t.project.repo_url or ""
            elif t and t.worktree_path:
                cwd = t.worktree_path
    if not cwd:
        return "无法确定工作目录，请指定 cwd 参数"
    return _json_text({
        "message": "Claude 子进程启动请求已记录",
        "task_id": task_id,
        "cwd": cwd,
        "hint": "headless 执行是异步的，结果会通过 WebSocket /ws/task/{task_id} 推送",
    })


@mcp.tool()
def kill_claude(task_id: int) -> str:
    """终止指定任务的 Claude 子进程"""
    result = claude_pool.kill(task_id)
    return f"已发送终止信号: task_id={task_id}" if result else f"未找到活跃进程: task_id={task_id}"


@mcp.tool()
def list_active_claude() -> str:
    """列出所有活跃的 Claude 子进程"""
    processes = claude_pool._processes
    if not processes:
        return "当前无活跃的 Claude 子进程"
    result = []
    for tid, proc in processes.items():
        result.append({"task_id": tid, "pid": proc.pid, "returncode": proc.returncode})
    return _json_text(result)


# ══════════════════════════════════════════════════════════════════
#  知识库
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def list_knowledge(project_id: int) -> str:
    """查看项目积累的经验知识（错误教训、最佳实践等）"""
    with _db() as db:
        items = (
            db.query(ProjectKnowledge)
            .filter(ProjectKnowledge.project_id == project_id)
            .order_by(ProjectKnowledge.id.desc())
            .all()
        )
        return _json_text([_serialize(k) for k in items])


@mcp.tool()
def delete_knowledge(knowledge_id: int) -> str:
    """删除过时的知识条目"""
    with _db() as db:
        k = db.get(ProjectKnowledge, knowledge_id)
        if not k:
            return "知识条目不存在"
        db.delete(k)
        db.commit()
        return f"已删除知识条目 #{knowledge_id}"


# ══════════════════════════════════════════════════════════════════
#  指标
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def get_metrics() -> str:
    """获取 TaskConductor 运行指标：KPI、Claude 调用统计"""
    from .claude.metrics_store import metrics_store
    stats = metrics_store.summary()
    with _db() as db:
        total_tasks = db.query(Task).count()
        done_tasks = db.query(Task).filter(Task.stage == "done").count()
        total_projects = db.query(Project).count()
        active_sessions = db.query(ClaudeSession).filter(ClaudeSession.status == "active").count()
    return _json_text({
        "projects": total_projects,
        "tasks_total": total_tasks,
        "tasks_done": done_tasks,
        "active_sessions": active_sessions,
        "claude_stats": stats,
    })


@mcp.tool()
def get_claude_usage() -> str:
    """获取 Claude 调用的 token 消耗和成本统计"""
    from .claude.metrics_store import metrics_store
    return _json_text(metrics_store.summary())


# ══════════════════════════════════════════════════════════════════
#  Git
# ══════════════════════════════════════════════════════════════════

def _get_project_path(project_id: int) -> str | None:
    with _db() as db:
        p = db.get(Project, project_id)
        return p.repo_url if p else None


@mcp.tool()
def git_status(project_id: int) -> str:
    """获取项目仓库的 Git 状态（modified/staged/untracked 文件）"""
    import subprocess
    path = _get_project_path(project_id)
    if not path:
        return "项目不存在或无仓库路径"
    try:
        r = subprocess.run(["git", "status", "--porcelain"], cwd=path, capture_output=True, text=True, timeout=10)
        return r.stdout or "工作目录干净"
    except Exception as e:
        return f"执行失败: {e}"


@mcp.tool()
def git_log(project_id: int, count: int = 20) -> str:
    """获取项目最近的 Git 提交历史"""
    import subprocess
    path = _get_project_path(project_id)
    if not path:
        return "项目不存在或无仓库路径"
    try:
        r = subprocess.run(
            ["git", "log", f"-{count}", "--oneline", "--decorate"],
            cwd=path, capture_output=True, text=True, timeout=10,
        )
        return r.stdout or "无提交记录"
    except Exception as e:
        return f"执行失败: {e}"


@mcp.tool()
def git_diff(project_id: int, staged: bool = False) -> str:
    """获取项目的 Git diff。staged=True 查看暂存区差异"""
    import subprocess
    path = _get_project_path(project_id)
    if not path:
        return "项目不存在或无仓库路径"
    cmd = ["git", "diff"]
    if staged:
        cmd.append("--staged")
    try:
        r = subprocess.run(cmd, cwd=path, capture_output=True, text=True, timeout=10)
        output = r.stdout or "无差异"
        if len(output) > 50_000:
            return output[:50_000] + "\n... (截断)"
        return output
    except Exception as e:
        return f"执行失败: {e}"


# ══════════════════════════════════════════════════════════════════
#  文件
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def list_files(project_id: int, path: str = "") -> str:
    """浏览项目文件目录。path 为相对路径，空则为项目根目录"""
    import os
    base = _get_project_path(project_id)
    if not base:
        return "项目不存在或无仓库路径"
    target = os.path.join(base, path) if path else base
    if not os.path.isdir(target):
        return f"目录不存在: {target}"
    try:
        entries = []
        for name in sorted(os.listdir(target)):
            full = os.path.join(target, name)
            is_dir = os.path.isdir(full)
            size = os.path.getsize(full) if not is_dir else 0
            entries.append({"name": name, "type": "dir" if is_dir else "file", "size": size})
        return _json_text(entries)
    except Exception as e:
        return f"读取失败: {e}"


@mcp.tool()
def read_file(project_id: int, path: str) -> str:
    """读取项目中的文件内容。path 为相对路径"""
    import os
    base = _get_project_path(project_id)
    if not base:
        return "项目不存在或无仓库路径"
    full = os.path.join(base, path)
    # 安全检查：不允许路径遍历
    if not os.path.abspath(full).startswith(os.path.abspath(base)):
        return "路径不合法"
    if not os.path.isfile(full):
        return f"文件不存在: {path}"
    try:
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(200_000)  # 限制 200KB
        return content
    except Exception as e:
        return f"读取失败: {e}"


@mcp.tool()
def search_files(project_id: int, query: str, glob_pattern: str = "**/*") -> str:
    """在项目中搜索文件内容。query: 搜索关键词，glob_pattern: 文件匹配模式"""
    import subprocess
    path = _get_project_path(project_id)
    if not path:
        return "项目不存在或无仓库路径"
    try:
        r = subprocess.run(
            ["grep", "-rl", "--include", glob_pattern, query, "."],
            cwd=path, capture_output=True, text=True, timeout=15,
        )
        files = r.stdout.strip().split("\n") if r.stdout.strip() else []
        return _json_text({"query": query, "matches": files[:50]})
    except Exception as e:
        return f"搜索失败: {e}"


# ══════════════════════════════════════════════════════════════════
#  访谈
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def interview_messages(task_id: int) -> str:
    """查看任务的需求访谈记录"""
    with _db() as db:
        msgs = (
            db.query(InterviewMessage)
            .filter(InterviewMessage.task_id == task_id)
            .order_by(InterviewMessage.id)
            .all()
        )
        if not msgs:
            return "无访谈记录"
        return _json_text([_serialize(m) for m in msgs])


# ══════════════════════════════════════════════════════════════════
#  tmux
# ══════════════════════════════════════════════════════════════════

@mcp.tool()
def tmux_list() -> str:
    """列出所有 tmux 会话"""
    import subprocess
    try:
        r = subprocess.run(
            ["tmux", "list-sessions", "-F", "#{session_name} #{session_windows} #{session_created}"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode != 0:
            return "无 tmux 会话或 tmux 未运行"
        return r.stdout
    except Exception as e:
        return f"执行失败: {e}"


@mcp.tool()
def tmux_send(session_name: str, command: str) -> str:
    """向指定 tmux 会话发送命令"""
    import subprocess
    try:
        r = subprocess.run(
            ["tmux", "send-keys", "-t", session_name, command, "Enter"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode != 0:
            return f"发送失败: {r.stderr}"
        return f"已发送到 tmux 会话 '{session_name}': {command}"
    except Exception as e:
        return f"执行失败: {e}"

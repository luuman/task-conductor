import platform
import time
import psutil
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task, ClaudeSession
from ..claude.pool import ClaudePool
from ..claude.metrics_store import metrics_store

router = APIRouter(prefix="/api/metrics", tags=["指标"])


def get_db():
    with Session(engine) as session:
        yield session


# ── 任务 / KPI / 周报 ─────────────────────────────────────────────

@router.get("", summary="获取运行指标")
def get_metrics(db: Session = Depends(get_db)):
    """KPI + Claude 调用统计 + 周报"""
    tasks = db.query(Task).all()

    by_status: dict[str, int] = {}
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1

    done_tasks = [t for t in tasks if t.status == "done" and t.updated_at and t.created_at]
    avg_task_duration_s = None
    if done_tasks:
        durations = [(t.updated_at - t.created_at).total_seconds() for t in done_tasks]
        avg_task_duration_s = round(sum(durations) / len(durations), 1)

    approved = by_status.get("approved", 0)
    rejected = by_status.get("rejected", 0)
    approval_rate = round(approved / (approved + rejected) * 100) if (approved + rejected) > 0 else None

    uptime        = metrics_store.uptime_pct()
    ai_rating     = metrics_store.ai_rating(approval_rate)
    interactions  = metrics_store.total_interactions()
    avg_resp      = metrics_store.avg_response_time_s()
    availability_pct = uptime

    return {
        "tasks": {
            "total":           len(tasks),
            "by_status":       by_status,
            "avg_duration_s":  avg_task_duration_s,
            "approval_rate":   approval_rate,
        },
        "claude": {
            **metrics_store.summary(),
            "active_processes": len(ClaudePool()._processes),
        },
        "kpi": {
            "ai_rating":           ai_rating,
            "interactions":        interactions,
            "avg_response_time_s": avg_resp,
            "uptime_pct":          uptime,
        },
        "gauge": {
            "availability_pct": availability_pct,
        },
        "weekly": metrics_store.weekly_stats(),
    }


# ── 系统资源指标 ─────────────────────────────────────────────────

@router.get("/system", summary="服务器系统指标")
def get_system_metrics():
    """
    实时服务器系统资源，每次调用同时采集 IO 快照以计算速率：

    - cpu: 总使用率 / user / system / iowait / 核心数 / 频率 / 负载 / 上下文切换速率
    - memory: 物理内存 total/used/avail/percent
    - swap: 交换分区 total/used/percent
    - disk_space: 根分区容量
    - disk_io: 读写速率 (MB/s) / IOPS / %util
    - network: 收发速率 (KB/s) / 累计 / TCP 状态
    - uptime_hours / hostname / platform / process_count
    """

    # ── 采集基础指标 ─────────────────────────────────────────────
    cpu_pct = psutil.cpu_percent(interval=0.1)
    try:
        cpu_per_core: list[float] = psutil.cpu_percent(percpu=True)  # type: ignore[assignment]
    except Exception:
        cpu_per_core = []

    mem  = psutil.virtual_memory()
    swap = psutil.swap_memory()

    try:
        disk_space = psutil.disk_usage("/")
        disk_pct   = disk_space.percent
        disk_total = round(disk_space.total / (1024 ** 3), 1)
        disk_used  = round(disk_space.used  / (1024 ** 3), 1)
        disk_free  = round(disk_space.free  / (1024 ** 3), 1)
    except Exception:
        disk_pct = disk_total = disk_used = disk_free = None

    try:
        cpu_freq = psutil.cpu_freq()
        freq_mhz     = round(cpu_freq.current) if cpu_freq else None
        freq_max_mhz = round(cpu_freq.max)     if cpu_freq and cpu_freq.max else None
    except Exception:
        freq_mhz = freq_max_mhz = None

    try:
        load = psutil.getloadavg()
        load_avg = {"1m": round(load[0], 2), "5m": round(load[1], 2), "15m": round(load[2], 2)}
    except Exception:
        load_avg = None

    uptime_secs = time.time() - psutil.boot_time()

    try:
        proc_count = len(psutil.pids())
    except Exception:
        proc_count = None

    # ── TCP 连接状态 ──────────────────────────────────────────────
    tcp_states: dict[str, int] = {}
    try:
        for conn in psutil.net_connections(kind="tcp"):
            s = conn.status or "NONE"
            tcp_states[s] = tcp_states.get(s, 0) + 1
    except Exception:
        pass

    # ── IO 速率（基于快照 delta）──────────────────────────────────
    prev_snap = metrics_store.take_io_snapshot()
    curr_disk  = None
    curr_net   = None
    curr_stats = None
    curr_times = None
    try:
        curr_disk  = psutil.disk_io_counters()
        curr_net   = psutil.net_io_counters()
        curr_stats = psutil.cpu_stats()
        curr_times = psutil.cpu_times()
    except Exception:
        pass

    # 速率（只有在有 prev 快照时才有效）
    disk_read_bps  = disk_write_bps  = None
    disk_read_iops = disk_write_iops = None
    disk_util_pct  = None
    net_in_kbps    = net_out_kbps    = None
    ctx_switches_per_sec = None
    cpu_user_pct   = cpu_sys_pct = cpu_iowait_pct = None

    if prev_snap and curr_disk and curr_net and curr_stats and curr_times:
        dt = time.time() - prev_snap.ts
        if dt > 0.1:
            # Disk I/O rates
            disk_read_bps  = max(0, (curr_disk.read_bytes  - prev_snap.disk_read_bytes)  / dt)
            disk_write_bps = max(0, (curr_disk.write_bytes - prev_snap.disk_write_bytes) / dt)
            disk_read_iops  = max(0, (curr_disk.read_count  - prev_snap.disk_read_count)  / dt)
            disk_write_iops = max(0, (curr_disk.write_count - prev_snap.disk_write_count) / dt)
            if hasattr(curr_disk, "busy_time"):
                busy_ms_delta = max(0, curr_disk.busy_time - prev_snap.disk_busy_ms)
                disk_util_pct = min(100.0, round(busy_ms_delta / (dt * 1000) * 100, 1))

            # Network rates
            net_in_kbps  = max(0, (curr_net.bytes_recv - prev_snap.net_bytes_recv) / dt / 1024)
            net_out_kbps = max(0, (curr_net.bytes_sent - prev_snap.net_bytes_sent) / dt / 1024)

            # Context switches per second
            ctx_diff = curr_stats.ctx_switches - prev_snap.cpu_ctx_switches
            ctx_switches_per_sec = max(0, round(ctx_diff / dt))

            # CPU breakdown (user / system / iowait)
            iowait_prev = prev_snap.cpu_iowait
            iowait_curr = getattr(curr_times, "iowait", 0.0)
            total_prev = prev_snap.cpu_user + prev_snap.cpu_system + prev_snap.cpu_idle + iowait_prev
            total_curr = curr_times.user + curr_times.system + curr_times.idle + iowait_curr
            total_diff = total_curr - total_prev
            if total_diff > 0:
                cpu_user_pct   = round((curr_times.user   - prev_snap.cpu_user)   / total_diff * 100, 1)
                cpu_sys_pct    = round((curr_times.system - prev_snap.cpu_system) / total_diff * 100, 1)
                cpu_iowait_pct = round((iowait_curr - iowait_prev)                / total_diff * 100, 1)

    def _fmt_bytes(b: float | None) -> float | None:
        return round(b / (1024 ** 2), 2) if b is not None else None

    def _fmt_kbps(k: float | None) -> float | None:
        return round(k, 1) if k is not None else None

    # 网络累计（MB / GB）
    net_sent_mb = net_recv_mb = None
    if curr_net:
        net_sent_mb = round(curr_net.bytes_sent / (1024 ** 2), 1)
        net_recv_mb = round(curr_net.bytes_recv / (1024 ** 2), 1)

    # 网络重传近似（errout / errin 累计）
    net_errout = net_errin = None
    if curr_net:
        net_errout = curr_net.errout
        net_errin  = curr_net.errin

    # ── 传感器（温度 / 风扇）──────────────────────────────────────────
    sensor_temps: list[dict] = []
    sensor_fans:  list[dict] = []
    try:
        for _sname, _entries in psutil.sensors_temperatures().items():
            for _e in _entries:
                sensor_temps.append({
                    "sensor":   _sname,
                    "label":    _e.label or _sname,
                    "current":  round(_e.current, 1),
                    "high":     round(_e.high,     1) if _e.high     else None,
                    "critical": round(_e.critical, 1) if _e.critical else None,
                })
    except Exception:
        pass
    try:
        for _sname, _entries in psutil.sensors_fans().items():
            for _e in _entries:
                sensor_fans.append({
                    "sensor": _sname,
                    "label":  _e.label or _sname,
                    "rpm":    _e.current,
                })
    except Exception:
        pass

    # ── 网络接口 / 本机 IP ────────────────────────────────────────────
    import socket as _socket
    _net_ifaces: list[dict] = []
    try:
        for _iname, _addrs in psutil.net_if_addrs().items():
            for _addr in _addrs:
                if _addr.family == _socket.AF_INET and not _addr.address.startswith("127."):
                    _net_ifaces.append({"name": _iname, "ip": _addr.address})
                    break
    except Exception:
        pass

    # ── 磁盘设备名 ────────────────────────────────────────────────────
    _disk_device: str | None = None
    try:
        for _part in psutil.disk_partitions():
            if _part.mountpoint == "/":
                _disk_device = _part.device
                break
    except Exception:
        pass

    return {
        "cpu": {
            "percent":           cpu_pct,
            "user_pct":          cpu_user_pct,
            "system_pct":        cpu_sys_pct,
            "iowait_pct":        cpu_iowait_pct,
            "count_logical":     psutil.cpu_count(logical=True),
            "count_physical":    psutil.cpu_count(logical=False),
            "freq_mhz":          freq_mhz,
            "freq_max_mhz":      freq_max_mhz,
            "ctx_switches_per_sec": ctx_switches_per_sec,
            "load_avg":          load_avg,
            "per_core":          [round(p, 1) for p in cpu_per_core],
        },
        "memory": {
            "total_gb":   round(mem.total              / (1024 ** 3), 2),
            "used_gb":    round(mem.used               / (1024 ** 3), 2),
            "avail_gb":   round(mem.available          / (1024 ** 3), 2),
            "free_gb":    round(mem.free               / (1024 ** 3), 2),
            "buffers_gb": round(getattr(mem, "buffers", 0) / (1024 ** 3), 2),
            "cached_gb":  round(getattr(mem, "cached",  0) / (1024 ** 3), 2),
            "percent":    mem.percent,
        },
        "swap": {
            "total_gb": round(swap.total / (1024 ** 3), 2),
            "used_gb":  round(swap.used  / (1024 ** 3), 2),
            "percent":  swap.percent,
        },
        "disk_space": {
            "total_gb": disk_total,
            "used_gb":  disk_used,
            "free_gb":  disk_free,
            "percent":  disk_pct,
        },
        "disk_io": {
            "read_mbps":   _fmt_bytes(disk_read_bps),
            "write_mbps":  _fmt_bytes(disk_write_bps),
            "read_iops":   round(disk_read_iops)  if disk_read_iops  is not None else None,
            "write_iops":  round(disk_write_iops) if disk_write_iops is not None else None,
            "util_pct":    disk_util_pct,
        },
        "network": {
            "in_kbps":      _fmt_kbps(net_in_kbps),
            "out_kbps":     _fmt_kbps(net_out_kbps),
            "sent_mb":      net_sent_mb,
            "recv_mb":      net_recv_mb,
            "tcp_states":   tcp_states,
            "err_out":      net_errout,
            "err_in":       net_errin,
        },
        "uptime_hours":    round(uptime_secs / 3600, 1),
        "hostname":        platform.node(),
        "platform":        platform.system(),
        "process_count":   proc_count,
        "sensors": {
            "temperatures": sensor_temps,
            "fans":         sensor_fans,
        },
        "net_interfaces": _net_ifaces,
        "disk_device":    _disk_device,
    }


# ── 进程列表 ─────────────────────────────────────────────────────

@router.get("/processes", summary="Top 进程资源占用")
def get_top_processes():
    """Top 8 进程（按 CPU% 和 内存 各一份）"""
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
        try:
            info = p.info
            mem = info["memory_info"]
            procs.append({
                "pid":     info["pid"],
                "name":    (info["name"] or "?")[:20],
                "cpu_pct": round(info["cpu_percent"] or 0, 1),
                "mem_mb":  round((mem.rss if mem else 0) / (1024 ** 2), 1),
            })
        except Exception:
            pass
    return {
        "by_cpu": sorted(procs, key=lambda x: -x["cpu_pct"])[:8],
        "by_mem": sorted(procs, key=lambda x: -x["mem_mb"])[:8],
    }


# ── Claude Code 专属指标 ─────────────────────────────────────────

@router.get("/claude-usage", summary="Claude Code Token/成本/工具统计")
def get_claude_usage(db: Session = Depends(get_db)):
    """
    Claude Code 专属指标：

    - tokens: 输入/输出/缓存 Token 总量、估算成本、按模型分布
    - tools: 工具调用次数 Top-N、最近调用列表
    - sessions: 总会话数（DB）/ 活跃会话数（2 分钟内有事件）
    - performance: 同 /api/metrics 中的 claude 字段
    """
    token_data = metrics_store.token_summary()
    tool_data  = metrics_store.tool_stats()
    recent_tools = metrics_store.recent_tools(10)

    # 从 DB 获取会话数
    two_min_ago = __import__("datetime").datetime.utcnow() - __import__("datetime").timedelta(minutes=2)
    total_sessions  = db.query(ClaudeSession).count()
    active_sessions = db.query(ClaudeSession).filter(
        ClaudeSession.last_seen_at >= two_min_ago,
        ClaudeSession.status == "active",
    ).count()

    return {
        "tokens":   token_data,
        "tools":    tool_data,
        "recent_tools": recent_tools,
        "sessions": {
            "total":  total_sessions,
            "active": active_sessions,
        },
        "performance": {
            **metrics_store.summary(),
            "active_processes": len(ClaudePool()._processes),
        },
    }

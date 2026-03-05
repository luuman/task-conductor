import time
import math
import datetime
import threading
from collections import deque
from dataclasses import dataclass, field


# ── Claude API 定价（USD / 百万 Token）─────────────────────────────
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-opus-4-6":   {"input": 15.0, "output": 75.0, "cache_w": 18.75, "cache_r": 1.50},
    "claude-opus-4":     {"input": 15.0, "output": 75.0, "cache_w": 18.75, "cache_r": 1.50},
    "claude-sonnet-4-6": {"input":  3.0, "output": 15.0, "cache_w":  3.75, "cache_r": 0.30},
    "claude-sonnet-4":   {"input":  3.0, "output": 15.0, "cache_w":  3.75, "cache_r": 0.30},
    "claude-haiku-4-5":  {"input":  0.8, "output":  4.0, "cache_w":  1.00, "cache_r": 0.08},
    "claude-haiku-4":    {"input":  0.8, "output":  4.0, "cache_w":  1.00, "cache_r": 0.08},
    "default":           {"input":  3.0, "output": 15.0, "cache_w":  3.75, "cache_r": 0.30},
}

def _pricing(model: str) -> dict[str, float]:
    for key in MODEL_PRICING:
        if key != "default" and key in (model or ""):
            return MODEL_PRICING[key]
    return MODEL_PRICING["default"]

def _calc_cost(inp: int, out: int, cache_w: int, cache_r: int, model: str) -> float:
    p = _pricing(model)
    M = 1_000_000
    return (inp * p["input"] + out * p["output"] +
            cache_w * p["cache_w"] + cache_r * p["cache_r"]) / M


# ── 数据结构 ─────────────────────────────────────────────────────

@dataclass
class CallMetric:
    task_id: int
    started_at: float = field(default_factory=time.time)
    ttft: float | None = None
    total_duration: float | None = None
    char_count: int = 0
    success: bool = True

    @property
    def chars_per_sec(self) -> float | None:
        if self.total_duration and self.total_duration > 0:
            return round(self.char_count / self.total_duration, 1)
        return None


@dataclass
class TokenRecord:
    session_id: str
    model: str
    input_tokens: int
    output_tokens: int
    cache_write: int = 0
    cache_read: int = 0
    ts: float = field(default_factory=time.time)

    @property
    def cost_usd(self) -> float:
        return _calc_cost(self.input_tokens, self.output_tokens,
                          self.cache_write, self.cache_read, self.model)


@dataclass
class ToolCallRecord:
    tool_name: str
    session_id: str
    ts: float = field(default_factory=time.time)


# ── IO 速率快照（用于计算 disk/net 增量速率）──────────────────────

@dataclass
class IOSnapshot:
    ts: float
    disk_read_bytes: int
    disk_write_bytes: int
    disk_read_count: int
    disk_write_count: int
    disk_busy_ms: int        # disk_io_counters().busy_time (Linux)
    net_bytes_sent: int
    net_bytes_recv: int
    net_errout: int
    net_errin: int
    cpu_ctx_switches: int
    cpu_user: float
    cpu_system: float
    cpu_idle: float
    cpu_iowait: float        # Linux only


# ── MetricsStore 单例 ─────────────────────────────────────────────

class MetricsStore:
    _instance: "MetricsStore | None" = None

    def __new__(cls):
        if cls._instance is None:
            inst = super().__new__(cls)
            inst._recent:  deque[CallMetric]   = deque(maxlen=20)
            inst._history: deque[CallMetric]   = deque(maxlen=500)
            inst._tokens:  deque[TokenRecord]  = deque(maxlen=1000)
            inst._tools:   deque[ToolCallRecord] = deque(maxlen=2000)
            inst._server_start: float = time.time()
            inst._io_snapshot: IOSnapshot | None = None
            inst._lock = threading.Lock()
            cls._instance = inst
        return cls._instance

    # ── Pipeline 调用指标 ─────────────────────────────────────────

    def start_call(self, task_id: int) -> CallMetric:
        return CallMetric(task_id=task_id)

    def finish_call(self, metric: CallMetric):
        if metric.total_duration is None:
            metric.total_duration = time.time() - metric.started_at
        with self._lock:
            self._recent.append(metric)
            self._history.append(metric)

    # ── Token / 成本追踪 ──────────────────────────────────────────

    def record_tokens(
        self,
        session_id: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cache_write: int = 0,
        cache_read: int = 0,
    ):
        rec = TokenRecord(
            session_id=session_id,
            model=model or "default",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_write=cache_write,
            cache_read=cache_read,
        )
        with self._lock:
            self._tokens.append(rec)

    def token_summary(self) -> dict:
        with self._lock:
            records = list(self._tokens)

        if not records:
            return {
                "total_input": 0,
                "total_output": 0,
                "total_cache_write": 0,
                "total_cache_read": 0,
                "total_cost_usd": 0.0,
                "session_count": 0,
                "by_model": [],
                "hourly": [],
            }

        total_in  = sum(r.input_tokens  for r in records)
        total_out = sum(r.output_tokens for r in records)
        total_cw  = sum(r.cache_write   for r in records)
        total_cr  = sum(r.cache_read    for r in records)
        total_cost = sum(r.cost_usd     for r in records)

        # 按模型聚合
        model_map: dict[str, dict] = {}
        for r in records:
            m = r.model
            if m not in model_map:
                model_map[m] = {"model": m, "input": 0, "output": 0, "cost": 0.0, "calls": 0}
            model_map[m]["input"]  += r.input_tokens
            model_map[m]["output"] += r.output_tokens
            model_map[m]["cost"]   += r.cost_usd
            model_map[m]["calls"]  += 1

        # 最近 24h 每小时 token 消耗
        now = time.time()
        hourly: list[dict] = []
        for h in range(23, -1, -1):
            t_start = now - (h + 1) * 3600
            t_end   = now - h * 3600
            hrs = [r for r in records if t_start <= r.ts < t_end]
            hourly.append({
                "hour": h,
                "input":  sum(r.input_tokens  for r in hrs),
                "output": sum(r.output_tokens for r in hrs),
                "cost":   round(sum(r.cost_usd for r in hrs), 6),
            })

        return {
            "total_input":       total_in,
            "total_output":      total_out,
            "total_cache_write": total_cw,
            "total_cache_read":  total_cr,
            "total_cost_usd":    round(total_cost, 6),
            "session_count":     len({r.session_id for r in records}),
            "by_model":          sorted(model_map.values(), key=lambda x: -x["cost"]),
            "hourly":            hourly,
        }

    # ── 工具调用统计 ──────────────────────────────────────────────

    def record_tool_call(self, tool_name: str, session_id: str):
        with self._lock:
            self._tools.append(ToolCallRecord(tool_name=tool_name, session_id=session_id))

    def tool_stats(self, top_n: int = 8) -> list[dict]:
        with self._lock:
            tools = list(self._tools)
        if not tools:
            return []
        counts: dict[str, int] = {}
        for t in tools:
            counts[t.tool_name] = counts.get(t.tool_name, 0) + 1
        total = sum(counts.values())
        return [
            {"tool": name, "count": cnt, "pct": round(cnt / total * 100)}
            for name, cnt in sorted(counts.items(), key=lambda x: -x[1])[:top_n]
        ]

    def recent_tools(self, n: int = 10) -> list[dict]:
        """最近 n 条工具调用（倒序）"""
        with self._lock:
            tools = list(self._tools)
        return [
            {"tool": t.tool_name, "session": t.session_id[:8], "ts": t.ts}
            for t in reversed(tools[-n:])
        ]

    # ── IO 速率快照 ───────────────────────────────────────────────

    def take_io_snapshot(self) -> IOSnapshot | None:
        """采集系统 IO 快照，返回与上次快照的速率差，同时更新内部存储"""
        import psutil
        try:
            disk = psutil.disk_io_counters()
            net  = psutil.net_io_counters()
            stats = psutil.cpu_stats()
            times = psutil.cpu_times()
            total_cpu = (times.user + times.system + times.idle +
                         getattr(times, "iowait", 0) + getattr(times, "irq", 0))
            snap = IOSnapshot(
                ts=time.time(),
                disk_read_bytes=disk.read_bytes,
                disk_write_bytes=disk.write_bytes,
                disk_read_count=disk.read_count,
                disk_write_count=disk.write_count,
                disk_busy_ms=getattr(disk, "busy_time", 0),
                net_bytes_sent=net.bytes_sent,
                net_bytes_recv=net.bytes_recv,
                net_errout=net.errout,
                net_errin=net.errin,
                cpu_ctx_switches=stats.ctx_switches,
                cpu_user=times.user,
                cpu_system=times.system,
                cpu_idle=times.idle,
                cpu_iowait=getattr(times, "iowait", 0.0),
            )
        except Exception:
            return None

        with self._lock:
            prev = self._io_snapshot
            self._io_snapshot = snap

        return prev  # 返回旧快照，由调用方计算 delta

    # ── 基础汇总（给已有 /api/metrics 用）─────────────────────────

    def summary(self) -> dict:
        with self._lock:
            recent = list(self._recent)
        if not recent:
            return {
                "call_count": 0,
                "avg_ttft_ms": None,
                "avg_duration_s": None,
                "avg_chars_per_sec": None,
                "recent_ttfts_ms": [],
            }
        ttfts     = [c.ttft          for c in recent if c.ttft          is not None]
        durations = [c.total_duration for c in recent if c.total_duration is not None]
        cps_list  = [c.chars_per_sec  for c in recent if c.chars_per_sec  is not None]
        return {
            "call_count":       len(recent),
            "avg_ttft_ms":      int(sum(ttfts) / len(ttfts) * 1000) if ttfts else None,
            "avg_duration_s":   round(sum(durations) / len(durations), 1) if durations else None,
            "avg_chars_per_sec":round(sum(cps_list) / len(cps_list), 1) if cps_list else None,
            "recent_ttfts_ms":  [int(t * 1000) for t in ttfts[-10:]],
        }

    # ── KPI ────────────────────────────────────────────────────────

    def total_interactions(self) -> int:
        with self._lock:
            return len(self._history)

    def avg_response_time_s(self) -> float | None:
        with self._lock:
            recent = list(self._recent)
        durations = [c.total_duration for c in recent if c.total_duration is not None]
        return round(sum(durations) / len(durations), 2) if durations else None

    def uptime_pct(self) -> float:
        with self._lock:
            history = list(self._history)
        if not history:
            return 100.0
        successes = sum(1 for c in history if c.success)
        return round(successes / len(history) * 100, 1)

    def ai_rating(self, approval_rate: int | None = None) -> float:
        with self._lock:
            recent = list(self._recent)
        if not recent:
            return 0.0
        success_rate = sum(1 for c in recent if c.success) / len(recent)
        score = success_rate * 3.0
        score += (approval_rate / 100 * 2.0) if approval_rate is not None else 1.0
        return round(min(score, 5.0), 2)

    # ── 周维度统计 ────────────────────────────────────────────────

    def weekly_stats(self) -> list[dict]:
        days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        counts: dict[int, dict[str, int]] = {i: {"total": 0, "success": 0} for i in range(7)}
        with self._lock:
            history = list(self._history)
        for c in history:
            dt = datetime.datetime.fromtimestamp(c.started_at)
            wd = (dt.weekday() + 1) % 7
            counts[wd]["total"] += 1
            if c.success:
                counts[wd]["success"] += 1
        today_wd = (datetime.datetime.now().weekday() + 1) % 7
        return [
            {
                "day": days[i],
                "count": counts[i]["total"],
                "success_rate": (
                    round(counts[i]["success"] / counts[i]["total"] * 100)
                    if counts[i]["total"] > 0 else 0
                ),
                "is_today": i == today_wd,
            }
            for i in range(7)
        ]


metrics_store = MetricsStore()

# MetricsStore 单元测试
# 测试 app/claude/metrics_store.py 中的定价、指标记录、汇总等功能

import time
from app.claude.metrics_store import (
    MetricsStore, CallMetric, TokenRecord,
    _pricing, _calc_cost, MODEL_PRICING,
)


def _reset_store(store: MetricsStore):
    """重置单例内部状态，避免测试间互相污染。"""
    store._recent.clear()
    store._history.clear()
    store._tokens.clear()
    store._tools.clear()


# ── _pricing / _calc_cost ────────────────────────────────────────

def test_pricing_opus():
    p = _pricing("claude-opus-4-6")
    assert p["input"] == 15.0
    assert p["output"] == 75.0


def test_pricing_sonnet():
    p = _pricing("claude-sonnet-4")
    assert p["input"] == 3.0
    assert p["output"] == 15.0


def test_pricing_haiku():
    p = _pricing("claude-haiku-4")
    assert p["input"] == 0.8
    assert p["output"] == 4.0


def test_pricing_unknown_model_returns_default():
    p = _pricing("gpt-4o")
    assert p == MODEL_PRICING["default"]


def test_pricing_none_model_returns_default():
    p = _pricing(None)
    assert p == MODEL_PRICING["default"]


def test_calc_cost_basic():
    # 1M input tokens on sonnet-4 → $3.0
    cost = _calc_cost(1_000_000, 0, 0, 0, "claude-sonnet-4")
    assert abs(cost - 3.0) < 1e-6


def test_calc_cost_output():
    # 1M output tokens on opus → $75.0
    cost = _calc_cost(0, 1_000_000, 0, 0, "claude-opus-4")
    assert abs(cost - 75.0) < 1e-6


def test_calc_cost_cache():
    # 1M cache_write on sonnet → $3.75, 1M cache_read → $0.30
    cost = _calc_cost(0, 0, 1_000_000, 1_000_000, "claude-sonnet-4")
    assert abs(cost - 4.05) < 1e-6


# ── CallMetric.chars_per_sec ─────────────────────────────────────

def test_chars_per_sec_normal():
    m = CallMetric(task_id=1, total_duration=2.0, char_count=200)
    assert m.chars_per_sec == 100.0


def test_chars_per_sec_zero_duration():
    m = CallMetric(task_id=1, total_duration=0.0, char_count=100)
    assert m.chars_per_sec is None


def test_chars_per_sec_none_duration():
    m = CallMetric(task_id=1, char_count=100)
    assert m.chars_per_sec is None


# ── TokenRecord.cost_usd ────────────────────────────────────────

def test_token_record_cost():
    rec = TokenRecord(
        session_id="s1", model="claude-sonnet-4",
        input_tokens=500_000, output_tokens=500_000,
    )
    # input: 0.5 * 3.0 = 1.5, output: 0.5 * 15.0 = 7.5 → total 9.0
    assert abs(rec.cost_usd - 9.0) < 1e-6


# ── start_call / finish_call ────────────────────────────────────

def test_start_and_finish_call():
    store = MetricsStore()
    _reset_store(store)

    metric = store.start_call(task_id=42)
    assert metric.task_id == 42
    assert metric.total_duration is None

    time.sleep(0.01)
    store.finish_call(metric)

    assert metric.total_duration is not None
    assert metric.total_duration > 0
    assert len(store._recent) == 1
    assert len(store._history) == 1


# ── record_tokens / token_summary ───────────────────────────────

def test_token_summary_empty():
    store = MetricsStore()
    _reset_store(store)
    s = store.token_summary()
    assert s["total_input"] == 0
    assert s["session_count"] == 0
    assert s["by_model"] == []
    assert len(s["hourly"]) == 24


def test_record_tokens_and_summary():
    store = MetricsStore()
    _reset_store(store)

    store.record_tokens("sess-a", "claude-sonnet-4", 1000, 500)
    store.record_tokens("sess-b", "claude-opus-4", 2000, 1000)

    s = store.token_summary()
    assert s["total_input"] == 3000
    assert s["total_output"] == 1500
    assert s["session_count"] == 2
    assert len(s["by_model"]) == 2
    assert s["total_cost_usd"] > 0


# ── record_tool_call / tool_stats / recent_tools ────────────────

def test_tool_stats_empty():
    store = MetricsStore()
    _reset_store(store)
    assert store.tool_stats() == []


def test_tool_stats_and_recent():
    store = MetricsStore()
    _reset_store(store)

    store.record_tool_call("Read", "s1")
    store.record_tool_call("Read", "s1")
    store.record_tool_call("Write", "s2")

    stats = store.tool_stats()
    assert len(stats) == 2
    assert stats[0]["tool"] == "Read"
    assert stats[0]["count"] == 2

    recent = store.recent_tools(10)
    assert len(recent) == 3
    # 倒序，最新的在前
    assert recent[0]["tool"] == "Write"


# ── summary 空/非空 ─────────────────────────────────────────────

def test_summary_empty():
    store = MetricsStore()
    _reset_store(store)
    s = store.summary()
    assert s["call_count"] == 0
    assert s["avg_ttft_ms"] is None


def test_summary_with_data():
    store = MetricsStore()
    _reset_store(store)

    m = CallMetric(task_id=1, ttft=0.5, total_duration=3.0, char_count=300, success=True)
    store.finish_call(m)

    s = store.summary()
    assert s["call_count"] == 1
    assert s["avg_ttft_ms"] == 500
    assert s["avg_duration_s"] == 3.0


# ── total_interactions ──────────────────────────────────────────

def test_total_interactions():
    store = MetricsStore()
    _reset_store(store)
    assert store.total_interactions() == 0

    store.finish_call(CallMetric(task_id=1))
    store.finish_call(CallMetric(task_id=2))
    assert store.total_interactions() == 2


# ── uptime_pct ──────────────────────────────────────────────────

def test_uptime_pct_all_success():
    store = MetricsStore()
    _reset_store(store)
    # 空时返回 100
    assert store.uptime_pct() == 100.0

    store.finish_call(CallMetric(task_id=1, success=True))
    store.finish_call(CallMetric(task_id=2, success=True))
    assert store.uptime_pct() == 100.0


def test_uptime_pct_mixed():
    store = MetricsStore()
    _reset_store(store)

    store.finish_call(CallMetric(task_id=1, success=True))
    store.finish_call(CallMetric(task_id=2, success=False))
    assert store.uptime_pct() == 50.0


# ── ai_rating ───────────────────────────────────────────────────

def test_ai_rating_empty():
    store = MetricsStore()
    _reset_store(store)
    assert store.ai_rating() == 0.0


def test_ai_rating_with_approval():
    store = MetricsStore()
    _reset_store(store)

    store.finish_call(CallMetric(task_id=1, success=True))
    # success_rate=1.0 → 3.0, approval_rate=80 → 80/100*2=1.6 → total 4.6
    rating = store.ai_rating(approval_rate=80)
    assert abs(rating - 4.6) < 0.01


def test_ai_rating_without_approval():
    store = MetricsStore()
    _reset_store(store)

    store.finish_call(CallMetric(task_id=1, success=True))
    # success_rate=1.0 → 3.0, no approval → +1.0 → 4.0
    rating = store.ai_rating(approval_rate=None)
    assert abs(rating - 4.0) < 0.01


# ── weekly_stats ────────────────────────────────────────────────

def test_weekly_stats_returns_7_days():
    store = MetricsStore()
    _reset_store(store)

    weekly = store.weekly_stats()
    assert len(weekly) == 7
    days = [w["day"] for w in weekly]
    assert days == ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    # 至少有一天 is_today 为 True
    assert any(w["is_today"] for w in weekly)

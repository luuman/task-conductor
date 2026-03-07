// frontend/src/pages/Dashboard.tsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Star, Activity, Zap, Shield, FolderSearch, Trash2, FlaskConical } from "lucide-react";
import { api, type Project, type Task, type Metrics } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { KnowledgePanel } from "../components/KnowledgePanel";
import { cn } from "../lib/utils";

interface DashboardProps {
  projectId: number | null;
  projects: Project[];
  projectsLoaded: boolean;
  onOpenTask: (id: number) => void;
  onSelectProject: (id: number) => void;
  onRefreshProjects?: () => void;
}

// ── 工具函数 ─────────────────────────────────────────────────────

function useAutoRefresh<T>(fetcher: () => Promise<T>, intervalMs = 4000) {
  const [data, setData] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = async () => { try { setData(await fetcher()); } catch { /* ignore */ } };
  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, intervalMs);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);
  return data;
}

// ── Claude Code 专属指标面板 ───────────────────────────────────

const TOOL_ICON: Record<string, string> = {
  Read: "📄", Write: "✏️", Edit: "🔧", Bash: "⚡", Glob: "🔍",
  Grep: "🔎", WebSearch: "🌐", WebFetch: "🌍", Agent: "🤖",
  TodoWrite: "📝", TodoRead: "📋", Task: "🏗️",
};
function toolIcon(name: string) { return TOOL_ICON[name] ?? "⚙️"; }

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function StatRow({ label, value, accent = "text-app-secondary" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-app-tertiary">{label}</span>
      <span className={cn("text-[10px] font-mono tabular-nums", accent)}>{value}</span>
    </div>
  );
}

function ClaudeMetricsPanel() {
  const { t } = useTranslation();
  const data = useAutoRefresh(() => api.claudeUsage(), 5000);

  if (!data) return (
    <div className="bg-app-secondary border border-app rounded-xl p-4 mb-3 animate-pulse text-center text-app-tertiary text-[11px]">
      {t('common.loading')}
    </div>
  );

  const { tokens, tools, recent_tools, sessions, performance } = data;
  const totalTokens = tokens.total_input + tokens.total_output;
  const hasData = totalTokens > 0 || tools.length > 0;

  return (
    <div className="bg-app-secondary border border-app rounded-xl overflow-hidden mb-3">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-app">
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full",
            sessions.active > 0 ? "bg-green-400 animate-pulse" : "bg-gray-600")} />
          <span className="text-[11px] font-semibold text-app">Claude Code</span>
          <span className="text-[9px] font-mono text-app-tertiary">Token · {t('dashboard.claudeMetrics.costEstimate')} · {t('dashboard.claudeMetrics.toolCalls')} · {t('dashboard.claudeMetrics.performance')}</span>
        </div>
        <div className="flex gap-3 text-[9px] font-mono">
          <span className={cn(sessions.active > 0 ? "text-green-400" : "text-app-tertiary")}>
            {sessions.active} / {sessions.total} {t('dashboard.claudeMetrics.activeSessionsHint')}
          </span>
          {performance.active_processes > 0 && (
            <span className="text-blue-400">{performance.active_processes} {t('dashboard.claudeMetrics.processRunning')}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4">
        {/* ── Token 消耗 ── */}
        <div className="p-4 border-r border-b lg:border-b-0 border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">{t('dashboard.claudeMetrics.tokenConsumption')}</p>
          <p className={cn("text-[22px] font-bold tabular-nums leading-none",
            hasData ? "text-app" : "text-app-tertiary")}>
            {fmtTokens(totalTokens)}
            <span className="text-[9px] font-normal text-app-tertiary ml-1">tokens</span>
          </p>
          <div className="space-y-1 pt-1 border-t border-app/50">
            <StatRow label={t('dashboard.claudeMetrics.input')} value={fmtTokens(tokens.total_input)} accent="text-blue-400" />
            <StatRow label={t('dashboard.claudeMetrics.output')} value={fmtTokens(tokens.total_output)} accent="text-green-400" />
            {tokens.total_cache_read > 0 && (
              <StatRow label={t('dashboard.claudeMetrics.cacheHit')} value={fmtTokens(tokens.total_cache_read)} accent="text-purple-400" />
            )}
            {tokens.total_cache_write > 0 && (
              <StatRow label={t('dashboard.claudeMetrics.cacheWrite')} value={fmtTokens(tokens.total_cache_write)} accent="text-app-tertiary" />
            )}
          </div>
          {!hasData && (
            <p className="text-[10px] text-app-tertiary/60 pt-1">{t('dashboard.claudeMetrics.autoStatsHint')}</p>
          )}
        </div>

        {/* ── 成本追踪 ── */}
        <div className="p-4 border-b lg:border-b-0 border-r-0 lg:border-r border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">{t('dashboard.claudeMetrics.costEstimate')}</p>
          <p className={cn("text-[22px] font-bold tabular-nums leading-none",
            tokens.total_cost_usd > 1 ? "text-yellow-400" : "text-app")}>
            {fmtCost(tokens.total_cost_usd)}
          </p>
          {/* 按模型分布 */}
          {tokens.by_model.length > 0 ? (
            <div className="space-y-1.5 pt-1 border-t border-app/50">
              {tokens.by_model.slice(0, 3).map((m) => {
                const shortModel = m.model.replace("claude-", "").replace("-20", " 20");
                const pct = tokens.total_cost_usd > 0 ? Math.round(m.cost / tokens.total_cost_usd * 100) : 0;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-app-tertiary truncate max-w-[80px]" title={m.model}>{shortModel}</span>
                      <span className="font-mono text-app-secondary">{fmtCost(m.cost)}</span>
                    </div>
                    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 pt-1 border-t border-app/50">
              <p className="text-[10px] text-app-tertiary/60">{t('dashboard.claudeMetrics.costHint')}</p>
              <p className="text-[9px] text-app-tertiary/40 font-mono">Sonnet $3/$15 · Haiku $0.8/$4</p>
            </div>
          )}
        </div>

        {/* ── 工具活动 ── */}
        <div className="p-4 border-r border-t lg:border-t-0 border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">{t('dashboard.claudeMetrics.toolCalls')}</p>
          {tools.length === 0 ? (
            <p className="text-[10px] text-app-tertiary/60 py-2">{t('dashboard.claudeMetrics.noCallRecords')}</p>
          ) : (
            <div className="space-y-1.5">
              {tools.slice(0, 6).map((t) => (
                <div key={t.tool} className="flex items-center gap-1.5">
                  <span className="text-[10px] w-4 shrink-0">{toolIcon(t.tool)}</span>
                  <span className="text-[10px] text-app-secondary flex-1 truncate">{t.tool}</span>
                  <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-accent/70 rounded-full" style={{ width: `${t.pct}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-app-tertiary w-[28px] text-right shrink-0">
                    {t.count >= 1000 ? `${(t.count/1000).toFixed(1)}k` : t.count}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* 最近调用 */}
          {recent_tools.length > 0 && (
            <div className="pt-2 border-t border-app/50 space-y-0.5">
              <p className="text-[9px] text-app-tertiary mb-1">{t('dashboard.claudeMetrics.recent')}</p>
              {recent_tools.slice(0, 3).map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[9px] font-mono opacity-70 hover:opacity-100">
                  <span>{toolIcon(t.tool)}</span>
                  <span className="text-app-secondary">{t.tool}</span>
                  <span className="text-app-tertiary text-[8px]">{t.session}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 性能指标 ── */}
        <div className="p-4 border-t lg:border-t-0 border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">{t('dashboard.claudeMetrics.performance')}</p>
          <div className="space-y-1">
            <StatRow label={t('dashboard.claudeMetrics.callCount')} value={String(performance.call_count)} />
            <StatRow label={t('dashboard.claudeMetrics.ttft')}
              value={performance.avg_ttft_ms != null ? `${performance.avg_ttft_ms} ms` : "—"}
              accent={performance.avg_ttft_ms != null && performance.avg_ttft_ms < 1000 ? "text-green-400" : "text-app-secondary"}
            />
            <StatRow label={t('dashboard.claudeMetrics.avgDuration')}
              value={performance.avg_duration_s != null ? `${performance.avg_duration_s} s` : "—"}
            />
            <StatRow label={t('dashboard.claudeMetrics.charsPerSec')}
              value={performance.avg_chars_per_sec != null ? `${performance.avg_chars_per_sec}` : "—"}
            />
          </div>
          {/* TTFT 小型柱状图 */}
          {performance.recent_ttfts_ms.length > 0 && (
            <div className="pt-2 border-t border-app/50">
              <p className="text-[9px] text-app-tertiary mb-1.5">{t('dashboard.claudeMetrics.ttftHistory')}</p>
              <div className="flex items-end gap-0.5 h-8">
                {performance.recent_ttfts_ms.slice(-10).map((v, i) => {
                  const maxV = Math.max(...performance.recent_ttfts_ms);
                  const h = maxV > 0 ? Math.max(2, Math.round((v / maxV) * 32)) : 4;
                  return (
                    <div key={i} className="flex-1 rounded-sm bg-accent/60 transition-all" style={{ height: `${h}px` }}
                         title={`${v} ms`} />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 指标组件（对照 Agentverse Dashboard 设计）────────────────────

function useMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const t0 = performance.now();
    try {
      const m = await api.metrics();
      setApiLatency(Math.round(performance.now() - t0));
      setMetrics(m);
    } catch {
      setApiLatency(null);
    }
  };

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return { metrics, apiLatency };
}

// KPI 卡片
function KPICard({
  label,
  Icon,
  value,
  sub,
  trend,
}: {
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  value: string;
  sub: string;
  trend?: { text: string; positive: boolean } | null;
}) {
  return (
    <div className="rounded-xl px-4 py-4 flex flex-col gap-3 relative overflow-hidden"
         style={{
           background: "var(--background-secondary)",
           border: "1px solid var(--border)",
           boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
         }}>
      {/* Orion 顶部 accent 渐变线 */}
      <div className="absolute top-0 left-0 right-0"
           style={{ height: 1, background: "linear-gradient(90deg,var(--accent) 0%,transparent 55%)" }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.06em] uppercase font-semibold"
              style={{ color: "var(--text-tertiary)" }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
             style={{ background: "rgba(68,119,255,0.12)", border: "1px solid rgba(68,119,255,0.25)" }}>
          <Icon size={13} style={{ color: "var(--accent)" }} />
        </div>
      </div>
      <div>
        <p className="tabular-nums leading-none font-bold"
           style={{ fontSize: 28, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{value}</p>
        {trend ? (
          <p className={cn("text-[10px] mt-2 flex items-center gap-0.5 font-semibold",
            trend.positive ? "text-emerald-400" : "text-red-400")}>
            <span>{trend.positive ? "↗" : "↘"}</span> {trend.text}
          </p>
        ) : (
          <p className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

// 半圆仪表盘（High Availability Gauge）
function GaugeChart({ pct, label }: { pct: number; label?: string }) {
  const cx = 150, cy = 155, r = 110;
  const totalArc = Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const fillOffset = totalArc * (1 - clamped / 100);

  // 指针位置（arc 末端）
  const angle = Math.PI * (1 - clamped / 100);
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);
  const rotateDeg = 90 - (angle * 180) / Math.PI;

  // 刻度标签位置
  const scaleMarks = [
    { pct: 0, label: "00" },
    { pct: 25, label: "25" },
    { pct: 50, label: "50" },
    { pct: 75, label: "75" },
    { pct: 100, label: "100" },
  ];

  return (
    <svg viewBox="0 0 300 188" className="w-full" style={{ maxHeight: 188 }}>
      {/* 背景弧 */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#2d3748" strokeWidth="14" strokeLinecap="round"
      />
      {/* 填充弧（amber） */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#d97706" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={totalArc}
        strokeDashoffset={fillOffset}
      />
      {/* 刻度标签 */}
      {scaleMarks.map(({ pct: p, label }) => {
        const a = Math.PI * (1 - p / 100);
        const lx = cx + (r + 24) * Math.cos(a);
        const ly = cy - (r + 24) * Math.sin(a);
        return (
          <text key={p} x={lx} y={ly + 4} textAnchor="middle" fill="#6b7280" fontSize="10">
            {label}
          </text>
        );
      })}
      {/* 指针 pill */}
      <rect
        x={nx - 13} y={ny - 5} width={26} height={10} rx={5}
        fill="#ea580c"
        transform={`rotate(${rotateDeg}, ${nx}, ${ny})`}
      />
      <circle cx={nx} cy={ny} r={2.5} fill="#fef3c7" />
      {/* 中心数值 */}
      <text x={cx} y={cy - 18} textAnchor="middle" fill="white" fontSize="38" fontWeight="bold"
        style={{ fontFamily: "system-ui, sans-serif" }}>
        {clamped}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#9ca3af" fontSize="11">
        {clamped}% {label ?? ""}
      </text>
    </svg>
  );
}

// 周处理量柱状图（Real-time Processing）
function WeeklyChart({ data }: {
  data: Array<{ day: string; count: number; success_rate: number; is_today: boolean }>;
}) {
  const W = 340, H = 100, barW = 32, gap = 14;
  const totalW = data.length * (barW + gap) - gap;
  const ox = (W - totalW) / 2;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const gridRatios = [0, 0.3, 0.6, 0.9];

  return (
    <svg viewBox={`0 0 ${W} ${H + 32}`} className="w-full">
      {/* Y 轴网格线 */}
      {gridRatios.map((ratio) => {
        const y = H - ratio * H;
        return (
          <g key={ratio}>
            <line x1={ox - 4} y1={y} x2={W - ox + 4} y2={y} stroke="#374151" strokeWidth="0.5" />
            <text x={0} y={y + 3.5} fill="#6b7280" fontSize="9">{Math.round(ratio * 100)}%</text>
          </g>
        );
      })}
      {/* 柱状图 */}
      {data.map((d, i) => {
        const x = ox + i * (barW + gap);
        const barH = d.count > 0 ? Math.max((d.count / maxCount) * H, 6) : 2;
        const y = H - barH;
        const color = d.is_today ? "#10b981" : "#374151";
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={color} />
            {d.count > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill="#e5e7eb" fontSize="8">
                {d.count}
              </text>
            )}
            <text
              x={x + barW / 2} y={H + 16}
              textAnchor="middle"
              fill={d.is_today ? "#10b981" : "#6b7280"}
              fontSize="10"
              fontWeight={d.is_today ? "600" : "400"}
            >
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChipTag({ label }: { label: string }) {
  return (
    <span className="text-[9px] border border-app text-app-tertiary px-1.5 py-0.5 rounded-full whitespace-nowrap">
      {label}
    </span>
  );
}

function MetricsPanel() {
  const { t } = useTranslation();
  const { metrics, apiLatency } = useMetrics();
  const m = metrics;

  const kpiCards = [
    {
      label: t('dashboard.metricsPanel.aiScore'),
      Icon: Star,
      value: m?.kpi.ai_rating != null ? m.kpi.ai_rating.toFixed(2) : "—",
      sub: t('dashboard.metricsPanel.overallScore'),
      trend: m?.kpi.ai_rating != null
        ? { text: m.kpi.ai_rating >= 4 ? t('dashboard.metricsPanel.excellent') : m.kpi.ai_rating >= 3 ? t('dashboard.metricsPanel.good') : t('dashboard.metricsPanel.needsImprovement'), positive: m.kpi.ai_rating >= 4 }
        : null,
    },
    {
      label: t('dashboard.metricsPanel.interactions'),
      Icon: Activity,
      value: m?.kpi.interactions != null ? String(m.kpi.interactions) : "—",
      sub: t('dashboard.metricsPanel.totalSessions'),
      trend: null,
    },
    {
      label: t('dashboard.metricsPanel.responseTime'),
      Icon: Zap,
      value: m?.kpi.avg_response_time_s != null
        ? `${m.kpi.avg_response_time_s}s`
        : apiLatency != null ? `${(apiLatency / 1000).toFixed(2)}s` : "—",
      sub: t('dashboard.metricsPanel.avgLatency'),
      trend: null,
    },
    {
      label: t('dashboard.metricsPanel.uptime'),
      Icon: Shield,
      value: m?.kpi.uptime_pct != null ? `${m.kpi.uptime_pct}%` : "—",
      sub: t('dashboard.metricsPanel.availability'),
      trend: null,
    },
  ];

  const DAY_CN: Record<string, string> = {
    Sun: t('dashboard.dayCn.sun'), Mon: t('dashboard.dayCn.mon'), Tue: t('dashboard.dayCn.tue'), Wed: t('dashboard.dayCn.wed'),
    Thu: t('dashboard.dayCn.thu'), Fri: t('dashboard.dayCn.fri'), Sat: t('dashboard.dayCn.sat'),
  };
  const weeklyData = (m?.weekly ?? Array.from({ length: 7 }, (_, i) => ({
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
    count: 0,
    success_rate: 0,
    is_today: new Date().getDay() === i,
  }))).map((d) => ({ ...d, day: DAY_CN[d.day] ?? d.day }));

  return (
    <div className="space-y-3 mb-6">
      {/* KPI 卡片行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map(card => (
          <KPICard key={card.label} {...card} />
        ))}
      </div>

      {/* Gauge + Weekly 图表行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* High Availability */}
        <div className="rounded-xl p-5 relative overflow-hidden"
             style={{
               background: "var(--background-secondary)",
               border: "1px solid var(--border)",
               boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
             }}>
          <div className="absolute top-0 left-0 right-0"
               style={{ height: 1, background: "linear-gradient(90deg,var(--accent) 0%,transparent 55%)" }} />
          <h3 className="text-[13px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{t('dashboard.gauge.highAvailability')}</h3>
          <GaugeChart pct={m?.gauge.availability_pct ?? 0} />
        </div>

        {/* Real-time Processing */}
        <div className="rounded-xl p-5 relative overflow-hidden"
             style={{
               background: "var(--background-secondary)",
               border: "1px solid var(--border)",
               boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
             }}>
          <div className="absolute top-0 left-0 right-0"
               style={{ height: 1, background: "linear-gradient(90deg,var(--accent) 0%,transparent 55%)" }} />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{t('dashboard.gauge.realtimeProcessing')}</h3>
            <div className="flex items-center gap-1">
              <ChipTag label="Claude Code" />
              <ChipTag label={t('dashboard.gauge.realtimeMonitoring')} />
              <ChipTag label={t('dashboard.gauge.pipeline')} />
            </div>
          </div>
          <WeeklyChart data={weeklyData} />
        </div>
      </div>
    </div>
  );
}

// ── 原有组件 ──────────────────────────────────────────────────

const STAGE_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  input: "default",
  analysis: "warning",
  prd: "warning",
  ui: "accent",
  plan: "accent",
  dev: "info",
  test: "warning",
  deploy: "success",
  monitor: "success",
  done: "success",
};

const STAGE_LABEL: Record<string, string> = {
  input: "需求", analysis: "分析", prd: "PRD", ui: "UI",
  plan: "方案", dev: "开发", test: "测试", deploy: "发布", monitor: "监控", done: "完成",
};

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  pending: "default",
  running: "info",
  waiting_review: "warning",
  approved: "accent",
  rejected: "danger",
  done: "success",
  failed: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  running: "运行中",
  waiting_review: "待审批",
  approved: "已批准",
  rejected: "已驳回",
  done: "已完成",
  failed: "失败",
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-500",
    running: "bg-blue-400 animate-pulse",
    waiting_review: "bg-yellow-400",
    approved: "bg-accent",
    rejected: "bg-red-400",
    done: "bg-green-400",
    failed: "bg-red-400",
  };
  return <span className={cn("w-2 h-2 rounded-full shrink-0", colors[status] || "bg-gray-500")} />;
}

function NewTaskButton({ projectId, onCreated }: { projectId: number; onCreated: (t: Task) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const task = await api.tasks.create(projectId, { title: title.trim(), description: desc.trim() });
      onCreated(task);
      setTitle(""); setDesc(""); setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ 新建任务</Button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-app-secondary border border-app rounded-xl p-5 w-96 space-y-3 shadow-2xl">
            <h2 className="text-sm font-semibold text-app">新建任务</h2>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任务标题"
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="需求描述（可选）"
              rows={3}
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="text-xs text-app-tertiary hover:text-app px-3 py-1.5">取消</button>
              <button onClick={handleCreate} disabled={!title.trim() || loading}
                className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md disabled:opacity-40">
                {loading ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectCard({ project, onSelect, onOpenTask, onDelete, onToggleTest }: {
  project: Project;
  onSelect: () => void;
  onOpenTask: (id: number) => void;
  onDelete?: (id: number) => void;
  onToggleTest?: (id: number, isTest: boolean) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    api.projects.tasks(project.id).then(setTasks).catch(() => {});
  }, [project.id]);

  const runningCount = tasks.filter(t => t.status === "running").length;

  return (
    <div
      onClick={onSelect}
      className="rounded-xl p-4 cursor-pointer transition-all space-y-2 relative overflow-hidden group"
      style={{
        background: "var(--background-secondary)",
        border: project.is_test ? "1px solid rgba(168,85,247,0.3)" : "1px solid var(--border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = project.is_test ? "rgba(168,85,247,0.5)" : "rgba(68,119,255,0.4)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = project.is_test ? "rgba(168,85,247,0.3)" : "var(--border)")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
            project.is_test ? "bg-purple-500/20 text-purple-400" : "bg-accent/20 text-accent")}>
            {project.is_test ? <FlaskConical size={12} /> : project.name[0].toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-app">{project.name}</span>
          {project.is_test && (
            <span className="text-[8px] font-mono text-purple-400 bg-purple-500/10 px-1 py-0.5 rounded">TEST</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {runningCount > 0 && (
            <Badge variant="info">{runningCount} 运行中</Badge>
          )}
          {/* 操作按钮 - hover 时显示 */}
          <div className="hidden group-hover:flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleTest?.(project.id, !project.is_test); }}
              className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: project.is_test ? "#a855f7" : "var(--text-tertiary)" }}
              title={project.is_test ? "取消测试标记" : "标记为测试项目"}
            >
              <FlaskConical size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(project.id); }}
              className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-red-500/20"
              style={{ color: "var(--text-tertiary)" }}
              title="删除项目"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>
      <p className="text-app-tertiary text-[10px]">
        {tasks.length} 个任务
        {project.repo_url && <span className="ml-2 font-mono opacity-60">{project.repo_url.split("/").pop()}</span>}
      </p>
      <div className="flex flex-wrap gap-1 pt-1">
        {tasks.slice(0, 3).map(t => (
          <button
            key={t.id}
            onClick={(e) => { e.stopPropagation(); onOpenTask(t.id); }}
            className="text-[10px] text-app-secondary bg-app-tertiary hover:bg-app-secondary px-1.5 py-0.5 rounded transition-colors"
          >
            {t.title.slice(0, 20)}{t.title.length > 20 ? "..." : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ projectId, projects, projectsLoaded, onOpenTask, onSelectProject, onRefreshProjects }: DashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (projectId) {
      api.projects.tasks(projectId).then(setTasks).catch(() => {});
    } else {
      setTasks([]);
    }
  }, [projectId]);

  const activeProject = projects.find((p) => p.id === projectId);

  if (!projectsLoaded) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-app-tertiary text-xs animate-pulse">加载中...</p>
    </div>
  );

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.projects.scan();
      onRefreshProjects?.();
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此项目及其所有任务？")) return;
    await api.projects.delete(id);
    onRefreshProjects?.();
  };

  const handleToggleTest = async (id: number, isTest: boolean) => {
    await api.projects.updateSort(id, { is_test: isTest });
    onRefreshProjects?.();
  };

  const realProjects = projects.filter(p => !p.is_test);
  const testProjects = projects.filter(p => p.is_test);

  // No project selected → overview
  if (!projectId) return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-app">概览</h1>
          <p className="text-app-tertiary text-xs mt-0.5">{projects.length} 个项目</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-[11px] text-app-tertiary hover:text-app px-3 py-1.5 rounded-lg border border-app hover:border-accent/40 transition-all disabled:opacity-40"
        >
          <FolderSearch size={13} className={scanning ? "animate-spin" : ""} />
          {scanning ? "扫描中..." : "扫描本地项目"}
        </button>
      </div>
      <ClaudeMetricsPanel />
      <MetricsPanel />
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 space-y-2">
          <p className="text-app-tertiary text-sm">暂无项目</p>
          <p className="text-app-tertiary text-xs">点击「扫描本地项目」自动发现 git 仓库，或侧边栏 + 手动创建</p>
        </div>
      ) : (
        <>
          {/* 正式项目 */}
          {realProjects.length > 0 && (
            <>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-app-tertiary mb-2">
                项目 ({realProjects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {realProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} onSelect={() => onSelectProject(p.id)} onOpenTask={onOpenTask}
                    onDelete={handleDelete} onToggleTest={handleToggleTest} />
                ))}
              </div>
            </>
          )}
          {/* 测试项目 */}
          {testProjects.length > 0 && (
            <>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-purple-400/70 mb-2 flex items-center gap-1.5">
                <FlaskConical size={11} /> 测试项目 ({testProjects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {testProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} onSelect={() => onSelectProject(p.id)} onOpenTask={onOpenTask}
                    onDelete={handleDelete} onToggleTest={handleToggleTest} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  // Project selected → task list
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Project header */}
      <div className="px-5 py-3 border-b border-app flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
            {activeProject?.name[0].toUpperCase()}
          </div>
          <h1 className="text-sm font-semibold text-app">{activeProject?.name}</h1>
          <Badge variant="default">{tasks.length} 个任务</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setKnowledgeOpen(true)}>知识库</Button>
          <NewTaskButton projectId={projectId} onCreated={(t) => { setTasks((p) => [t, ...p]); onOpenTask(t.id); }} />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <p className="text-app-tertiary text-xs">暂无任务</p>
          </div>
        ) : (
          tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-app-secondary transition-colors text-left group"
            >
              <StatusDot status={t.status} />
              <span className="flex-1 text-xs text-app truncate">{t.title}</span>
              <Badge variant={STAGE_COLORS[t.stage] ?? "default"}>
                {STAGE_LABEL[t.stage] ?? t.stage}
              </Badge>
              <Badge variant={STATUS_COLORS[t.status] ?? "default"}>
                {STATUS_LABEL[t.status] ?? t.status}
              </Badge>
            </button>
          ))
        )}
      </div>

      {/* Knowledge Panel */}
      {knowledgeOpen && (
        <KnowledgePanel projectId={projectId} onClose={() => setKnowledgeOpen(false)} />
      )}
    </div>
  );
}

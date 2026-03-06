// frontend/src/pages/ClaudeConfig.tsx
// Visual editor for ~/.claude/ — overview + settings.json
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  api,
  type ClaudeConfig,
  type ClaudeOverview,
  type HookRule,
  type HookEntry,
  type McpServer,
} from "../lib/api";
import { cn } from "../lib/utils";
import McpMarketEmbed from "./McpMarket";
import {
  Webhook,
  Plug,
  Shield,
  Settings2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Save,
  AlertTriangle,
  Check,
  X,
  Terminal,
  FolderOpen,
  Sparkles,
  MessageSquare,
  Wrench,
  Users,
  Calendar,
  BarChart3,
  Globe,
  Link,
  Unplug,
  SlidersHorizontal,
} from "lucide-react";

// ── Hook 事件中文标签 ──────────────────────────────────────────────
const EVENT_LABELS: Record<string, { label: string; desc: string }> = {
  PreToolUse:         { label: "工具调用前",   desc: "Claude 调用工具之前触发" },
  PostToolUse:        { label: "工具调用后",   desc: "工具调用成功完成后触发" },
  PostToolUseFailure: { label: "工具调用失败", desc: "工具调用失败后触发" },
  Stop:               { label: "会话结束",     desc: "Claude 停止响应时触发" },
  SubagentStart:      { label: "子代理启动",   desc: "子代理开始运行时触发" },
  SubagentStop:       { label: "子代理结束",   desc: "子代理结束运行时触发" },
  SessionStart:       { label: "会话开始",     desc: "新会话启动时触发" },
  SessionEnd:         { label: "会话关闭",     desc: "会话结束时触发" },
  UserPromptSubmit:   { label: "用户提交",     desc: "用户发送消息时触发" },
  Notification:       { label: "通知",         desc: "Claude 发出通知时触发" },
};

type Section = "mcp" | "mcp-market" | "hooks" | "plugins" | "permissions" | "settings" | "other";

// ── 常用设置项定义 ──────────────────────────────────────────────────
const COMMON_SETTINGS: {
  key: string;
  label: string;
  desc: string;
  type: "string" | "boolean" | "number" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
}[] = [
  {
    key: "model",
    label: "默认模型",
    desc: "覆盖 Claude Code 使用的默认模型",
    type: "select",
    options: [
      { value: "", label: "默认（不覆盖）" },
      { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
    placeholder: "claude-sonnet-4-6",
  },
  {
    key: "language",
    label: "响应语言",
    desc: "Claude 默认使用的响应语言",
    type: "string",
    placeholder: "例：chinese、english、japanese",
  },
  {
    key: "alwaysThinkingEnabled",
    label: "始终启用扩展思考",
    desc: "为所有会话默认启用扩展思考（Extended Thinking）",
    type: "boolean",
  },
  {
    key: "showTurnDuration",
    label: "显示轮次耗时",
    desc: "响应后显示耗时消息（如 \"Cooked for 1m 6s\"）",
    type: "boolean",
  },
  {
    key: "cleanupPeriodDays",
    label: "会话清理周期（天）",
    desc: "非活跃超过此天数的会话在启动时删除（默认 30）",
    type: "number",
    placeholder: "30",
  },
  {
    key: "outputStyle",
    label: "输出风格",
    desc: "调整系统提示的输出样式",
    type: "string",
    placeholder: "例：Explanatory、Concise",
  },
];
const COMMON_SETTING_KEYS = new Set(COMMON_SETTINGS.map(s => s.key));

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Overview Panel ─────────────────────────────────────────────────
function OverviewPanel({ overview }: { overview: ClaudeOverview }) {
  const stats = [
    { label: "CLI 版本", value: overview.cli_version, Icon: Terminal, color: "var(--accent)" },
    { label: "总消息", value: fmtNum(overview.total_messages), Icon: MessageSquare, color: "#22c55e" },
    { label: "工具调用", value: fmtNum(overview.total_tool_calls), Icon: Wrench, color: "#f59e0b" },
    { label: "会话数", value: fmtNum(overview.total_sessions), Icon: Users, color: "#38bdf8" },
    { label: "活跃天数", value: String(overview.active_days), Icon: Calendar, color: "#a78bfa" },
  ];

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-3">
        {stats.map(({ label, value, Icon, color }) => (
          <div key={label}
            className="bg-app-secondary border border-app rounded-xl px-3 py-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: `linear-gradient(90deg, ${color}, transparent 60%)` }} />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] uppercase tracking-widest font-semibold text-app-tertiary">{label}</span>
              <div className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                <Icon size={12} style={{ color }} />
              </div>
            </div>
            <p className="text-lg font-bold tabular-nums text-app leading-none">{value}</p>
          </div>
        ))}
      </div>

      {/* Activity chart + Side info */}
      <div className="grid grid-cols-3 gap-3">
        {/* Activity chart */}
        <div className="col-span-2 bg-app-secondary border border-app rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={13} className="text-app-tertiary" />
              <span className="text-xs font-semibold text-app">每日活动</span>
            </div>
            <span className="text-[9px] text-app-tertiary font-mono">
              {overview.first_active_day} ~ {overview.last_active_day}
            </span>
          </div>
          <ActivityChart data={overview.daily_activity} />
        </div>

        {/* Right column: plugins + skills + scripts */}
        <div className="space-y-3">
          {/* Installed plugins */}
          <div className="bg-app-secondary border border-app rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Plug size={11} className="text-accent" />
              <span className="text-[10px] font-semibold text-app">已安装插件</span>
              <span className="text-[9px] font-mono text-app-tertiary ml-auto">{overview.installed_plugins.length}</span>
            </div>
            {overview.installed_plugins.length === 0 ? (
              <p className="text-[10px] text-app-tertiary">暂无</p>
            ) : (
              <div className="space-y-1.5">
                {overview.installed_plugins.map(p => (
                  <div key={p.plugin_id} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center text-[8px] font-bold text-accent shrink-0">
                      {p.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-app truncate">{p.name}</div>
                      <div className="text-[8px] text-app-tertiary font-mono">
                        v{p.version} {p.publisher && `@${p.publisher}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Skills */}
          <div className="bg-app-secondary border border-app rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={11} className="text-yellow-400" />
              <span className="text-[10px] font-semibold text-app">Skills</span>
              <span className="text-[9px] font-mono text-app-tertiary ml-auto">{overview.skills.length}</span>
            </div>
            {overview.skills.length === 0 ? (
              <p className="text-[10px] text-app-tertiary">暂无自定义 skill</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {overview.skills.map(s => (
                  <span key={s.name}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-mono">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* MCP Servers */}
          <div className="bg-app-secondary border border-app rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={11} className="text-blue-400" />
              <span className="text-[10px] font-semibold text-app">MCP 服务器</span>
              <span className="text-[9px] font-mono text-app-tertiary ml-auto">{overview.mcp_servers.length}</span>
            </div>
            {overview.mcp_servers.length === 0 ? (
              <p className="text-[10px] text-app-tertiary">暂无 MCP 服务器</p>
            ) : (
              <div className="space-y-1.5">
                {overview.mcp_servers.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                      s.status === "connected" ? "bg-green-400" :
                      s.status === "needs_auth" ? "bg-yellow-400" : "bg-red-400")} />
                    <span className="text-[10px] text-app truncate flex-1">{s.name}</span>
                    <span className="text-[8px] text-app-tertiary font-mono">{s.transport}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hook scripts + Projects */}
          <div className="bg-app-secondary border border-app rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FolderOpen size={11} className="text-green-400" />
              <span className="text-[10px] font-semibold text-app">项目记忆</span>
              <span className="text-[9px] font-mono text-app-tertiary ml-auto">{overview.projects.length}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {overview.hook_scripts.map(h => (
                <span key={h.name}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-mono">
                  {h.name}
                </span>
              ))}
            </div>
            {overview.projects.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[9px] text-app-tertiary">
                <span>{overview.projects.filter(p => p.has_memory).length} 个有记忆</span>
                <span>{overview.projects.filter(p => p.has_claude_md).length} 个有 CLAUDE.md</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity Chart (mini bar chart, last 60 days) ──────────────────
function ActivityChart({ data }: { data: ClaudeOverview["daily_activity"] }) {
  // Show last 60 entries
  const recent = useMemo(() => data.slice(-60), [data]);
  const maxMsg = useMemo(() => Math.max(1, ...recent.map(d => d.message_count)), [recent]);
  const maxTool = useMemo(() => Math.max(1, ...recent.map(d => d.tool_call_count)), [recent]);

  if (recent.length === 0) {
    return <div className="text-[10px] text-app-tertiary text-center py-6">暂无活动数据</div>;
  }

  const H = 80;
  const barW = Math.max(3, Math.min(8, (600 - recent.length) / recent.length));
  const gap = 1;
  const W = recent.length * (barW + gap);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 18}`} width={W} height={H + 18} className="block">
        {recent.map((d, i) => {
          const x = i * (barW + gap);
          const msgH = Math.max(1, (d.message_count / maxMsg) * H * 0.9);
          const toolH = Math.max(1, (d.tool_call_count / maxTool) * H * 0.5);
          const isToday = i === recent.length - 1;
          return (
            <g key={d.date}>
              <title>{`${d.date}\n消息: ${d.message_count}\n工具: ${d.tool_call_count}\n会话: ${d.session_count}`}</title>
              {/* Messages bar */}
              <rect x={x} y={H - msgH} width={barW} height={msgH}
                rx={1} fill={isToday ? "#22c55e" : "#4477ff"} opacity={0.7} />
              {/* Tool calls bar (overlaid, shorter) */}
              <rect x={x} y={H - toolH} width={barW} height={toolH}
                rx={1} fill={isToday ? "#86efac" : "#f59e0b"} opacity={0.5} />
              {/* Date label (every 7th) */}
              {i % 7 === 0 && (
                <text x={x + barW / 2} y={H + 12} textAnchor="middle"
                  fill="var(--text-tertiary)" fontSize="6" fontFamily="monospace">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1.5">
        <div className="flex items-center gap-1.5 text-[9px] text-app-tertiary">
          <div className="w-2 h-2 rounded-sm" style={{ background: "#4477ff", opacity: 0.7 }} />
          消息
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-app-tertiary">
          <div className="w-2 h-2 rounded-sm" style={{ background: "#f59e0b", opacity: 0.5 }} />
          工具调用
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function ClaudeConfig() {
  const [config, setConfig] = useState<ClaudeConfig | null>(null);
  const [overview, setOverview] = useState<ClaudeOverview | null>(null);
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("mcp");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cfg, events, ov] = await Promise.all([
        api.claudeConfig.get(),
        api.claudeConfig.hookEvents(),
        api.claudeConfig.overview(),
      ]);
      setConfig(cfg);
      setHookEvents(events);
      setOverview(ov);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sections: { id: Section; label: string; Icon: typeof Webhook; count?: number }[] = useMemo(() => [
    { id: "mcp",         label: "MCP 服务", Icon: Globe,    count: overview?.mcp_servers.length },
    { id: "mcp-market",  label: "MCP 市场", Icon: Link },
    { id: "hooks",       label: "Hooks",    Icon: Webhook,  count: config ? Object.keys(config.hooks).length : undefined },
    { id: "plugins",     label: "插件",     Icon: Plug,     count: config ? Object.keys(config.enabled_plugins).length : undefined },
    { id: "permissions", label: "权限",     Icon: Shield },
    { id: "other",       label: "其他",     Icon: Settings2 },
  ], [overview, config]);

  // Scroll-spy: track which section is in view
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handler = () => {
      const sectionIds: Section[] = ["mcp", "mcp-market", "hooks", "plugins", "permissions", "other"];
      for (const id of sectionIds) {
        const el = document.getElementById(`section-${id}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (rect.top <= containerRect.top + 120) {
            setActiveSection(id);
          }
        }
      }
    };
    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, []);

  const scrollToSection = (id: Section) => {
    const el = document.getElementById(`section-${id}`);
    if (el && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      scrollRef.current.scrollTop += elTop - containerTop - 16;
    }
    setActiveSection(id);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left nav (fixed) ── */}
      <div className="w-[180px] shrink-0 flex flex-col overflow-y-auto py-4 px-3 space-y-1"
           style={{ borderRight: "1px solid var(--border)" }}>
        {/* Title */}
        <div className="px-2 pb-3">
          <h1 className="text-[13px] font-semibold text-app">Claude Code</h1>
          <p className="text-[10px] text-app-tertiary mt-0.5 font-mono truncate">
            {overview ? overview.home_path : "..."}
          </p>
        </div>

        {/* Nav items */}
        {sections.map(({ id, label, Icon, count }) => (
          <button
            key={id}
            onClick={() => scrollToSection(id)}
            className={cn(
              "flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] transition-all w-full text-left",
              activeSection === id
                ? "bg-accent/10 text-accent font-medium"
                : "text-app-tertiary hover:text-app-secondary hover:bg-white/[0.03]"
            )}
          >
            <Icon size={13} className="shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {count !== undefined && (
              <span className={cn(
                "text-[9px] font-mono px-1.5 py-0.5 rounded-full",
                activeSection === id ? "bg-accent/20 text-accent" : "bg-app-tertiary/20"
              )}>
                {count}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Refresh */}
        <button onClick={load}
          className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] rounded-lg text-app-tertiary hover:text-app-secondary hover:bg-white/[0.03] transition-colors w-full">
          <RotateCcw size={12} />
          刷新配置
        </button>
      </div>

      {/* ── Main content (scrollable, all sections) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-xs text-red-400">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && !config && (
          <div className="flex items-center justify-center h-40">
            <p className="text-app-tertiary text-xs animate-pulse">加载 Claude 信息...</p>
          </div>
        )}

        {/* Overview */}
        {overview && <OverviewPanel overview={overview} />}

        {config && (
          <>
            {/* MCP 服务 */}
            <div id="section-mcp">
              <SectionHeader icon={Globe} title="MCP 服务" desc="已连接的 MCP 服务器" />
              <McpEditor overview={overview} onOverviewUpdate={setOverview} />
            </div>

            {/* MCP 市场 */}
            <div id="section-mcp-market">
              <SectionHeader icon={Link} title="MCP 市场" desc="一键安装推荐的 MCP 服务" />
              <McpMarketEmbed />
            </div>

            {/* Hooks */}
            <div id="section-hooks">
              <SectionHeader icon={Webhook} title="Hooks" desc="Claude Code 生命周期事件钩子" />
              <HooksEditor config={config} hookEvents={hookEvents} onUpdate={setConfig} />
            </div>

            {/* 插件 */}
            <div id="section-plugins">
              <SectionHeader icon={Plug} title="插件" desc="已安装的 Claude Code 插件" />
              <PluginsEditor config={config} overview={overview} onUpdate={setConfig} />
            </div>

            {/* 权限 */}
            <div id="section-permissions">
              <SectionHeader icon={Shield} title="权限" desc="工具和文件访问权限控制" />
              <PermissionsEditor config={config} onUpdate={setConfig} />
            </div>

            {/* 其他 */}
            <div id="section-other">
              <SectionHeader icon={Settings2} title="其他配置" desc="settings.json 中的其他字段" />
              <OtherEditor config={config} onUpdate={setConfig} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: "var(--accent-subtle)" }}>
        <Icon size={14} className="text-accent" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-app">{title}</h2>
        <p className="text-[10px] text-app-tertiary">{desc}</p>
      </div>
    </div>
  );
}

// ── MCP Editor ─────────────────────────────────────────────────────
function McpEditor({ overview, onOverviewUpdate }: {
  overview: ClaudeOverview | null;
  onOverviewUpdate: (o: ClaudeOverview) => void;
}) {
  const [servers, setServers] = useState<McpServer[]>(overview?.mcp_servers ?? []);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", url: "", transport: "http", scope: "user" });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (overview) setServers(overview.mcp_servers);
  }, [overview]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const list = await api.claudeConfig.listMcp();
      setServers(list);
      if (overview) onOverviewUpdate({ ...overview, mcp_servers: list });
    } finally { setRefreshing(false); }
  };

  const handleRemove = async (name: string) => {
    setRemoving(name);
    try {
      const res = await api.claudeConfig.removeMcp(name);
      setServers(res.servers);
      if (overview) onOverviewUpdate({ ...overview, mcp_servers: res.servers });
    } finally { setRemoving(null); }
  };

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.url.trim()) return;
    setAdding(true); setAddError("");
    try {
      const res = await api.claudeConfig.addMcp({
        name: addForm.name.trim(),
        url: addForm.url.trim(),
        transport: addForm.transport,
        scope: addForm.scope,
      });
      setServers(res.servers);
      if (overview) onOverviewUpdate({ ...overview, mcp_servers: res.servers });
      setAddForm({ name: "", url: "", transport: "http", scope: "user" });
      setShowAdd(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "添加失败");
    } finally { setAdding(false); }
  };

  const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    connected:  { label: "已连接", color: "#22c55e", bg: "bg-green-500/10" },
    needs_auth: { label: "需认证", color: "#f59e0b", bg: "bg-yellow-500/10" },
    error:      { label: "错误",   color: "#ef4444", bg: "bg-red-500/10" },
    unknown:    { label: "未知",   color: "#7878a8", bg: "bg-app-tertiary/20" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-app-tertiary">
          MCP (Model Context Protocol) 服务器为 Claude 提供外部工具和数据源。通过 <code className="text-accent">claude mcp add</code> 管理。
        </p>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-app text-app-secondary hover:text-app transition-colors">
            <RotateCcw size={10} className={refreshing ? "animate-spin" : ""} />
            刷新状态
          </button>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors">
            <Plus size={10} />
            添加服务器
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-app-secondary border border-accent/30 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-app">添加 MCP 服务器</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] text-app-tertiary uppercase tracking-wider block mb-1">名称</label>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="my-server" spellCheck={false}
                className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
            </div>
            <div>
              <label className="text-[9px] text-app-tertiary uppercase tracking-wider block mb-1">URL</label>
              <input value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://mcp.example.com/mcp" spellCheck={false}
                className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
            </div>
            <div>
              <label className="text-[9px] text-app-tertiary uppercase tracking-wider block mb-1">传输协议</label>
              <select value={addForm.transport} onChange={e => setAddForm(f => ({ ...f, transport: e.target.value }))}
                className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] text-app outline-none focus:border-accent/60">
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="stdio">Stdio</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-app-tertiary uppercase tracking-wider block mb-1">作用域</label>
              <select value={addForm.scope} onChange={e => setAddForm(f => ({ ...f, scope: e.target.value }))}
                className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] text-app outline-none focus:border-accent/60">
                <option value="user">全局 (user)</option>
                <option value="project">项目 (project)</option>
              </select>
            </div>
          </div>
          {addError && <p className="text-[11px] text-red-400">{addError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !addForm.name.trim() || !addForm.url.trim()}
              className={cn("flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-md font-medium transition-all",
                addForm.name.trim() && addForm.url.trim()
                  ? "bg-accent hover:bg-accent-hover text-white"
                  : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
              {adding ? "添加中..." : "添加"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddError(""); }}
              className="text-[11px] text-app-tertiary hover:text-app px-3 py-1.5">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Server list */}
      {servers.length === 0 ? (
        <div className="text-center py-8 text-app-tertiary text-xs">
          <Unplug size={24} className="mx-auto mb-2 opacity-30" />
          暂无 MCP 服务器
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {servers.map(s => {
            const sm = STATUS_META[s.status] ?? STATUS_META.unknown;
            return (
              <div key={s.name}
                className="bg-app-secondary border border-app rounded-xl px-4 py-3 flex items-center gap-3">
                {/* Status dot */}
                <div className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: sm.color, boxShadow: s.status === "connected" ? `0 0 6px ${sm.color}60` : undefined }} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-app">{s.name}</span>
                    <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", sm.bg)}
                      style={{ color: sm.color }}>
                      {sm.label}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-app-tertiary/20 text-app-tertiary font-mono">
                      {s.transport}
                    </span>
                  </div>
                  {s.url && (
                    <div className="flex items-center gap-1 mt-1">
                      <Link size={9} className="text-app-tertiary shrink-0" />
                      <span className="text-[10px] font-mono text-app-tertiary truncate">{s.url}</span>
                    </div>
                  )}
                </div>

                {/* Remove */}
                <button onClick={() => handleRemove(s.name)} disabled={removing === s.name}
                  className="text-app-tertiary hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-500/10"
                  title="移除服务器">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hooks Editor ───────────────────────────────────────────────────
function HooksEditor({ config, hookEvents, onUpdate }: {
  config: ClaudeConfig;
  hookEvents: string[];
  onUpdate: (c: ClaudeConfig) => void;
}) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, HookRule[]>>({});

  const getEditRules = (event: string): HookRule[] =>
    editState[event] ?? config.hooks[event] ?? [];

  const setEditRules = (event: string, rules: HookRule[]) =>
    setEditState(prev => ({ ...prev, [event]: rules }));

  const isDirty = (event: string) => {
    const edited = editState[event];
    if (!edited) return false;
    return JSON.stringify(edited) !== JSON.stringify(config.hooks[event] ?? []);
  };

  const handleSave = async (event: string) => {
    setSaving(event);
    try {
      const updated = await api.claudeConfig.updateHooks(event, getEditRules(event));
      onUpdate(updated);
      setEditState(prev => { const n = { ...prev }; delete n[event]; return n; });
    } finally { setSaving(null); }
  };

  const handleDelete = async (event: string) => {
    setSaving(event);
    try {
      const updated = await api.claudeConfig.deleteHookEvent(event);
      onUpdate(updated);
      setEditState(prev => { const n = { ...prev }; delete n[event]; return n; });
    } finally { setSaving(null); }
  };

  const addRule = (event: string) => {
    const rules = [...getEditRules(event)];
    rules.push({ matcher: "", hooks: [{ type: "command", command: "", timeout: 5 }] });
    setEditRules(event, rules);
    setExpandedEvent(event);
  };

  const removeRule = (event: string, ruleIdx: number) => {
    setEditRules(event, getEditRules(event).filter((_, i) => i !== ruleIdx));
  };

  const updateRule = (event: string, ruleIdx: number, field: "matcher", value: string) => {
    const rules = [...getEditRules(event)];
    rules[ruleIdx] = { ...rules[ruleIdx], [field]: value };
    setEditRules(event, rules);
  };

  const addHookEntry = (event: string, ruleIdx: number) => {
    const rules = [...getEditRules(event)];
    rules[ruleIdx] = {
      ...rules[ruleIdx],
      hooks: [...rules[ruleIdx].hooks, { type: "command", command: "", timeout: 5 }],
    };
    setEditRules(event, rules);
  };

  const removeHookEntry = (event: string, ruleIdx: number, hookIdx: number) => {
    const rules = [...getEditRules(event)];
    rules[ruleIdx] = {
      ...rules[ruleIdx],
      hooks: rules[ruleIdx].hooks.filter((_, i) => i !== hookIdx),
    };
    setEditRules(event, rules);
  };

  const updateHookEntry = (event: string, ruleIdx: number, hookIdx: number, updates: Partial<HookEntry>) => {
    const rules = [...getEditRules(event)];
    const hooksCopy = [...rules[ruleIdx].hooks];
    hooksCopy[hookIdx] = { ...hooksCopy[hookIdx], ...updates };
    rules[ruleIdx] = { ...rules[ruleIdx], hooks: hooksCopy };
    setEditRules(event, rules);
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-app-tertiary mb-3">
        Hook 在 Claude Code 事件触发时执行外部命令。每个事件可配置多个规则，每个规则可包含 matcher（工具名过滤）和多个命令。
      </p>

      {hookEvents.map(event => {
        const meta = EVENT_LABELS[event] ?? { label: event, desc: "" };
        const rules = getEditRules(event);
        const hasRules = rules.length > 0;
        const expanded = expandedEvent === event;
        const dirty = isDirty(event);

        return (
          <div key={event}
            className={cn(
              "rounded-xl border overflow-hidden transition-colors",
              hasRules ? "border-app bg-app-secondary" : "border-app/50 bg-app-secondary/50"
            )}>
            <button
              onClick={() => setExpandedEvent(expanded ? null : event)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              {expanded
                ? <ChevronDown size={13} className="text-app-tertiary shrink-0" />
                : <ChevronRight size={13} className="text-app-tertiary shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-app">{meta.label}</span>
                  <span className="text-[9px] font-mono text-app-tertiary">{event}</span>
                  {hasRules && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-mono">
                      {rules.length} 规则
                    </span>
                  )}
                  {dirty && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">
                      未保存
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-app-tertiary mt-0.5">{meta.desc}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); addRule(event); }}
                className="text-app-tertiary hover:text-accent transition-colors p-1"
                title="添加规则"
              >
                <Plus size={14} />
              </button>
            </button>

            {expanded && (
              <div className="border-t border-app px-4 py-3 space-y-3">
                {rules.length === 0 && (
                  <p className="text-[11px] text-app-tertiary text-center py-3">暂无规则，点击 + 添加</p>
                )}

                {rules.map((rule, ruleIdx) => (
                  <div key={ruleIdx} className="bg-app rounded-lg border border-app/50 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-app-tertiary shrink-0 w-14">Matcher</label>
                      <input
                        value={rule.matcher}
                        onChange={e => updateRule(event, ruleIdx, "matcher", e.target.value)}
                        placeholder="* 或留空匹配全部"
                        spellCheck={false}
                        className="flex-1 bg-app-secondary border border-app rounded px-2 py-1 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60"
                      />
                      <button onClick={() => removeRule(event, ruleIdx)}
                        className="text-app-tertiary hover:text-red-400 transition-colors p-1" title="删除规则">
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {rule.hooks.map((hook, hookIdx) => (
                      <div key={hookIdx} className="flex items-center gap-2 pl-[62px]">
                        <input
                          value={hook.command}
                          onChange={e => updateHookEntry(event, ruleIdx, hookIdx, { command: e.target.value })}
                          placeholder="/path/to/script.sh"
                          spellCheck={false}
                          className="flex-1 bg-app-secondary border border-app rounded px-2 py-1 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60"
                        />
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] text-app-tertiary">超时</label>
                          <input
                            type="number" value={hook.timeout}
                            onChange={e => updateHookEntry(event, ruleIdx, hookIdx, { timeout: parseInt(e.target.value) || 5 })}
                            className="w-10 bg-app-secondary border border-app rounded px-1.5 py-1 text-[11px] font-mono text-app text-center outline-none focus:border-accent/60"
                            min={1} max={60}
                          />
                          <span className="text-[9px] text-app-tertiary">s</span>
                        </div>
                        <button onClick={() => removeHookEntry(event, ruleIdx, hookIdx)}
                          className="text-app-tertiary hover:text-red-400 transition-colors p-1" title="删除命令">
                          <X size={11} />
                        </button>
                      </div>
                    ))}

                    <button onClick={() => addHookEntry(event, ruleIdx)}
                      className="ml-[62px] text-[10px] text-app-tertiary hover:text-accent transition-colors flex items-center gap-1">
                      <Plus size={10} /> 添加命令
                    </button>
                  </div>
                ))}

                {hasRules && (
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => handleSave(event)} disabled={!dirty || saving === event}
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium transition-all",
                        dirty ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed"
                      )}>
                      <Save size={11} />
                      {saving === event ? "保存中..." : "保存"}
                    </button>
                    <button onClick={() => handleDelete(event)} disabled={saving === event}
                      className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors">
                      <Trash2 size={11} />
                      清除全部
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Plugins Editor ─────────────────────────────────────────────────
function PluginsEditor({ config, overview, onUpdate }: {
  config: ClaudeConfig;
  overview: ClaudeOverview | null;
  onUpdate: (c: ClaudeConfig) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [newPluginId, setNewPluginId] = useState("");

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    setSaving(pluginId);
    try { onUpdate(await api.claudeConfig.togglePlugin(pluginId, enabled)); }
    finally { setSaving(null); }
  };

  const handleRemove = async (pluginId: string) => {
    setSaving(pluginId);
    try { onUpdate(await api.claudeConfig.removePlugin(pluginId)); }
    finally { setSaving(null); }
  };

  const handleAdd = async () => {
    const id = newPluginId.trim();
    if (!id) return;
    setSaving(id);
    try { onUpdate(await api.claudeConfig.togglePlugin(id, true)); setNewPluginId(""); }
    finally { setSaving(null); }
  };

  const plugins = Object.entries(config.enabled_plugins);
  // Merge install info from overview
  const installMap = new Map(
    (overview?.installed_plugins ?? []).map(p => [p.plugin_id, p])
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-app-tertiary mb-3">
        管理 Claude Code 插件的启用状态。下方同时显示已安装插件的版本和路径信息。
      </p>

      {plugins.length === 0 && (
        <div className="text-center py-6 text-app-tertiary text-xs">暂无已配置的插件</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      {plugins.map(([pluginId, enabled]) => {
        const inst = installMap.get(pluginId);
        const [name, publisher] = pluginId.includes("@") ? pluginId.split("@") : [pluginId, ""];
        return (
          <div key={pluginId}
            className="bg-app-secondary border border-app rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <button onClick={() => handleToggle(pluginId, !enabled)} disabled={saving === pluginId}
                className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0",
                  enabled ? "bg-accent" : "bg-app-tertiary/40")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-app">{name}</span>
                  {publisher && <span className="text-[9px] text-app-tertiary font-mono">@{publisher}</span>}
                </div>
              </div>

              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full",
                enabled ? "bg-green-500/10 text-green-400" : "bg-app-tertiary/20 text-app-tertiary")}>
                {enabled ? "已启用" : "已禁用"}
              </span>

              <button onClick={() => handleRemove(pluginId)} disabled={saving === pluginId}
                className="text-app-tertiary hover:text-red-400 transition-colors p-1">
                <Trash2 size={13} />
              </button>
            </div>

            {/* Install details */}
            {inst && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-12 text-[9px] font-mono text-app-tertiary">
                <span>版本: <span className="text-app-secondary">{inst.version}</span></span>
                <span>安装: <span className="text-app-secondary">{inst.installed_at.slice(0, 10)}</span></span>
                <span>更新: <span className="text-app-secondary">{inst.last_updated.slice(0, 10)}</span></span>
                {inst.git_commit && (
                  <span>commit: <span className="text-app-secondary">{inst.git_commit.slice(0, 8)}</span></span>
                )}
                <span className="text-app-tertiary/60 truncate max-w-[300px]" title={inst.install_path}>
                  {inst.install_path}
                </span>
              </div>
            )}
          </div>
        );
      })}
      </div>

      <div className="flex gap-2 pt-2">
        <input value={newPluginId} onChange={e => setNewPluginId(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="输入插件 ID，例如 my-skill@publisher" spellCheck={false}
          className="flex-1 bg-app-secondary border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60"
        />
        <button onClick={handleAdd} disabled={!newPluginId.trim()}
          className={cn("flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg font-medium transition-all",
            newPluginId.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
          <Plus size={12} /> 添加
        </button>
      </div>
    </div>
  );
}

// ── Permissions Editor ─────────────────────────────────────────────
function PermissionsEditor({ config, onUpdate }: {
  config: ClaudeConfig;
  onUpdate: (c: ClaudeConfig) => void;
}) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config.permissions, null, 2));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [parseError, setParseError] = useState("");

  useEffect(() => {
    setJsonText(JSON.stringify(config.permissions, null, 2));
  }, [config.permissions]);

  const handleSave = async () => {
    let parsed;
    try { parsed = JSON.parse(jsonText); }
    catch { setParseError("JSON 格式错误"); setStatus("error"); return; }
    setParseError(""); setSaving(true);
    try {
      onUpdate(await api.claudeConfig.updatePermissions(parsed));
      setStatus("ok"); setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "保存失败"); setStatus("error");
    } finally { setSaving(false); }
  };

  const isDirty = jsonText !== JSON.stringify(config.permissions, null, 2);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-app-tertiary mb-3">
        权限配置控制 Claude Code 的工具调用权限。直接编辑 JSON 格式。
      </p>
      <textarea value={jsonText}
        onChange={e => { setJsonText(e.target.value); setStatus("idle"); setParseError(""); }}
        spellCheck={false}
        rows={Math.max(6, jsonText.split("\n").length + 1)}
        className={cn(
          "w-full bg-app-secondary border rounded-xl px-4 py-3 text-[11px] font-mono text-app outline-none resize-y leading-relaxed",
          status === "error" ? "border-red-500/40" : "border-app focus:border-accent/60"
        )}
      />
      {parseError && <p className="text-[11px] text-red-400">{parseError}</p>}
      <button onClick={handleSave} disabled={!isDirty || saving}
        className={cn("flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium transition-all",
          isDirty ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
        {status === "ok" ? <Check size={11} /> : <Save size={11} />}
        {saving ? "保存中..." : status === "ok" ? "已保存" : "保存权限"}
      </button>
    </div>
  );
}

// ── Other Config Editor ────────────────────────────────────────────
function OtherEditor({ config, onUpdate }: {
  config: ClaudeConfig;
  onUpdate: (c: ClaudeConfig) => void;
}) {
  const entries = Object.entries(config.other);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleSave = async (key: string, rawValue: string) => {
    let value: unknown;
    try { value = JSON.parse(rawValue); } catch { value = rawValue; }
    setSaving(key);
    try {
      onUpdate(await api.claudeConfig.updateOther(key, value));
      setEditValues(prev => { const n = { ...prev }; delete n[key]; return n; });
    } finally { setSaving(null); }
  };

  const handleDelete = async (key: string) => {
    setSaving(key);
    try { onUpdate(await api.claudeConfig.deleteOther(key)); }
    finally { setSaving(null); }
  };

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    let value: unknown;
    try { value = JSON.parse(newValue); } catch { value = newValue; }
    setSaving(newKey);
    try {
      onUpdate(await api.claudeConfig.updateOther(newKey.trim(), value));
      setNewKey(""); setNewValue("");
    } finally { setSaving(null); }
  };

  const formatValue = (v: unknown): string =>
    typeof v === "string" ? v : JSON.stringify(v, null, 2);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-app-tertiary mb-3">
        hooks / enabledPlugins / permissions 之外的其他顶层配置字段。
      </p>

      {entries.length === 0 && (
        <div className="text-center py-6 text-app-tertiary text-xs">暂无其他配置项</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      {entries.map(([key, value]) => {
        const displayValue = editValues[key] ?? formatValue(value);
        const isDirty = editValues[key] !== undefined && editValues[key] !== formatValue(value);
        const isBool = typeof value === "boolean";

        return (
          <div key={key} className="bg-app-secondary border border-app rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold font-mono text-app">{key}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-app-tertiary font-mono">{typeof value}</span>
                <button onClick={() => handleDelete(key)} disabled={saving === key}
                  className="text-app-tertiary hover:text-red-400 transition-colors p-1">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {isBool ? (
              <div className="flex items-center gap-2">
                <button onClick={() => handleSave(key, String(!value))} disabled={saving === key}
                  className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0",
                    value ? "bg-accent" : "bg-app-tertiary/40")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    value ? "translate-x-[18px]" : "translate-x-0.5")} />
                </button>
                <span className="text-[11px] font-mono text-app-secondary">{String(value)}</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <textarea value={displayValue}
                  onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                  spellCheck={false}
                  rows={Math.min(6, displayValue.split("\n").length + 1)}
                  className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none resize-y focus:border-accent/60"
                />
                {isDirty && (
                  <button onClick={() => handleSave(key, displayValue)} disabled={saving === key}
                    className="flex items-center gap-1 text-[10px] bg-accent hover:bg-accent-hover text-white px-2.5 py-1 rounded-md transition-colors">
                    <Save size={10} /> 保存
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>

      <div className="border border-dashed border-app rounded-xl px-4 py-3 space-y-2">
        <p className="text-[10px] text-app-tertiary font-medium">添加新配置项</p>
        <div className="flex gap-2">
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="配置键名" spellCheck={false}
            className="w-40 bg-app-secondary border border-app rounded-lg px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60"
          />
          <input value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="值（支持 JSON 或字符串）" spellCheck={false}
            className="flex-1 bg-app-secondary border border-app rounded-lg px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60"
          />
          <button onClick={handleAdd} disabled={!newKey.trim()}
            className={cn("flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all",
              newKey.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
            <Plus size={12} /> 添加
          </button>
        </div>
      </div>
    </div>
  );
}

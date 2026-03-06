// frontend/src/pages/ClaudeConfig.tsx
// Claude Code 配置中心 —— 侧边栏导航 + 右侧滚动内容区（scroll-spy）
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  api,
  type ClaudeConfig,
  type ClaudeOverview,
  type HookRule,
  type HookEntry,
  type McpServer,
  type SkillDetail,
  type CommandInfo,
  type RuleInfo,
  type AgentInfo,
  type ClaudeSystemInfo,
} from "../lib/api";
import { cn } from "../lib/utils";
import McpMarketEmbed from "./McpMarket";
import GlobalConfigPanel from "../components/GlobalConfigPanel";
import {
  Globe,
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
  Link,
  Unplug,
  Cpu,
  FileText,
  BookOpen,
  Activity,
  Info,
  Search,
  Variable,
  Bot,
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

// ── 常用设置项定义 ──────────────────────────────────────────────────
const COMMON_SETTINGS: {
  key: string; label: string; desc: string;
  type: "string" | "boolean" | "number" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string; group?: string;
}[] = [
  { key: "model", label: "默认模型", desc: "别名或完整模型名", type: "select", options: [
    { value: "", label: "default（按订阅层级）" },
    { value: "opus", label: "opus — Opus 4.6" },
    { value: "sonnet", label: "sonnet — Sonnet 4.6" },
    { value: "haiku", label: "haiku — Haiku 4.5" },
    { value: "opusplan", label: "opusplan — 计划 Opus + 执行 Sonnet" },
    { value: "sonnet[1m]", label: "sonnet[1m] — 100万上下文" },
    { value: "claude-opus-4-6", label: "claude-opus-4-6（固定版本）" },
    { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6（固定版本）" },
    { value: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5（固定版本）" },
  ], placeholder: "opus / sonnet", group: "model" },
  { key: "effortLevel", label: "努力级别", desc: "low=快速, medium=默认, high=深度推理", type: "select", options: [
    { value: "", label: "默认" }, { value: "low", label: "low" }, { value: "medium", label: "medium" }, { value: "high", label: "high" },
  ], group: "model" },
  { key: "language", label: "响应语言", desc: "Claude 响应语言", type: "string", placeholder: "chinese", group: "behavior" },
  { key: "outputStyle", label: "输出风格", desc: "系统提示输出样式", type: "string", placeholder: "Concise", group: "behavior" },
  { key: "alwaysThinkingEnabled", label: "始终扩展思考", desc: "默认启用 Extended Thinking", type: "boolean", group: "behavior" },
  { key: "showTurnDuration", label: "显示轮次耗时", desc: "响应后显示耗时", type: "boolean", group: "behavior" },
  { key: "cleanupPeriodDays", label: "会话清理（天）", desc: "非活跃会话清理周期", type: "number", placeholder: "30", group: "session" },
  { key: "plansDirectory", label: "计划文件目录", desc: "计划文件存储位置", type: "string", placeholder: "./plans", group: "session" },
  { key: "forceLoginMethod", label: "强制登录方式", desc: "限制登录方式", type: "select", options: [
    { value: "", label: "不限制" }, { value: "claudeai", label: "claudeai" }, { value: "console", label: "console" },
  ], group: "security" },
  { key: "autoUpdatesChannel", label: "更新频道", desc: "stable / latest", type: "select", options: [
    { value: "", label: "默认 (latest)" }, { value: "latest", label: "latest" }, { value: "stable", label: "stable" },
  ], group: "ui" },
  { key: "spinnerTipsEnabled", label: "微调器提示", desc: "工作时显示操作提示", type: "boolean", group: "ui" },
  { key: "terminalProgressBarEnabled", label: "终端进度条", desc: "支持的终端显示进度条", type: "boolean", group: "ui" },
  { key: "prefersReducedMotion", label: "减少动画", desc: "减少 UI 动画", type: "boolean", group: "ui" },
  { key: "respectGitignore", label: "遵守 .gitignore", desc: "排除 .gitignore 匹配文件", type: "boolean", group: "ui" },
  { key: "includeCoAuthoredBy", label: "Git 署名", desc: "提交中包含 Co-authored-by", type: "boolean", group: "ui" },
  { key: "enableAllProjectMcpServers", label: "自动批准项目 MCP", desc: "自动批准 .mcp.json 中的 MCP", type: "boolean", group: "advanced" },
  { key: "fastModePerSessionOptIn", label: "快速模式按会话", desc: "每会话手动 /fast 启用", type: "boolean", group: "advanced" },
  { key: "teammateMode", label: "Agent Teams 模式", desc: "队友显示方式", type: "select", options: [
    { value: "", label: "默认 (auto)" }, { value: "auto", label: "auto" }, { value: "in-process", label: "in-process" }, { value: "tmux", label: "tmux" },
  ], group: "advanced" },
];
const COMMON_SETTING_KEYS = new Set(COMMON_SETTINGS.map(s => s.key));

// ── Section 定义 ─────────────────────────────────────────────────────
type SectionId = "global" | "model" | "skills" | "agents" | "commands" | "mcp" | "mcp-market" | "hooks" | "rules" | "permissions" | "env" | "plugins" | "monitoring" | "about";

const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "global", label: "全局", icon: Settings2 },
  { id: "model", label: "模型", icon: Cpu },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "commands", label: "Commands", icon: Terminal },
  { id: "mcp", label: "MCP", icon: Globe },
  { id: "mcp-market", label: "MCP 市场", icon: Link },
  { id: "hooks", label: "Hooks", icon: Webhook },
  { id: "rules", label: "Rules", icon: BookOpen },
  { id: "permissions", label: "权限", icon: Shield },
  { id: "env", label: "环境变量", icon: Variable },
  { id: "plugins", label: "插件", icon: Plug },
  { id: "monitoring", label: "监控", icon: Activity },
  { id: "about", label: "关于", icon: Info },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── localStorage cache ──────────────────────────────────────────────
const CACHE_KEY_CONFIG = "tc_claude_config_cache";
const CACHE_KEY_OVERVIEW = "tc_claude_overview_cache";
function readCache<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function ClaudeConfigPage() {
  const [config, setConfig] = useState<ClaudeConfig | null>(() => readCache(CACHE_KEY_CONFIG));
  const [overview, setOverview] = useState<ClaudeOverview | null>(() => readCache(CACHE_KEY_OVERVIEW));
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(!readCache(CACHE_KEY_CONFIG));
  const [error, setError] = useState("");

  // Extra data
  const [skills, setSkills] = useState<SkillDetail[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<ClaudeSystemInfo | null>(null);
  const [claudeMd, setClaudeMd] = useState("");

  // Scroll-spy
  const [activeSection, setActiveSection] = useState<SectionId>("global");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    if (!config) setLoading(true);
    setError("");
    try {
      const [cfg, events, ov] = await Promise.all([
        api.claudeConfig.get(),
        api.claudeConfig.hookEvents(),
        api.claudeConfig.overview(),
      ]);
      setConfig(cfg); setHookEvents(events); setOverview(ov);
      writeCache(CACHE_KEY_CONFIG, cfg); writeCache(CACHE_KEY_OVERVIEW, ov);
    } catch (e) {
      if (!config) setError(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
    // Non-blocking extras
    api.claudeConfig.listSkills().then(setSkills).catch(() => {});
    api.claudeConfig.listAgents().then(setAgents).catch(() => {});
    api.claudeConfig.listCommands().then(setCommands).catch(() => {});
    api.claudeConfig.listRules().then(setRules).catch(() => {});
    api.claudeConfig.systemInfo().then(setSystemInfo).catch(() => {});
    api.claudeConfig.getClaudeMd().then(r => setClaudeMd(r.content)).catch(() => {});
  }, [config]);

  useEffect(() => { load(); }, [load]);

  // Scroll-spy observer
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        let topId: SectionId | null = null;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            if (rect.top < topY) { topY = rect.top; topId = entry.target.getAttribute("data-section") as SectionId; }
          }
        }
        if (topId) setActiveSection(topId);
      },
      { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );
    for (const el of Object.values(sectionRefs.current)) { if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, [config, overview]); // re-observe when data loads

  const scrollToSection = (id: SectionId) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Section badge counts
  const sectionCounts: Partial<Record<SectionId, number>> = useMemo(() => ({
    skills: skills.length,
    agents: agents.length,
    commands: commands.length,
    mcp: overview?.mcp_servers.length,
    hooks: config ? Object.keys(config.hooks).length : undefined,
    rules: rules.length,
    plugins: config ? Object.keys(config.enabled_plugins).length : undefined,
  }), [skills, agents, commands, overview, config, rules]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶栏 */}
      <div className="shrink-0 px-6 pt-4 pb-2 flex items-center gap-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex-1">
          <h1 className="text-[15px] font-bold text-app">Claude Code 配置中心</h1>
          <p className="text-[10px] text-app-tertiary font-mono">
            {overview?.home_path || "~/.claude"} · {overview?.cli_version || "..."}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg border border-app text-app-tertiary hover:text-app transition-colors">
          <RotateCcw size={11} /> 刷新
        </button>
      </div>

      {/* 主区域：侧边栏 + 内容 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 侧边栏 */}
        <div className="w-44 shrink-0 overflow-y-auto py-3 px-2 space-y-0.5" style={{ borderRight: "1px solid var(--border)" }}>
          {SECTIONS.map(sec => {
            const Icon = sec.icon;
            const count = sectionCounts[sec.id];
            const active = activeSection === sec.id;
            return (
              <button key={sec.id} onClick={() => scrollToSection(sec.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-all text-left",
                  active
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-app-tertiary hover:text-app-secondary hover:bg-white/[0.03]"
                )}>
                <Icon size={13} />
                <span className="flex-1">{sec.label}</span>
                {count !== undefined && count > 0 && (
                  <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full",
                    active ? "bg-accent/20 text-accent" : "bg-app-tertiary/20 text-app-tertiary")}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 内容区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-10">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-xs text-red-400">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {loading && !config && (
            <div className="flex items-center justify-center h-40">
              <p className="text-app-tertiary text-xs animate-pulse">加载配置信息...</p>
            </div>
          )}

          {/* 全局 */}
          <div ref={el => { sectionRefs.current["global"] = el; }} data-section="global">
            <SectionGlobal config={config} overview={overview} onUpdate={setConfig}
              claudeMd={claudeMd} onClaudeMdChange={setClaudeMd} />
          </div>

          {/* 模型 */}
          <div ref={el => { sectionRefs.current["model"] = el; }} data-section="model">
            <SectionModel />
          </div>

          {/* Skills */}
          <div ref={el => { sectionRefs.current["skills"] = el; }} data-section="skills">
            <SectionSkills skills={skills} onToggle={async (name, enabled) => {
              await api.claudeConfig.toggleSkill(name, enabled);
              setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled } : s));
            }} />
          </div>

          {/* Agents */}
          <div ref={el => { sectionRefs.current["agents"] = el; }} data-section="agents">
            <SectionAgents agents={agents} onToggle={async (name, enabled) => {
              await api.claudeConfig.toggleAgent(name, enabled);
              setAgents(prev => prev.map(a => a.name === name ? { ...a, enabled } : a));
            }} />
          </div>

          {/* Commands */}
          <div ref={el => { sectionRefs.current["commands"] = el; }} data-section="commands">
            <SectionCommands commands={commands} onToggle={async (name, enabled) => {
              await api.claudeConfig.toggleCommand(name, enabled);
              setCommands(prev => prev.map(c => c.name === name ? { ...c, enabled } : c));
            }} />
          </div>

          {/* MCP */}
          <div ref={el => { sectionRefs.current["mcp"] = el; }} data-section="mcp">
            <SectionMcp overview={overview} onOverviewUpdate={setOverview} />
          </div>

          {/* MCP 市场 */}
          <div ref={el => { sectionRefs.current["mcp-market"] = el; }} data-section="mcp-market">
            <McpMarketEmbed />
          </div>

          {/* Hooks */}
          <div ref={el => { sectionRefs.current["hooks"] = el; }} data-section="hooks">
            {config && <SectionHooks config={config} hookEvents={hookEvents} onUpdate={setConfig} />}
          </div>

          {/* Rules */}
          <div ref={el => { sectionRefs.current["rules"] = el; }} data-section="rules">
            <SectionRules rules={rules} onToggle={async (name, enabled) => {
              await api.claudeConfig.toggleRule(name, enabled);
              setRules(prev => prev.map(r => r.name === name ? { ...r, enabled } : r));
            }} />
          </div>

          {/* 权限 */}
          <div ref={el => { sectionRefs.current["permissions"] = el; }} data-section="permissions">
            {config && <SectionPermissions config={config} onUpdate={setConfig} />}
          </div>

          {/* 环境变量 */}
          <div ref={el => { sectionRefs.current["env"] = el; }} data-section="env">
            <SectionEnvVars />
          </div>

          {/* 插件 */}
          <div ref={el => { sectionRefs.current["plugins"] = el; }} data-section="plugins">
            {config && <SectionPlugins config={config} overview={overview} onUpdate={setConfig} />}
          </div>

          {/* 监控 */}
          <div ref={el => { sectionRefs.current["monitoring"] = el; }} data-section="monitoring">
            {overview && <SectionMonitoring overview={overview} />}
          </div>

          {/* 关于 */}
          <div ref={el => { sectionRefs.current["about"] = el; }} data-section="about">
            <SectionAbout systemInfo={systemInfo} overview={overview} />
          </div>

          {/* 底部留白 */}
          <div className="h-40" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: 全局配置
// ═══════════════════════════════════════════════════════════════════
function SectionGlobal({ config, overview, onUpdate, claudeMd, onClaudeMdChange }: {
  config: ClaudeConfig | null; overview: ClaudeOverview | null;
  onUpdate: (c: ClaudeConfig) => void;
  claudeMd: string; onClaudeMdChange: (s: string) => void;
}) {
  const [mdSaving, setMdSaving] = useState(false);
  const [mdSaved, setMdSaved] = useState(false);

  const handleSaveMd = async () => {
    setMdSaving(true);
    try {
      await api.claudeConfig.updateClaudeMd(claudeMd);
      setMdSaved(true); setTimeout(() => setMdSaved(false), 2000);
    } finally { setMdSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={Settings2} color="var(--accent)" label="全局配置" desc="概览与常用设置" />

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "CLI 版本", value: overview.cli_version, Icon: Terminal, color: "var(--accent)" },
            { label: "总消息", value: fmtNum(overview.total_messages), Icon: MessageSquare, color: "#22c55e" },
            { label: "工具调用", value: fmtNum(overview.total_tool_calls), Icon: Wrench, color: "#f59e0b" },
            { label: "会话数", value: fmtNum(overview.total_sessions), Icon: Users, color: "#38bdf8" },
            { label: "活跃天数", value: String(overview.active_days), Icon: Calendar, color: "#a78bfa" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-app-secondary border border-app rounded-xl px-3 py-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, ${color}, transparent 60%)` }} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-widest font-semibold text-app-tertiary">{label}</span>
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                  <Icon size={12} style={{ color }} />
                </div>
              </div>
              <p className="text-lg font-bold tabular-nums text-app leading-none">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Activity chart */}
      {overview && overview.daily_activity.length > 0 && (
        <div className="bg-app-secondary border border-app rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={13} className="text-app-tertiary" />
            <span className="text-xs font-semibold text-app">每日活动</span>
            <span className="text-[9px] text-app-tertiary font-mono ml-auto">{overview.first_active_day} ~ {overview.last_active_day}</span>
          </div>
          <ActivityChart data={overview.daily_activity} />
        </div>
      )}

      {/* 全局 CLAUDE.md */}
      <div className="bg-app-secondary border border-app rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={13} className="text-accent" />
            <span className="text-xs font-semibold text-app">全局 CLAUDE.md</span>
            <span className="text-[9px] text-app-tertiary font-mono">~/.claude/CLAUDE.md</span>
          </div>
          <button onClick={handleSaveMd} disabled={mdSaving}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors">
            {mdSaved ? <Check size={10} /> : <Save size={10} />}
            {mdSaving ? "保存中..." : mdSaved ? "已保存" : "保存"}
          </button>
        </div>
        <textarea value={claudeMd} onChange={e => onClaudeMdChange(e.target.value)}
          spellCheck={false} rows={8}
          className="w-full bg-app border border-app rounded-lg px-4 py-3 text-[11px] font-mono text-app outline-none resize-y leading-relaxed focus:border-accent/60" />
      </div>

      {/* 常用设置 */}
      {config && <CommonSettingsGrid config={config} onUpdate={onUpdate} />}

      {/* 其他配置字段 */}
      {config && <OtherFieldsGrid config={config} onUpdate={onUpdate} />}
    </div>
  );
}

// ── Section 标题组件 ─────────────────────────────────────────────────
function SectionTitle({ icon: Icon, color, label, desc }: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string; label: string; desc: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-1">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-app">{label}</h2>
        <p className="text-[10px] text-app-tertiary">{desc}</p>
      </div>
    </div>
  );
}

// ── Activity Chart ──────────────────────────────────────────────────
function ActivityChart({ data }: { data: ClaudeOverview["daily_activity"] }) {
  const recent = useMemo(() => data.slice(-60), [data]);
  const maxMsg = useMemo(() => Math.max(1, ...recent.map(d => d.message_count)), [recent]);
  const maxTool = useMemo(() => Math.max(1, ...recent.map(d => d.tool_call_count)), [recent]);
  if (recent.length === 0) return <div className="text-[10px] text-app-tertiary text-center py-6">暂无</div>;
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
              <rect x={x} y={H - msgH} width={barW} height={msgH} rx={1} fill={isToday ? "#22c55e" : "#4477ff"} opacity={0.7} />
              <rect x={x} y={H - toolH} width={barW} height={toolH} rx={1} fill={isToday ? "#86efac" : "#f59e0b"} opacity={0.5} />
              {i % 7 === 0 && <text x={x + barW / 2} y={H + 12} textAnchor="middle" fill="var(--text-tertiary)" fontSize="6" fontFamily="monospace">{d.date.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1.5">
        <div className="flex items-center gap-1.5 text-[9px] text-app-tertiary"><div className="w-2 h-2 rounded-sm" style={{ background: "#4477ff", opacity: 0.7 }} />消息</div>
        <div className="flex items-center gap-1.5 text-[9px] text-app-tertiary"><div className="w-2 h-2 rounded-sm" style={{ background: "#f59e0b", opacity: 0.5 }} />工具调用</div>
      </div>
    </div>
  );
}

// ── 常用设置网格（展开，不折叠） ─────────────────────────────────────
function CommonSettingsGrid({ config, onUpdate }: { config: ClaudeConfig; onUpdate: (c: ClaudeConfig) => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const getValue = (key: string): unknown => config.other[key];

  const handleChange = async (key: string, value: unknown) => {
    setSaving(key);
    try {
      if (value === "" || value === undefined) onUpdate(await api.claudeConfig.deleteOther(key));
      else onUpdate(await api.claudeConfig.updateOther(key, value));
    } finally { setSaving(null); }
  };

  const GROUP_LABELS: Record<string, string> = {
    model: "模型配置", behavior: "行为与输出", session: "会话管理",
    security: "登录与安全", ui: "界面与体验", advanced: "高级选项",
  };

  const groups = useMemo(() => {
    const map = new Map<string, typeof COMMON_SETTINGS>();
    for (const s of COMMON_SETTINGS) { const g = s.group || "other"; if (!map.has(g)) map.set(g, []); map.get(g)!.push(s); }
    return map;
  }, []);

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([groupId, settings]) => (
        <div key={groupId}>
          <p className="text-[11px] font-semibold text-app-secondary uppercase tracking-wider mb-3">{GROUP_LABELS[groupId] || groupId}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {settings.map(setting => {
              const current = getValue(setting.key);
              return (
                <div key={setting.key} className="bg-app-secondary border border-app rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div><p className="text-xs font-medium text-app">{setting.label}</p><p className="text-[10px] text-app-tertiary">{setting.desc}</p></div>
                    {setting.type === "boolean" && (
                      <button onClick={() => handleChange(setting.key, !(current === true))} disabled={saving === setting.key}
                        className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", current === true ? "bg-accent" : "bg-app-tertiary/40")}>
                        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", current === true ? "translate-x-[18px]" : "translate-x-0.5")} />
                      </button>
                    )}
                  </div>
                  {setting.type === "select" && (
                    <select value={typeof current === "string" ? current : ""} onChange={e => handleChange(setting.key, e.target.value || undefined)} disabled={saving === setting.key}
                      className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60 cursor-pointer">
                      {setting.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {setting.type === "string" && (
                    <input value={typeof current === "string" ? current : ""} onChange={e => handleChange(setting.key, e.target.value || undefined)}
                      placeholder={setting.placeholder} disabled={saving === setting.key} spellCheck={false}
                      className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                  )}
                  {setting.type === "number" && (
                    <input type="number" value={typeof current === "number" ? current : ""} onChange={e => handleChange(setting.key, e.target.value ? Number(e.target.value) : undefined)}
                      placeholder={setting.placeholder} disabled={saving === setting.key}
                      className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                  )}
                  <p className="text-[9px] font-mono text-app-tertiary/60 mt-1.5">settings.json → <span className="text-accent/60">{setting.key}</span></p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 其他配置字段 ─────────────────────────────────────────────────────
function OtherFieldsGrid({ config, onUpdate }: { config: ClaudeConfig; onUpdate: (c: ClaudeConfig) => void }) {
  const entries = Object.entries(config.other).filter(([key]) => !COMMON_SETTING_KEYS.has(key));
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleSave = async (key: string, rawValue: string) => {
    let value: unknown; try { value = JSON.parse(rawValue); } catch { value = rawValue; }
    setSaving(key);
    try { onUpdate(await api.claudeConfig.updateOther(key, value)); setEditValues(prev => { const n = { ...prev }; delete n[key]; return n; }); }
    finally { setSaving(null); }
  };
  const handleDelete = async (key: string) => { setSaving(key); try { onUpdate(await api.claudeConfig.deleteOther(key)); } finally { setSaving(null); } };
  const handleAdd = async () => {
    if (!newKey.trim()) return;
    let value: unknown; try { value = JSON.parse(newValue); } catch { value = newValue; }
    setSaving(newKey); try { onUpdate(await api.claudeConfig.updateOther(newKey.trim(), value)); setNewKey(""); setNewValue(""); } finally { setSaving(null); }
  };
  const formatValue = (v: unknown): string => typeof v === "string" ? v : JSON.stringify(v, null, 2);

  if (entries.length === 0 && !newKey) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-app-secondary uppercase tracking-wider mb-3">其他配置字段</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                  <button onClick={() => handleDelete(key)} disabled={saving === key} className="text-app-tertiary hover:text-red-400 transition-colors p-1"><Trash2 size={12} /></button>
                </div>
              </div>
              {isBool ? (
                <button onClick={() => handleSave(key, String(!value))} disabled={saving === key}
                  className={cn("w-9 h-5 rounded-full transition-colors relative", value ? "bg-accent" : "bg-app-tertiary/40")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", value ? "translate-x-[18px]" : "translate-x-0.5")} />
                </button>
              ) : (
                <>
                  <textarea value={displayValue} onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))} spellCheck={false}
                    rows={Math.min(4, displayValue.split("\n").length + 1)}
                    className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none resize-y focus:border-accent/60" />
                  {isDirty && (
                    <button onClick={() => handleSave(key, displayValue)} disabled={saving === key}
                      className="flex items-center gap-1 text-[10px] bg-accent hover:bg-accent-hover text-white px-2.5 py-1 rounded-md"><Save size={10} /> 保存</button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="border border-dashed border-app rounded-xl px-4 py-3 space-y-2 mt-3">
        <p className="text-[10px] text-app-tertiary font-medium">添加新配置项</p>
        <div className="flex gap-2">
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="配置键名" spellCheck={false}
            className="w-40 bg-app-secondary border border-app rounded-lg px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
          <input value={newValue} onChange={e => setNewValue(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="值（JSON 或字符串）" spellCheck={false}
            className="flex-1 bg-app-secondary border border-app rounded-lg px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
          <button onClick={handleAdd} disabled={!newKey.trim()}
            className={cn("flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg font-medium", newKey.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
            <Plus size={12} /> 添加
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: 模型 + 全局配置面板
// ═══════════════════════════════════════════════════════════════════
function SectionModel() {
  return (
    <div className="space-y-4">
      <SectionTitle icon={Cpu} color="#8b5cf6" label="模型与参数" desc="模型选择、API 与高级参数配置" />
      <GlobalConfigPanel />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: Skills
// ═══════════════════════════════════════════════════════════════════
function SectionSkills({ skills, onToggle }: { skills: SkillDetail[]; onToggle: (name: string, enabled: boolean) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const detail = skills.find(s => s.name === selected);

  const handleToggle = async (name: string, enabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(name);
    try { await onToggle(name, enabled); } finally { setToggling(null); }
  };

  return (
    <div className="space-y-4">
      <SectionTitle icon={Sparkles} color="#eab308" label="Skills 技能库" desc="~/.claude/skills/ 目录下的自定义技能" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono bg-app-tertiary/20 px-2 py-0.5 rounded-full text-app-tertiary">{skills.length} 个技能</span>
        <span className="text-[10px] font-mono bg-green-500/10 px-2 py-0.5 rounded-full text-green-400">{skills.filter(s => s.enabled).length} 启用</span>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-12 text-app-tertiary text-xs">暂无自定义 Skill</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {skills.map(s => (
              <button key={s.name} onClick={() => setSelected(s.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === s.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary",
                  !s.enabled && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-app">{s.name}</p>
                  <ToggleSwitch enabled={s.enabled} loading={toggling === s.name}
                    onClick={(e) => handleToggle(s.name, !s.enabled, e)} />
                </div>
                <p className="text-[10px] text-app-tertiary mt-0.5 line-clamp-2">{s.description || "无描述"}</p>
                <div className="flex items-center gap-2 mt-2">
                  {!s.enabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">已禁用</span>}
                  {s.has_auxiliary && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">有辅助文件</span>}
                  {Object.keys(s.metadata).length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">有元数据</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? (
              <div className="bg-app-secondary border border-app rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-app">{detail.name}</h3>
                  <span className="text-[9px] font-mono text-app-tertiary">{detail.path}</span>
                </div>
                {Object.keys(detail.metadata).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-app-secondary uppercase tracking-wider">元数据</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(detail.metadata).map(([k, v]) => (
                        <span key={k} className="text-[10px] px-2 py-1 rounded-md bg-app border border-app font-mono">
                          <span className="text-accent">{k}</span>: <span className="text-app-secondary">{String(v)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {detail.auxiliary_files.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-app-secondary uppercase tracking-wider">辅助文件</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.auxiliary_files.map(f => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-mono">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold text-app-secondary uppercase tracking-wider mb-2">SKILL.md 内容</p>
                  <pre className="text-[11px] font-mono text-app bg-app border border-app rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed">
                    {detail.content}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-app-tertiary text-xs">选择左侧技能查看详情</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: Commands
// ═══════════════════════════════════════════════════════════════════
function SectionCommands({ commands }: { commands: CommandInfo[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const detail = commands.find(c => c.name === selected);

  return (
    <div className="space-y-4">
      <SectionTitle icon={Terminal} color="#22c55e" label="自定义命令" desc="~/.claude/commands/ 目录下的 slash 命令" />
      <span className="text-[10px] font-mono bg-app-tertiary/20 px-2 py-0.5 rounded-full text-app-tertiary">{commands.length} 个命令</span>

      {commands.length === 0 ? (
        <div className="text-center py-12 text-app-tertiary text-xs">暂无自定义命令</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {commands.map(c => (
              <button key={c.name} onClick={() => setSelected(c.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === c.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary")}>
                <p className="text-xs font-semibold text-app font-mono">/{c.name}</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-app-tertiary/20 text-app-tertiary">{c.scope}</span>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? (
              <div className="bg-app-secondary border border-app rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold font-mono text-app">/{detail.name}</h3>
                  <span className="text-[9px] font-mono text-app-tertiary">{detail.path}</span>
                </div>
                <pre className="text-[11px] font-mono text-app bg-app border border-app rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed">
                  {detail.content}
                </pre>
              </div>
            ) : (
              <div className="text-center py-20 text-app-tertiary text-xs">选择左侧命令查看详情</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: MCP
// ═══════════════════════════════════════════════════════════════════
function SectionMcp({ overview, onOverviewUpdate }: { overview: ClaudeOverview | null; onOverviewUpdate: (o: ClaudeOverview) => void }) {
  const [servers, setServers] = useState<McpServer[]>(overview?.mcp_servers ?? []);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", url: "", transport: "http", scope: "user" });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (overview) setServers(overview.mcp_servers); }, [overview]);

  const refresh = async () => { setRefreshing(true); try { const list = await api.claudeConfig.listMcp(); setServers(list); if (overview) onOverviewUpdate({ ...overview, mcp_servers: list }); } finally { setRefreshing(false); } };
  const handleRemove = async (name: string) => { setRemoving(name); try { const res = await api.claudeConfig.removeMcp(name); setServers(res.servers); if (overview) onOverviewUpdate({ ...overview, mcp_servers: res.servers }); } finally { setRemoving(null); } };
  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.url.trim()) return;
    setAdding(true); setAddError("");
    try { const res = await api.claudeConfig.addMcp({ name: addForm.name.trim(), url: addForm.url.trim(), transport: addForm.transport, scope: addForm.scope }); setServers(res.servers); if (overview) onOverviewUpdate({ ...overview, mcp_servers: res.servers }); setAddForm({ name: "", url: "", transport: "http", scope: "user" }); setShowAdd(false); }
    catch (e) { setAddError(e instanceof Error ? e.message : "添加失败"); } finally { setAdding(false); }
  };
  const SM: Record<string, { label: string; color: string; bg: string }> = { connected: { label: "已连接", color: "#22c55e", bg: "bg-green-500/10" }, needs_auth: { label: "需认证", color: "#f59e0b", bg: "bg-yellow-500/10" }, error: { label: "错误", color: "#ef4444", bg: "bg-red-500/10" }, unknown: { label: "未知", color: "#7878a8", bg: "bg-app-tertiary/20" } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle icon={Globe} color="#3b82f6" label="MCP 服务器" desc="Model Context Protocol 服务器管理" />
        <div className="flex gap-2">
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-app text-app-secondary hover:text-app"><RotateCcw size={10} className={refreshing ? "animate-spin" : ""} /> 刷新</button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white"><Plus size={10} /> 添加</button>
        </div>
      </div>
      {showAdd && (
        <div className="bg-app-secondary border border-accent/30 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">名称</label><input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="my-server" spellCheck={false} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] font-mono text-app outline-none focus:border-accent/60" /></div>
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">URL</label><input value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} placeholder="https://mcp.example.com" spellCheck={false} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] font-mono text-app outline-none focus:border-accent/60" /></div>
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">协议</label><select value={addForm.transport} onChange={e => setAddForm(f => ({ ...f, transport: e.target.value }))} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] text-app outline-none"><option value="http">HTTP</option><option value="sse">SSE</option><option value="stdio">Stdio</option></select></div>
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">作用域</label><select value={addForm.scope} onChange={e => setAddForm(f => ({ ...f, scope: e.target.value }))} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] text-app outline-none"><option value="user">全局</option><option value="project">项目</option></select></div>
          </div>
          {addError && <p className="text-[11px] text-red-400">{addError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !addForm.name.trim() || !addForm.url.trim()} className={cn("text-[11px] px-3 py-1.5 rounded-md font-medium", addForm.name.trim() && addForm.url.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>{adding ? "添加中..." : "添加"}</button>
            <button onClick={() => { setShowAdd(false); setAddError(""); }} className="text-[11px] text-app-tertiary hover:text-app px-3 py-1.5">取消</button>
          </div>
        </div>
      )}
      {servers.length === 0 ? (
        <div className="text-center py-12 text-app-tertiary text-xs"><Unplug size={24} className="mx-auto mb-2 opacity-30" />暂无 MCP 服务器</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {servers.map(s => { const sm = SM[s.status] ?? SM.unknown; return (
            <div key={s.name} className="bg-app-secondary border border-app rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sm.color, boxShadow: s.status === "connected" ? `0 0 6px ${sm.color}60` : undefined }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-app">{s.name}</span>
                  <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", sm.bg)} style={{ color: sm.color }}>{sm.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-app-tertiary/20 text-app-tertiary font-mono">{s.transport}</span>
                </div>
                {s.url && <div className="flex items-center gap-1 mt-1"><Link size={9} className="text-app-tertiary shrink-0" /><span className="text-[10px] font-mono text-app-tertiary truncate">{s.url}</span></div>}
              </div>
              <button onClick={() => handleRemove(s.name)} disabled={removing === s.name} className="text-app-tertiary hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-500/10"><Trash2 size={13} /></button>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: Hooks
// ═══════════════════════════════════════════════════════════════════
function SectionHooks({ config, hookEvents, onUpdate }: { config: ClaudeConfig; hookEvents: string[]; onUpdate: (c: ClaudeConfig) => void }) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, HookRule[]>>({});

  const getEditRules = (event: string): HookRule[] => editState[event] ?? config.hooks[event] ?? [];
  const setEditRules = (event: string, rules: HookRule[]) => setEditState(prev => ({ ...prev, [event]: rules }));
  const isDirty = (event: string) => { const e = editState[event]; if (!e) return false; return JSON.stringify(e) !== JSON.stringify(config.hooks[event] ?? []); };

  const handleSave = async (event: string) => { setSaving(event); try { const u = await api.claudeConfig.updateHooks(event, getEditRules(event)); onUpdate(u); setEditState(prev => { const n = { ...prev }; delete n[event]; return n; }); } finally { setSaving(null); } };
  const handleDelete = async (event: string) => { setSaving(event); try { onUpdate(await api.claudeConfig.deleteHookEvent(event)); setEditState(prev => { const n = { ...prev }; delete n[event]; return n; }); } finally { setSaving(null); } };
  const addRule = (event: string) => { const r = [...getEditRules(event)]; r.push({ matcher: "", hooks: [{ type: "command", command: "", timeout: 5 }] }); setEditRules(event, r); setExpandedEvent(event); };
  const removeRule = (event: string, idx: number) => setEditRules(event, getEditRules(event).filter((_, i) => i !== idx));
  const updateRule = (event: string, idx: number, field: "matcher", value: string) => { const r = [...getEditRules(event)]; r[idx] = { ...r[idx], [field]: value }; setEditRules(event, r); };
  const addHookEntry = (event: string, idx: number) => { const r = [...getEditRules(event)]; r[idx] = { ...r[idx], hooks: [...r[idx].hooks, { type: "command", command: "", timeout: 5 }] }; setEditRules(event, r); };
  const removeHookEntry = (event: string, ri: number, hi: number) => { const r = [...getEditRules(event)]; r[ri] = { ...r[ri], hooks: r[ri].hooks.filter((_, i) => i !== hi) }; setEditRules(event, r); };
  const updateHookEntry = (event: string, ri: number, hi: number, upd: Partial<HookEntry>) => { const r = [...getEditRules(event)]; const h = [...r[ri].hooks]; h[hi] = { ...h[hi], ...upd }; r[ri] = { ...r[ri], hooks: h }; setEditRules(event, r); };

  return (
    <div className="space-y-3">
      <SectionTitle icon={Webhook} color="#f97316" label="Hooks 生命周期钩子" desc="Claude Code 事件触发时执行外部命令" />
      {hookEvents.map(event => {
        const meta = EVENT_LABELS[event] ?? { label: event, desc: "" };
        const rules = getEditRules(event);
        const hasRules = rules.length > 0;
        const expanded = expandedEvent === event;
        const dirty = isDirty(event);
        return (
          <div key={event} className={cn("rounded-xl border overflow-hidden", hasRules ? "border-app bg-app-secondary" : "border-app/50 bg-app-secondary/50")}>
            <button onClick={() => setExpandedEvent(expanded ? null : event)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
              {expanded ? <ChevronDown size={13} className="text-app-tertiary" /> : <ChevronRight size={13} className="text-app-tertiary" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-app">{meta.label}</span>
                  <span className="text-[9px] font-mono text-app-tertiary">{event}</span>
                  {hasRules && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-mono">{rules.length} 规则</span>}
                  {dirty && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">未保存</span>}
                </div>
                <p className="text-[10px] text-app-tertiary mt-0.5">{meta.desc}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); addRule(event); }} className="text-app-tertiary hover:text-accent p-1"><Plus size={14} /></button>
            </button>
            {expanded && (
              <div className="border-t border-app px-4 py-3 space-y-3">
                {rules.length === 0 && <p className="text-[11px] text-app-tertiary text-center py-3">暂无规则</p>}
                {rules.map((rule, ri) => (
                  <div key={ri} className="bg-app rounded-lg border border-app/50 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-app-tertiary shrink-0 w-14">Matcher</label>
                      <input value={rule.matcher} onChange={e => updateRule(event, ri, "matcher", e.target.value)} placeholder="* 或留空匹配全部" spellCheck={false}
                        className="flex-1 bg-app-secondary border border-app rounded px-2 py-1 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                      <button onClick={() => removeRule(event, ri)} className="text-app-tertiary hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </div>
                    {rule.hooks.map((hook, hi) => (
                      <div key={hi} className="flex items-center gap-2 pl-[62px]">
                        <input value={hook.command} onChange={e => updateHookEntry(event, ri, hi, { command: e.target.value })} placeholder="/path/to/script.sh" spellCheck={false}
                          className="flex-1 bg-app-secondary border border-app rounded px-2 py-1 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] text-app-tertiary">超时</label>
                          <input type="number" value={hook.timeout} onChange={e => updateHookEntry(event, ri, hi, { timeout: parseInt(e.target.value) || 5 })}
                            className="w-10 bg-app-secondary border border-app rounded px-1.5 py-1 text-[11px] font-mono text-app text-center outline-none" min={1} max={60} />
                          <span className="text-[9px] text-app-tertiary">s</span>
                        </div>
                        <button onClick={() => removeHookEntry(event, ri, hi)} className="text-app-tertiary hover:text-red-400 p-1"><X size={11} /></button>
                      </div>
                    ))}
                    <button onClick={() => addHookEntry(event, ri)} className="ml-[62px] text-[10px] text-app-tertiary hover:text-accent flex items-center gap-1"><Plus size={10} /> 添加命令</button>
                  </div>
                ))}
                {hasRules && (
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => handleSave(event)} disabled={!dirty || saving === event}
                      className={cn("flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium", dirty ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
                      <Save size={11} />{saving === event ? "保存中..." : "保存"}
                    </button>
                    <button onClick={() => handleDelete(event)} disabled={saving === event}
                      className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 border border-red-500/20">
                      <Trash2 size={11} /> 清除全部
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

// ═══════════════════════════════════════════════════════════════════
// Section: Rules
// ═══════════════════════════════════════════════════════════════════
function SectionRules({ rules }: { rules: RuleInfo[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const detail = rules.find(r => r.name === selected);
  return (
    <div className="space-y-4">
      <SectionTitle icon={BookOpen} color="#06b6d4" label="Rules 规则" desc="~/.claude/rules/ 目录下的规则文件" />
      <span className="text-[10px] font-mono bg-app-tertiary/20 px-2 py-0.5 rounded-full text-app-tertiary">{rules.length} 个规则</span>
      {rules.length === 0 ? (
        <div className="text-center py-12 text-app-tertiary text-xs">暂无规则文件</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {rules.map(r => (
              <button key={r.name} onClick={() => setSelected(r.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === r.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary")}>
                <p className="text-xs font-semibold text-app">{r.name}</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-app-tertiary/20 text-app-tertiary">{r.scope}</span>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? (
              <div className="bg-app-secondary border border-app rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-app">{detail.name}</h3>
                <pre className="text-[11px] font-mono text-app bg-app border border-app rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed">{detail.content}</pre>
              </div>
            ) : (
              <div className="text-center py-20 text-app-tertiary text-xs">选择左侧规则查看详情</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: Permissions
// ═══════════════════════════════════════════════════════════════════
function SectionPermissions({ config, onUpdate }: { config: ClaudeConfig; onUpdate: (c: ClaudeConfig) => void }) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config.permissions, null, 2));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [parseError, setParseError] = useState("");
  useEffect(() => { setJsonText(JSON.stringify(config.permissions, null, 2)); }, [config.permissions]);
  const handleSave = async () => {
    let parsed; try { parsed = JSON.parse(jsonText); } catch { setParseError("JSON 格式错误"); setStatus("error"); return; }
    setParseError(""); setSaving(true);
    try { onUpdate(await api.claudeConfig.updatePermissions(parsed)); setStatus("ok"); setTimeout(() => setStatus("idle"), 2000); }
    catch (e) { setParseError(e instanceof Error ? e.message : "保存失败"); setStatus("error"); } finally { setSaving(false); }
  };
  const isDirty = jsonText !== JSON.stringify(config.permissions, null, 2);
  return (
    <div className="space-y-3">
      <SectionTitle icon={Shield} color="#ef4444" label="权限配置" desc="Claude Code 的工具调用权限" />
      <textarea value={jsonText} onChange={e => { setJsonText(e.target.value); setStatus("idle"); setParseError(""); }} spellCheck={false}
        rows={Math.max(8, jsonText.split("\n").length + 1)}
        className={cn("w-full bg-app-secondary border rounded-xl px-4 py-3 text-[11px] font-mono text-app outline-none resize-y leading-relaxed", status === "error" ? "border-red-500/40" : "border-app focus:border-accent/60")} />
      {parseError && <p className="text-[11px] text-red-400">{parseError}</p>}
      <button onClick={handleSave} disabled={!isDirty || saving}
        className={cn("flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium", isDirty ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
        {status === "ok" ? <Check size={11} /> : <Save size={11} />}{saving ? "保存中..." : status === "ok" ? "已保存" : "保存权限"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: 环境变量
// ═══════════════════════════════════════════════════════════════════
function SectionEnvVars() {
  const ENV_DEFS = [
    { key: "ANTHROPIC_API_KEY", desc: "API 密钥", type: "password" as const },
    { key: "ANTHROPIC_AUTH_TOKEN", desc: "认证令牌", type: "password" as const },
    { key: "ANTHROPIC_BASE_URL", desc: "API 端点", type: "text" as const },
    { key: "ANTHROPIC_MODEL", desc: "默认模型", type: "text" as const },
    { key: "HTTPS_PROXY", desc: "HTTPS 代理", type: "text" as const },
    { key: "HTTP_PROXY", desc: "HTTP 代理", type: "text" as const },
    { key: "NO_PROXY", desc: "绕过代理", type: "text" as const },
    { key: "CLAUDE_CONFIG_DIR", desc: "配置目录", type: "text" as const },
    { key: "CLAUDE_CACHE_DIR", desc: "缓存目录", type: "text" as const },
    { key: "CLAUDE_LOG_LEVEL", desc: "日志级别", type: "text" as const },
    { key: "CLAUDE_NO_COLOR", desc: "禁用颜色", type: "text" as const },
    { key: "CLAUDE_EDITOR", desc: "默认编辑器", type: "text" as const },
    { key: "DEBUG", desc: "调试模式", type: "text" as const },
  ];
  return (
    <div className="space-y-4">
      <SectionTitle icon={Variable} color="#a855f7" label="环境变量" desc="Claude Code 相关的环境变量（只读，修改需在 shell 中设置）" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {ENV_DEFS.map(env => (
          <div key={env.key} className="bg-app-secondary border border-app rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold font-mono text-accent">{env.key}</span>
              <span className="text-[9px] text-app-tertiary">{env.desc}</span>
            </div>
            <div className="text-[11px] font-mono text-app-secondary bg-app border border-app rounded-lg px-3 py-2">
              {env.type === "password" ? "••••••••" : <span className="text-app-tertiary">（未设置 / 从环境读取）</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: Plugins
// ═══════════════════════════════════════════════════════════════════
function SectionPlugins({ config, overview, onUpdate }: { config: ClaudeConfig; overview: ClaudeOverview | null; onUpdate: (c: ClaudeConfig) => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [newPluginId, setNewPluginId] = useState("");
  const handleToggle = async (id: string, enabled: boolean) => { setSaving(id); try { onUpdate(await api.claudeConfig.togglePlugin(id, enabled)); } finally { setSaving(null); } };
  const handleRemove = async (id: string) => { setSaving(id); try { onUpdate(await api.claudeConfig.removePlugin(id)); } finally { setSaving(null); } };
  const handleAdd = async () => { const id = newPluginId.trim(); if (!id) return; setSaving(id); try { onUpdate(await api.claudeConfig.togglePlugin(id, true)); setNewPluginId(""); } finally { setSaving(null); } };
  const plugins = Object.entries(config.enabled_plugins);
  const installMap = new Map((overview?.installed_plugins ?? []).map(p => [p.plugin_id, p]));

  return (
    <div className="space-y-4">
      <SectionTitle icon={Plug} color="#22c55e" label="插件管理" desc="启用/禁用 Claude Code 插件" />
      {plugins.length === 0 && <div className="text-center py-8 text-app-tertiary text-xs">暂无已配置的插件</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {plugins.map(([pluginId, enabled]) => {
          const inst = installMap.get(pluginId);
          const [name, publisher] = pluginId.includes("@") ? pluginId.split("@") : [pluginId, ""];
          return (
            <div key={pluginId} className="bg-app-secondary border border-app rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <button onClick={() => handleToggle(pluginId, !enabled)} disabled={saving === pluginId}
                  className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", enabled ? "bg-accent" : "bg-app-tertiary/40")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-xs font-semibold text-app">{name}</span>{publisher && <span className="text-[9px] text-app-tertiary font-mono">@{publisher}</span>}</div>
                </div>
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", enabled ? "bg-green-500/10 text-green-400" : "bg-app-tertiary/20 text-app-tertiary")}>{enabled ? "已启用" : "已禁用"}</span>
                <button onClick={() => handleRemove(pluginId)} disabled={saving === pluginId} className="text-app-tertiary hover:text-red-400 p-1"><Trash2 size={13} /></button>
              </div>
              {inst && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-12 text-[9px] font-mono text-app-tertiary">
                  <span>v{inst.version}</span><span>安装: {inst.installed_at.slice(0, 10)}</span>
                  {inst.git_commit && <span>commit: {inst.git_commit.slice(0, 8)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pt-2">
        <input value={newPluginId} onChange={e => setNewPluginId(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="输入插件 ID" spellCheck={false}
          className="flex-1 bg-app-secondary border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
        <button onClick={handleAdd} disabled={!newPluginId.trim()}
          className={cn("flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg font-medium", newPluginId.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
          <Plus size={12} /> 添加
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: 监控
// ═══════════════════════════════════════════════════════════════════
function SectionMonitoring({ overview }: { overview: ClaudeOverview }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={Activity} color="#10b981" label="监控与统计" desc="Claude Code 使用统计与活动趋势" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "总消息", value: fmtNum(overview.total_messages), color: "#22c55e" },
          { label: "工具调用", value: fmtNum(overview.total_tool_calls), color: "#f59e0b" },
          { label: "会话数", value: fmtNum(overview.total_sessions), color: "#38bdf8" },
          { label: "活跃天数", value: String(overview.active_days), color: "#a78bfa" },
          { label: "技能数", value: String(overview.skills.length), color: "#fbbf24" },
          { label: "MCP 数", value: String(overview.mcp_servers.length), color: "#60a5fa" },
          { label: "插件数", value: String(overview.installed_plugins.length), color: "#4ade80" },
          { label: "项目数", value: String(overview.projects.length), color: "#f472b6" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-app-secondary border border-app rounded-xl px-4 py-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
            <span className="text-[9px] uppercase tracking-widest font-semibold text-app-tertiary">{label}</span>
            <p className="text-xl font-bold tabular-nums text-app mt-1" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
      {overview.daily_activity.length > 0 && (
        <div className="bg-app-secondary border border-app rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><BarChart3 size={13} className="text-app-tertiary" /><span className="text-xs font-semibold text-app">活动趋势</span></div>
          <ActivityChart data={overview.daily_activity} />
        </div>
      )}
      <div className="bg-app-secondary border border-app rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3"><FolderOpen size={13} className="text-green-400" /><span className="text-xs font-semibold text-app">项目记忆</span></div>
        <div className="flex flex-wrap gap-2">
          {overview.projects.map(p => (
            <span key={p.dir_name} className="text-[9px] px-2 py-1 rounded-md bg-app border border-app font-mono text-app-secondary">
              {p.dir_name.replace(/-home-sichengli-Documents-/g, "").replace(/-/g, "/")}
              {p.has_memory && <span className="ml-1 text-green-400">M</span>}
              {p.has_claude_md && <span className="ml-0.5 text-accent">C</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section: 关于
// ═══════════════════════════════════════════════════════════════════
function SectionAbout({ systemInfo, overview }: { systemInfo: ClaudeSystemInfo | null; overview: ClaudeOverview | null }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={Info} color="#3b82f6" label="关于 Claude Code" desc="系统信息与诊断" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[
          { label: "CLI 版本", value: overview?.cli_version || systemInfo?.cli_version || "..." },
          { label: "配置目录", value: systemInfo?.home_path || overview?.home_path || "~/.claude" },
          { label: "配置文件", value: systemInfo?.config_path || "~/.claude/settings.json" },
          { label: "缓存目录", value: systemInfo?.cache_dir || "~/.claude/cache" },
          { label: "缓存大小", value: systemInfo ? `${systemInfo.cache_size_mb.toFixed(1)} MB` : "..." },
          { label: "历史大小", value: systemInfo ? `${systemInfo.history_size_mb.toFixed(1)} MB` : "..." },
          { label: "平台", value: systemInfo?.platform || "..." },
          { label: "Python", value: systemInfo?.python_version || "..." },
          { label: "会话数", value: systemInfo ? String(systemInfo.session_count) : "..." },
          { label: "项目数", value: systemInfo ? String(systemInfo.project_count) : "..." },
          { label: "技能数", value: systemInfo ? String(systemInfo.skill_count) : "..." },
          { label: "MCP 服务器", value: systemInfo ? String(systemInfo.mcp_server_count) : "..." },
        ].map(({ label, value }) => (
          <div key={label} className="bg-app-secondary border border-app rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] text-app-tertiary">{label}</span>
            <span className="text-[11px] font-mono text-app">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

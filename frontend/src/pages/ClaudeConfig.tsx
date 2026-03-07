// frontend/src/pages/ClaudeConfig.tsx
// Claude Code 配置中心 —— 分组侧边栏 + 搜索 + scroll-spy
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  type PresetItem,
  type DisabledItem,
  type ProjectDetails,
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
  ArchiveRestore,
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
  Download,
} from "lucide-react";

// ── Hook 事件标签 ────────────────────────────────────────────────
const getEventLabels = (t: (k: string) => string): Record<string, { label: string; desc: string }> => ({
  PreToolUse:         { label: t("claudeConfig.eventLabels.PreToolUse"),         desc: "Claude 调用工具之前触发" },
  PostToolUse:        { label: t("claudeConfig.eventLabels.PostToolUse"),        desc: "工具调用成功完成后触发" },
  PostToolUseFailure: { label: t("claudeConfig.eventLabels.PostToolUseFailure"), desc: "工具调用失败后触发" },
  Stop:               { label: t("claudeConfig.eventLabels.Stop"),               desc: "Claude 停止响应时触发" },
  SubagentStart:      { label: t("claudeConfig.eventLabels.SubagentStart"),      desc: "子代理开始运行时触发" },
  SubagentStop:       { label: t("claudeConfig.eventLabels.SubagentStop"),       desc: "子代理结束运行时触发" },
  SessionStart:       { label: t("claudeConfig.eventLabels.SessionStart"),       desc: "新会话启动时触发" },
  SessionEnd:         { label: t("claudeConfig.eventLabels.SessionEnd"),         desc: "会话结束时触发" },
  UserPromptSubmit:   { label: "UserPromptSubmit",                               desc: "用户发送消息时触发" },
  Notification:       { label: t("claudeConfig.eventLabels.Notification"),       desc: "Claude 发出通知时触发" },
});

// ── settings.json 常用设置 ──────────────────────────────────────
type CommonSettingDef = {
  key: string; label: string; desc: string;
  type: "string" | "boolean" | "number" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string; group?: string;
};
const getCommonSettings = (t: (k: string) => string): CommonSettingDef[] => [
  { key: "model", label: t("claudeConfig.commonSettings.defaultModel"), desc: "别名或完整模型名", type: "select", options: [
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
  { key: "effortLevel", label: t("claudeConfig.commonSettings.effortLevel"), desc: "low=快速, medium=默认, high=深度推理", type: "select", options: [
    { value: "", label: "默认" }, { value: "low", label: "low" }, { value: "medium", label: "medium" }, { value: "high", label: "high" },
  ], group: "model" },
  { key: "language", label: t("claudeConfig.commonSettings.responseLang"), desc: "Claude 响应语言", type: "string", placeholder: "chinese", group: "behavior" },
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
const COMMON_SETTING_KEYS = new Set([
  "model", "effortLevel", "language", "outputStyle", "alwaysThinkingEnabled",
  "showTurnDuration", "cleanupPeriodDays", "plansDirectory", "forceLoginMethod",
  "autoUpdatesChannel", "spinnerTipsEnabled", "terminalProgressBarEnabled",
  "prefersReducedMotion", "respectGitignore", "includeCoAuthoredBy",
  "enableAllProjectMcpServers", "fastModePerSessionOptIn", "teammateMode",
]);

// ── 分组侧边栏定义 ──────────────────────────────────────────────
type SectionId = "overview" | "settings" | "skills" | "agents" | "commands" | "mcp" | "hooks" | "rules" | "permissions" | "env" | "plugins" | "monitoring" | "trash" | "about";

interface NavItem { id: SectionId; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; keywords: string[] }
interface NavGroup { label: string; items: NavItem[] }

const getNavGroups = (t: (k: string) => string): NavGroup[] => [
  {
    label: t("claudeConfig.navGroups.core"),
    items: [
      { id: "overview", label: t("claudeConfig.navItems.overview"), icon: Settings2, keywords: ["全局", "overview", "概览", "CLAUDE.md", "版本", "统计"] },
      { id: "settings", label: t("claudeConfig.navItems.modelAndParams"), icon: Cpu, keywords: ["模型", "model", "温度", "token", "API", "参数"] },
    ],
  },
  {
    label: t("claudeConfig.navGroups.extensions"),
    items: [
      { id: "skills", label: t("claudeConfig.navItems.skills"), icon: Sparkles, keywords: ["技能", "skill", "SKILL.md"] },
      { id: "agents", label: t("claudeConfig.navItems.agents"), icon: Bot, keywords: ["代理", "agent", "persona"] },
      { id: "commands", label: t("claudeConfig.navItems.commands"), icon: Terminal, keywords: ["命令", "command", "slash"] },
      { id: "mcp", label: t("claudeConfig.navItems.mcpServers"), icon: Globe, keywords: ["mcp", "model context", "服务器", "stdio", "http"] },
    ],
  },
  {
    label: t("claudeConfig.navGroups.security"),
    items: [
      { id: "hooks", label: t("claudeConfig.navItems.hooks"), icon: Webhook, keywords: ["hook", "钩子", "生命周期", "PreToolUse", "PostToolUse"] },
      { id: "rules", label: t("claudeConfig.navItems.rules"), icon: BookOpen, keywords: ["规则", "rule", "CLAUDE.md"] },
      { id: "permissions", label: t("claudeConfig.navItems.permissions"), icon: Shield, keywords: ["权限", "permission", "allow", "deny", "白名单", "黑名单"] },
      { id: "env", label: t("claudeConfig.navItems.envVars"), icon: Variable, keywords: ["环境", "env", "ANTHROPIC", "proxy", "变量"] },
    ],
  },
  {
    label: t("claudeConfig.navGroups.system"),
    items: [
      { id: "plugins", label: t("claudeConfig.navItems.plugins"), icon: Plug, keywords: ["插件", "plugin", "扩展", "marketplace"] },
      { id: "monitoring", label: t("claudeConfig.navItems.monitoring"), icon: Activity, keywords: ["监控", "统计", "活动", "消息", "工具调用"] },
      { id: "trash", label: t("claudeConfig.navItems.trash"), icon: ArchiveRestore, keywords: ["回收", "trash", "禁用", "disabled", "恢复", "restore"] },
      { id: "about", label: t("claudeConfig.navItems.about"), icon: Info, keywords: ["关于", "about", "版本", "系统", "缓存"] },
    ],
  },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── localStorage cache ──────────────────────────────────────────
const CK_CFG = "tc_claude_config_cache";
const CK_OV = "tc_claude_overview_cache";
function readCache<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
function writeCache(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
export default function ClaudeConfigPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ClaudeConfig | null>(() => readCache(CK_CFG));
  const [overview, setOverview] = useState<ClaudeOverview | null>(() => readCache(CK_OV));
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(!readCache(CK_CFG));
  const [error, setError] = useState("");

  const [skills, setSkills] = useState<SkillDetail[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<ClaudeSystemInfo | null>(null);
  const [claudeMd, setClaudeMd] = useState("");
  const [disabledItems, setDisabledItems] = useState<DisabledItem[]>([]);

  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const loadRef = useRef(false);
  const load = useCallback(async () => {
    setLoading(prev => !loadRef.current ? true : prev);
    setError("");
    try {
      const [cfg, events, ov] = await Promise.all([
        api.claudeConfig.get(), api.claudeConfig.hookEvents(), api.claudeConfig.overview(),
      ]);
      setConfig(cfg); setHookEvents(events); setOverview(ov);
      writeCache(CK_CFG, cfg); writeCache(CK_OV, ov);
      loadRef.current = true;
    } catch (e) {
      if (!loadRef.current) setError(e instanceof Error ? e.message : t("claudeConfig.shared.loadFailed"));
    } finally { setLoading(false); }
    api.claudeConfig.listSkills().then(setSkills).catch(() => {});
    api.claudeConfig.listAgents().then(setAgents).catch(() => {});
    api.claudeConfig.listCommands().then(setCommands).catch(() => {});
    api.claudeConfig.listRules().then(setRules).catch(() => {});
    api.claudeConfig.systemInfo().then(setSystemInfo).catch(() => {});
    api.claudeConfig.getClaudeMd().then(r => setClaudeMd(r.content)).catch(() => {});
    api.claudeConfig.disabledItems().then(setDisabledItems).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keyboard shortcut: Ctrl+F → focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Scroll-spy
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let topId: SectionId | null = null;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.boundingClientRect.top < topY) {
            topY = entry.boundingClientRect.top;
            topId = entry.target.getAttribute("data-section") as SectionId;
          }
        }
        if (topId) setActiveSection(topId);
      },
      { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );
    for (const el of Object.values(sectionRefs.current)) { if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, [config, overview, skills, agents, commands, rules]);

  const scrollToSection = (id: SectionId) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Search filtering
  const q = searchQuery.toLowerCase().trim();
  const matchesSearch = useCallback((item: NavItem): boolean => {
    if (!q) return true;
    return item.label.toLowerCase().includes(q)
      || item.keywords.some(k => k.toLowerCase().includes(q));
  }, [q]);

  const NAV_GROUPS = useMemo(() => getNavGroups(t), [t]);
  const ALL_ITEMS = useMemo(() => NAV_GROUPS.flatMap(g => g.items), [NAV_GROUPS]);

  const filteredGroups = useMemo(() => {
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(matchesSearch),
    })).filter(g => g.items.length > 0);
  }, [q, matchesSearch, NAV_GROUPS]);

  const visibleSections = useMemo(() => {
    if (!q) return new Set(ALL_ITEMS.map(i => i.id));
    return new Set(filteredGroups.flatMap(g => g.items.map(i => i.id)));
  }, [q, filteredGroups, ALL_ITEMS]);

  // Counts
  const counts: Partial<Record<SectionId, number>> = useMemo(() => ({
    skills: skills.length,
    agents: agents.length,
    commands: commands.length,
    mcp: overview?.mcp_servers.length,
    hooks: config ? Object.keys(config.hooks).filter(k => (config.hooks[k]?.length ?? 0) > 0).length : undefined,
    rules: rules.length,
    plugins: config ? Object.keys(config.enabled_plugins).length : undefined,
    trash: disabledItems.length || undefined,
  }), [skills, agents, commands, overview, config, rules, disabledItems]);

  // Toggle helpers
  const toggleSkill = async (name: string, enabled: boolean) => {
    await api.claudeConfig.toggleSkill(name, enabled);
    setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled } : s));
  };
  const toggleAgent = async (name: string, enabled: boolean) => {
    await api.claudeConfig.toggleAgent(name, enabled);
    setAgents(prev => prev.map(a => a.name === name ? { ...a, enabled } : a));
  };
  const toggleCommand = async (name: string, enabled: boolean) => {
    await api.claudeConfig.toggleCommand(name, enabled);
    setCommands(prev => prev.map(c => c.name === name ? { ...c, enabled } : c));
  };
  const toggleRule = async (name: string, enabled: boolean) => {
    await api.claudeConfig.toggleRule(name, enabled);
    setRules(prev => prev.map(r => r.name === name ? { ...r, enabled } : r));
  };
  const createAgent = async (name: string, content?: string) => {
    await api.claudeConfig.createAgent(name, content);
    const list = await api.claudeConfig.listAgents();
    setAgents(list);
  };
  const deleteAgent = async (name: string) => {
    await api.claudeConfig.deleteAgent(name);
    setAgents(prev => prev.filter(a => a.name !== name));
  };
  const createCommand = async (name: string, content?: string) => {
    await api.claudeConfig.createCommand(name, content);
    const list = await api.claudeConfig.listCommands();
    setCommands(list);
  };
  const deleteCommand = async (name: string) => {
    await api.claudeConfig.deleteCommand(name);
    setCommands(prev => prev.filter(c => c.name !== name));
  };
  const createRule = async (name: string, content?: string) => {
    await api.claudeConfig.createRule(name, content);
    const list = await api.claudeConfig.listRules();
    setRules(list);
  };
  const deleteRule = async (name: string) => {
    await api.claudeConfig.deleteRule(name);
    setRules(prev => prev.filter(r => r.name !== name));
  };

  const ref = (id: SectionId) => (el: HTMLDivElement | null) => { sectionRefs.current[id] = el; };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── 顶栏 ── */}
      <div className="shrink-0 px-5 pt-3 pb-2 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex-1 min-w-0">
          <h1 className="text-[14px] font-bold text-app">Claude Code</h1>
          <p className="text-[10px] text-app-tertiary font-mono truncate">
            {overview?.home_path || "~/.claude"} · {overview?.cli_version || "..."}
          </p>
        </div>
        {/* 搜索 */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-app-tertiary pointer-events-none" />
          <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={t("claudeConfig.shared.searchPlaceholder")} spellCheck={false}
            className="pl-7 pr-3 py-1.5 text-[11px] bg-app-secondary border border-app rounded-lg w-52 outline-none focus:border-accent/60 text-app placeholder:text-app-tertiary" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-app-tertiary hover:text-app">
              <X size={11} />
            </button>
          )}
        </div>
        <button onClick={load}
          className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg border border-app text-app-tertiary hover:text-app transition-colors shrink-0">
          <RotateCcw size={11} /> {t("common.refresh")}
        </button>
      </div>

      {/* ── 主区域 ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* 分组侧边栏 */}
        <div className="w-[168px] shrink-0 overflow-y-auto py-2 px-1.5" style={{ borderRight: "1px solid var(--border)" }}>
          {filteredGroups.map(group => (
            <div key={group.label} className="mb-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-app-tertiary/60 px-2.5 py-1.5">{group.label}</p>
              {group.items.map(item => {
                const Icon = item.icon;
                const count = counts[item.id];
                const active = activeSection === item.id;
                return (
                  <button key={item.id} onClick={() => scrollToSection(item.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[11px] transition-all text-left",
                      active ? "bg-accent/10 text-accent font-medium" : "text-app-tertiary hover:text-app-secondary hover:bg-white/[0.03]"
                    )}>
                    <Icon size={13} className="shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0",
                        active ? "bg-accent/20 text-accent" : "bg-app-tertiary/15 text-app-tertiary")}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <p className="text-[10px] text-app-tertiary text-center py-8">{t("claudeConfig.shared.noMatchResults")}</p>
          )}
        </div>

        {/* 内容区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-12">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-xs text-red-400">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {loading && !config && (
            <div className="flex items-center justify-center h-40">
              <p className="text-app-tertiary text-xs animate-pulse">{t("claudeConfig.shared.loadingConfig")}</p>
            </div>
          )}

          {/* ── 核心配置 ── */}
          {visibleSections.has("overview") && (
            <div ref={ref("overview")} data-section="overview">
              <SecOverview config={config} overview={overview} onUpdate={setConfig}
                claudeMd={claudeMd} onClaudeMdChange={setClaudeMd} searchQuery={q} />
            </div>
          )}
          {visibleSections.has("settings") && (
            <div ref={ref("settings")} data-section="settings">
              <SecSettings />
            </div>
          )}

          {/* ── 扩展能力 ── */}
          {visibleSections.has("skills") && (
            <div ref={ref("skills")} data-section="skills">
              <SecSkills skills={skills} onToggle={toggleSkill} />
            </div>
          )}
          {visibleSections.has("agents") && (
            <div ref={ref("agents")} data-section="agents">
              <SecAgents agents={agents} onToggle={toggleAgent} onCreate={createAgent} onDelete={deleteAgent} />
            </div>
          )}
          {visibleSections.has("commands") && (
            <div ref={ref("commands")} data-section="commands">
              <SecCommands commands={commands} onToggle={toggleCommand} onCreate={createCommand} onDelete={deleteCommand} />
            </div>
          )}
          {visibleSections.has("mcp") && (
            <div ref={ref("mcp")} data-section="mcp">
              <SecMcp overview={overview} onOverviewUpdate={setOverview} />
            </div>
          )}

          {/* ── 安全与控制 ── */}
          {visibleSections.has("hooks") && config && (
            <div ref={ref("hooks")} data-section="hooks">
              <SecHooks config={config} hookEvents={hookEvents} onUpdate={setConfig} />
            </div>
          )}
          {visibleSections.has("rules") && (
            <div ref={ref("rules")} data-section="rules">
              <SecRules rules={rules} onToggle={toggleRule} onCreate={createRule} onDelete={deleteRule} />
            </div>
          )}
          {visibleSections.has("permissions") && config && (
            <div ref={ref("permissions")} data-section="permissions">
              <SecPermissions config={config} onUpdate={setConfig} />
            </div>
          )}
          {visibleSections.has("env") && (
            <div ref={ref("env")} data-section="env">
              <SecEnvVars />
            </div>
          )}

          {/* ── 系统管理 ── */}
          {visibleSections.has("plugins") && config && (
            <div ref={ref("plugins")} data-section="plugins">
              <SecPlugins config={config} overview={overview} onUpdate={setConfig} />
            </div>
          )}
          {visibleSections.has("monitoring") && overview && (
            <div ref={ref("monitoring")} data-section="monitoring">
              <SecMonitoring overview={overview} />
            </div>
          )}
          {visibleSections.has("trash") && (
            <div ref={ref("trash")} data-section="trash">
              <SecTrash items={disabledItems} onRefresh={() => {
                api.claudeConfig.disabledItems().then(setDisabledItems).catch(() => {});
                api.claudeConfig.listSkills().then(setSkills).catch(() => {});
                api.claudeConfig.listAgents().then(setAgents).catch(() => {});
                api.claudeConfig.listCommands().then(setCommands).catch(() => {});
                api.claudeConfig.listRules().then(setRules).catch(() => {});
              }} />
            </div>
          )}
          {visibleSections.has("about") && (
            <div ref={ref("about")} data-section="about">
              <SecAbout systemInfo={systemInfo} overview={overview} />
            </div>
          )}

          <div className="h-40" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════════
function ToggleSwitch({ enabled, loading, onClick }: {
  enabled: boolean; loading?: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", enabled ? "bg-accent" : "bg-app-tertiary/40", loading && "opacity-50")}>
      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

function SectionHeader({ icon: Icon, color, label, desc, right }: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string; label: string; desc: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-[13px] font-bold text-app leading-tight">{label}</h2>
        <p className="text-[10px] text-app-tertiary">{desc}</p>
      </div>
      {right}
    </div>
  );
}

function CountBadges({ items }: { items: { label: string; count: number; color?: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      {items.map(b => (
        <span key={b.label} className="text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{ background: `${b.color || "var(--accent)"}15`, color: b.color || "var(--accent)" }}>
          {b.count} {b.label}
        </span>
      ))}
    </div>
  );
}

function PresetGallery({ presets, onInstall, itemLabel }: {
  presets: PresetItem[]; onInstall: (name: string, content: string) => Promise<void>; itemLabel: string;
}) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState<string | null>(null);
  const install = async (p: PresetItem) => {
    setInstalling(p.name);
    try { await onInstall(p.name, p.content); } finally { setInstalling(null); }
  };
  const available = presets.filter(p => !p.installed);
  const installed = presets.filter(p => p.installed);
  if (!presets.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Download size={13} className="text-accent" />
        <span className="text-xs font-semibold text-app">{t("claudeConfig.presetGallery.recommendedItems", { itemLabel })}</span>
        <span className="text-[9px] text-app-tertiary">{t("claudeConfig.presetGallery.installedCount", { installed: installed.length, total: presets.length })}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {presets.map(p => (
          <div key={p.name} className={cn("flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all",
            p.installed ? "border-green-500/20 bg-green-500/5" : "border-app bg-app-secondary hover:border-accent/30")}>
            <span className="text-lg shrink-0 mt-0.5">{p.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-app truncate">{p.title}</p>
              <p className="text-[9px] text-app-tertiary mt-0.5 line-clamp-2">{p.desc}</p>
            </div>
            {p.installed ? (
              <span className="text-[9px] text-green-400 shrink-0 mt-1 flex items-center gap-0.5"><Check size={10} />{t("claudeConfig.shared.installedShort")}</span>
            ) : (
              <button onClick={() => install(p)} disabled={installing === p.name}
                className="shrink-0 mt-0.5 text-[9px] px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
                {installing === p.name ? "..." : t("claudeConfig.shared.install")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 简易 Markdown 渲染：支持标题、列表、代码块、内联代码、加粗 */
function MdPreview({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const result: { type: string; lines: string[]; lang?: string }[] = [];
    let inCode = false;
    let codeLang = "";
    let codeLines: string[] = [];

    for (const line of content.split("\n")) {
      if (line.startsWith("```")) {
        if (inCode) {
          result.push({ type: "code", lines: codeLines, lang: codeLang });
          codeLines = [];
          inCode = false;
        } else {
          inCode = true;
          codeLang = line.slice(3).trim();
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }
      result.push({ type: "line", lines: [line] });
    }
    if (inCode) result.push({ type: "code", lines: codeLines, lang: codeLang });
    return result;
  }, [content]);

  const renderInline = (text: string, key: number) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return (
      <span key={key}>
        {parts.map((p, j) => {
          if (p.startsWith("`") && p.endsWith("`"))
            return <code key={j} className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent font-mono">{p.slice(1, -1)}</code>;
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={j} className="font-semibold text-app">{p.slice(2, -2)}</strong>;
          return <span key={j}>{p}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="space-y-1 max-h-[300px] overflow-y-auto">
      {blocks.map((block, i) => {
        if (block.type === "code") {
          return (
            <div key={i} className="bg-app rounded-lg border border-app/50 px-3 py-2 my-1.5 overflow-x-auto">
              {block.lang && <span className="text-[8px] text-app-tertiary/60 uppercase tracking-wider">{block.lang}</span>}
              <pre className="text-[10px] font-mono text-app/80 leading-relaxed whitespace-pre">{block.lines.join("\n")}</pre>
            </div>
          );
        }
        const line = block.lines[0];
        if (line.startsWith("# ")) return <p key={i} className="text-[13px] font-bold text-app mt-2">{renderInline(line.slice(2), i)}</p>;
        if (line.startsWith("## ")) return <p key={i} className="text-[12px] font-semibold text-app mt-2">{renderInline(line.slice(3), i)}</p>;
        if (line.startsWith("### ")) return <p key={i} className="text-[11px] font-semibold text-app/80 mt-1.5">{renderInline(line.slice(4), i)}</p>;
        if (line.startsWith("- ")) return (
          <div key={i} className="flex items-start gap-2 pl-1">
            <span className="text-accent mt-0.5 shrink-0 text-[10px]">•</span>
            <span className="text-[11px] text-app leading-relaxed">{renderInline(line.slice(2), i)}</span>
          </div>
        );
        if (/^\s{2,}/.test(line) && line.trim()) return (
          <p key={i} className="text-[11px] text-app/80 leading-relaxed pl-5">{renderInline(line.trim(), i)}</p>
        );
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-[11px] text-app/80 leading-relaxed">{renderInline(line, i)}</p>;
      })}
    </div>
  );
}

function ClaudeMdPanel({ claudeMd, onChange, onSave, saving, saved }: {
  claudeMd: string; onChange: (s: string) => void;
  onSave: () => void; saving: boolean; saved: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = !claudeMd.trim();
  const startEdit = () => { setEditing(true); setTimeout(() => textareaRef.current?.focus(), 50); };
  const handleSave = () => { onSave(); };
  const handleDone = () => { setEditing(false); if (claudeMd.trim()) handleSave(); };

  return (
    <div className="bg-app-secondary border border-app rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-accent" />
          <span className="text-xs font-semibold text-app">{t("claudeConfig.claudeMd.globalClaudeMd")}</span>
          <span className="text-[9px] text-app-tertiary font-mono">~/.claude/CLAUDE.md</span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white">
                {saved ? <Check size={10} /> : <Save size={10} />}
                {saving ? t("claudeConfig.claudeMd.saving") : saved ? t("claudeConfig.claudeMd.saved") : t("common.save")}
              </button>
              <button onClick={handleDone}
                className="text-[10px] px-2.5 py-1.5 rounded-md border border-app text-app-secondary hover:text-app">
                {t("claudeConfig.claudeMd.done")}
              </button>
            </>
          ) : (
            <button onClick={startEdit}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-app text-app-secondary hover:text-app hover:border-accent/40 transition-colors">
              <Wrench size={10} /> {t("claudeConfig.claudeMd.edit")}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <textarea ref={textareaRef} value={claudeMd} onChange={e => onChange(e.target.value)}
          spellCheck={false} rows={12}
          className="w-full bg-app px-4 py-3 text-[11px] font-mono text-app outline-none resize-y leading-relaxed border-none" />
      ) : (
        <div className="px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={startEdit}>
          {isEmpty ? (
            <p className="text-[11px] text-app-tertiary italic py-4 text-center">{t("claudeConfig.claudeMd.noContent")}</p>
          ) : (
            <MdPreview content={claudeMd} />
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: 总览
// ═══════════════════════════════════════════════════════════════════
function SecOverview({ config, overview, onUpdate, claudeMd, onClaudeMdChange, searchQuery }: {
  config: ClaudeConfig | null; overview: ClaudeOverview | null;
  onUpdate: (c: ClaudeConfig) => void;
  claudeMd: string; onClaudeMdChange: (s: string) => void;
  searchQuery: string;
}) {
  const { t } = useTranslation();
  const [mdSaving, setMdSaving] = useState(false);
  const [mdSaved, setMdSaved] = useState(false);
  const handleSaveMd = async () => {
    setMdSaving(true);
    try { await api.claudeConfig.updateClaudeMd(claudeMd); setMdSaved(true); setTimeout(() => setMdSaved(false), 2000); }
    finally { setMdSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Settings2} color="var(--accent)" label={t("claudeConfig.navItems.overview")} desc="Claude Code 全局信息与常用配置" />

      {/* Stats cards */}
      {overview && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: t("claudeConfig.overviewStats.cliVersion"), value: overview.cli_version, Icon: Terminal, color: "var(--accent)" },
            { label: t("claudeConfig.overviewStats.totalMessages"), value: fmtNum(overview.total_messages), Icon: MessageSquare, color: "#22c55e" },
            { label: t("claudeConfig.overviewStats.toolCalls"), value: fmtNum(overview.total_tool_calls), Icon: Wrench, color: "#f59e0b" },
            { label: t("claudeConfig.overviewStats.sessionCount"), value: fmtNum(overview.total_sessions), Icon: Users, color: "#38bdf8" },
            { label: t("claudeConfig.overviewStats.activeDays"), value: String(overview.active_days), Icon: Calendar, color: "#a78bfa" },
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
            <span className="text-xs font-semibold text-app">{t("claudeConfig.overviewStats.dailyActivity")}</span>
            <span className="text-[9px] text-app-tertiary font-mono ml-auto">{overview.first_active_day} ~ {overview.last_active_day}</span>
          </div>
          <ActivityChart data={overview.daily_activity} />
        </div>
      )}

      {/* CLAUDE.md — 展示/编辑切换 */}
      <ClaudeMdPanel claudeMd={claudeMd} onChange={onClaudeMdChange} onSave={handleSaveMd} saving={mdSaving} saved={mdSaved} />

      {/* Common settings */}
      {config && <CommonSettingsGrid config={config} onUpdate={onUpdate} searchQuery={searchQuery} />}
      {config && <OtherFieldsGrid config={config} onUpdate={onUpdate} />}
    </div>
  );
}

function ActivityChart({ data }: { data: ClaudeOverview["daily_activity"] }) {
  const { t } = useTranslation();
  const recent = useMemo(() => data.slice(-60), [data]);
  const maxMsg = useMemo(() => Math.max(1, ...recent.map(d => d.message_count)), [recent]);
  const maxTool = useMemo(() => Math.max(1, ...recent.map(d => d.tool_call_count)), [recent]);
  if (!recent.length) return <div className="text-[10px] text-app-tertiary text-center py-6">{t("claudeConfig.shared.none")}</div>;
  const H = 80, barW = Math.max(3, Math.min(8, (600 - recent.length) / recent.length)), gap = 1;
  const W = recent.length * (barW + gap);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 18}`} width={W} height={H + 18} className="block">
        {recent.map((d, i) => {
          const x = i * (barW + gap);
          const msgH = Math.max(1, (d.message_count / maxMsg) * H * 0.9);
          const toolH = Math.max(1, (d.tool_call_count / maxTool) * H * 0.5);
          const last = i === recent.length - 1;
          return (
            <g key={d.date}>
              <title>{`${d.date}\n消息: ${d.message_count}\n工具: ${d.tool_call_count}\n会话: ${d.session_count}`}</title>
              <rect x={x} y={H - msgH} width={barW} height={msgH} rx={1} fill={last ? "#22c55e" : "#4477ff"} opacity={0.7} />
              <rect x={x} y={H - toolH} width={barW} height={toolH} rx={1} fill={last ? "#86efac" : "#f59e0b"} opacity={0.5} />
              {i % 7 === 0 && <text x={x + barW / 2} y={H + 12} textAnchor="middle" fill="var(--text-tertiary)" fontSize="6" fontFamily="monospace">{d.date.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1.5">
        <div className="flex items-center gap-1.5 text-[9px] text-app-tertiary"><div className="w-2 h-2 rounded-sm" style={{ background: "#4477ff", opacity: 0.7 }} />{t("claudeConfig.shared.message")}</div>
        <div className="flex items-center gap-1.5 text-[9px] text-app-tertiary"><div className="w-2 h-2 rounded-sm" style={{ background: "#f59e0b", opacity: 0.5 }} />{t("claudeConfig.shared.toolCall")}</div>
      </div>
    </div>
  );
}

function CommonSettingsGrid({ config, onUpdate, searchQuery }: { config: ClaudeConfig; onUpdate: (c: ClaudeConfig) => void; searchQuery: string }) {
  const { t } = useTranslation();
  const COMMON_SETTINGS = useMemo(() => getCommonSettings(t), [t]);
  const [saving, setSaving] = useState<string | null>(null);
  const getValue = (key: string): unknown => config.other[key];
  const handleChange = async (key: string, value: unknown) => {
    setSaving(key);
    try {
      if (value === "" || value === undefined) onUpdate(await api.claudeConfig.deleteOther(key));
      else onUpdate(await api.claudeConfig.updateOther(key, value));
    } finally { setSaving(null); }
  };
  const GLABELS: Record<string, string> = {
    model: t("claudeConfig.settingsGroups.modelConfig"), behavior: t("claudeConfig.settingsGroups.behaviorOutput"), session: t("claudeConfig.settingsGroups.sessionManagement"),
    security: t("claudeConfig.settingsGroups.loginSecurity"), ui: t("claudeConfig.settingsGroups.uiExperience"), advanced: t("claudeConfig.settingsGroups.advancedOptions"),
  };
  const groups = useMemo(() => {
    const map = new Map<string, CommonSettingDef[]>();
    for (const s of COMMON_SETTINGS) {
      // Filter by search
      if (searchQuery && !s.label.toLowerCase().includes(searchQuery) && !s.key.toLowerCase().includes(searchQuery) && !s.desc.toLowerCase().includes(searchQuery)) continue;
      const g = s.group || "other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return map;
  }, [searchQuery, COMMON_SETTINGS]);

  if (groups.size === 0) return null;
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([gid, settings]) => (
        <div key={gid}>
          <p className="text-[11px] font-semibold text-app-secondary uppercase tracking-wider mb-3">{GLABELS[gid] || gid}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {settings.map(s => {
              const cur = getValue(s.key);
              return (
                <div key={s.key} className="bg-app-secondary border border-app rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div><p className="text-xs font-medium text-app">{s.label}</p><p className="text-[10px] text-app-tertiary">{s.desc}</p></div>
                    {s.type === "boolean" && (
                      <ToggleSwitch enabled={cur === true} loading={saving === s.key}
                        onClick={() => handleChange(s.key, !(cur === true))} />
                    )}
                  </div>
                  {s.type === "select" && (
                    <select value={typeof cur === "string" ? cur : ""} onChange={e => handleChange(s.key, e.target.value || undefined)} disabled={saving === s.key}
                      className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60 cursor-pointer">
                      {s.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {s.type === "string" && (
                    <input value={typeof cur === "string" ? cur : ""} onChange={e => handleChange(s.key, e.target.value || undefined)}
                      placeholder={s.placeholder} disabled={saving === s.key} spellCheck={false}
                      className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                  )}
                  {s.type === "number" && (
                    <input type="number" value={typeof cur === "number" ? cur : ""} onChange={e => handleChange(s.key, e.target.value ? Number(e.target.value) : undefined)}
                      placeholder={s.placeholder} disabled={saving === s.key}
                      className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                  )}
                  <p className="text-[9px] font-mono text-app-tertiary/60 mt-1.5">settings.json → <span className="text-accent/60">{s.key}</span></p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function OtherFieldsGrid({ config, onUpdate }: { config: ClaudeConfig; onUpdate: (c: ClaudeConfig) => void }) {
  const { t } = useTranslation();
  const entries = Object.entries(config.other).filter(([k]) => !COMMON_SETTING_KEYS.has(k));
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const handleSave = async (key: string, raw: string) => {
    let v: unknown; try { v = JSON.parse(raw); } catch { v = raw; }
    setSaving(key);
    try { onUpdate(await api.claudeConfig.updateOther(key, v)); setEditValues(p => { const n = { ...p }; delete n[key]; return n; }); } finally { setSaving(null); }
  };
  const handleDel = async (key: string) => { setSaving(key); try { onUpdate(await api.claudeConfig.deleteOther(key)); } finally { setSaving(null); } };
  const handleAdd = async () => {
    if (!newKey.trim()) return;
    let v: unknown; try { v = JSON.parse(newValue); } catch { v = newValue; }
    setSaving(newKey); try { onUpdate(await api.claudeConfig.updateOther(newKey.trim(), v)); setNewKey(""); setNewValue(""); } finally { setSaving(null); }
  };
  const fmt = (v: unknown): string => typeof v === "string" ? v : JSON.stringify(v, null, 2);
  if (!entries.length && !newKey) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-app-secondary uppercase tracking-wider mb-3">{t("claudeConfig.otherConfig.title")}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {entries.map(([key, value]) => {
          const disp = editValues[key] ?? fmt(value);
          const dirty = editValues[key] !== undefined && editValues[key] !== fmt(value);
          const isBool = typeof value === "boolean";
          return (
            <div key={key} className="bg-app-secondary border border-app rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold font-mono text-app">{key}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-app-tertiary font-mono">{typeof value}</span>
                  <button onClick={() => handleDel(key)} disabled={saving === key} className="text-app-tertiary hover:text-red-400 transition-colors p-1"><Trash2 size={12} /></button>
                </div>
              </div>
              {isBool ? (
                <ToggleSwitch enabled={value as boolean} loading={saving === key} onClick={() => handleSave(key, String(!value))} />
              ) : (
                <>
                  <textarea value={disp} onChange={e => setEditValues(p => ({ ...p, [key]: e.target.value }))} spellCheck={false}
                    rows={Math.min(4, disp.split("\n").length + 1)}
                    className="w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none resize-y focus:border-accent/60" />
                  {dirty && <button onClick={() => handleSave(key, disp)} disabled={saving === key}
                    className="flex items-center gap-1 text-[10px] bg-accent hover:bg-accent-hover text-white px-2.5 py-1 rounded-md"><Save size={10} /> {t("common.save")}</button>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="border border-dashed border-app rounded-xl px-4 py-3 space-y-2 mt-3">
        <p className="text-[10px] text-app-tertiary font-medium">{t("claudeConfig.otherConfig.addNew")}</p>
        <div className="flex gap-2">
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder={t("claudeConfig.otherConfig.keyName")} spellCheck={false}
            className="w-36 bg-app-secondary border border-app rounded-lg px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
          <input value={newValue} onChange={e => setNewValue(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="值（JSON 或字符串）" spellCheck={false}
            className="flex-1 bg-app-secondary border border-app rounded-lg px-3 py-1.5 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
          <button onClick={handleAdd} disabled={!newKey.trim()}
            className={cn("flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg font-medium", newKey.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
            <Plus size={12} /> {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: 模型与参数
// ═══════════════════════════════════════════════════════════════════
function SecSettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <SectionHeader icon={Cpu} color="#8b5cf6" label={t("claudeConfig.navItems.modelAndParams")} desc="API 参数、模型选择、功能开关与高级配置 (tc_global_config.json)" />
      <GlobalConfigPanel />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Skills
// ═══════════════════════════════════════════════════════════════════
function SecSkills({ skills, onToggle }: { skills: SkillDetail[]; onToggle: (n: string, e: boolean) => Promise<void> }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const detail = skills.find(s => s.name === selected);
  const toggle = async (name: string, enabled: boolean, ev: React.MouseEvent) => {
    ev.stopPropagation(); setToggling(name); try { await onToggle(name, enabled); } finally { setToggling(null); }
  };
  return (
    <div className="space-y-4">
      <SectionHeader icon={Sparkles} color="#eab308" label={t("claudeConfig.skills.title")} desc="~/.claude/skills/"
        right={<CountBadges items={[{ label: t("common.total"), count: skills.length }, { label: t("common.enabled"), count: skills.filter(s => s.enabled).length, color: "#22c55e" }]} />} />
      {!skills.length ? <Empty text={t("claudeConfig.skills.noSkills")} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {skills.map(s => (
              <button key={s.name} onClick={() => setSelected(s.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === s.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary",
                  !s.enabled && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-app">{s.name}</p>
                  <ToggleSwitch enabled={s.enabled} loading={toggling === s.name} onClick={e => toggle(s.name, !s.enabled, e)} />
                </div>
                <p className="text-[10px] text-app-tertiary mt-0.5 line-clamp-2">{s.description || t("claudeConfig.skills.noDescription")}</p>
                <div className="flex items-center gap-2 mt-2">
                  {!s.enabled && <StatusTag label={t("claudeConfig.skills.disabled")} color="#ef4444" />}
                  {s.has_auxiliary && <StatusTag label={t("claudeConfig.skills.auxiliaryFiles")} color="#3b82f6" />}
                  {Object.keys(s.metadata).length > 0 && <StatusTag label={t("claudeConfig.skills.metadata")} color="#a855f7" />}
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? <DetailPanel title={detail.name} path={detail.path} metadata={detail.metadata}
              auxiliaryFiles={detail.auxiliary_files} content={detail.content} contentLabel={t("claudeConfig.skills.skillMdContent")} />
              : <EmptyDetail text={t("claudeConfig.skills.selectHint")} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Agents
// ═══════════════════════════════════════════════════════════════════
function SecAgents({ agents, onToggle, onCreate, onDelete }: {
  agents: AgentInfo[]; onToggle: (n: string, e: boolean) => Promise<void>;
  onCreate: (name: string, content?: string) => Promise<void>; onDelete: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const detail = agents.find(a => a.name === selected);
  useEffect(() => { api.claudeConfig.presetAgents().then(setPresets).catch(() => {}); }, []);
  // 安装后刷新 presets 的 installed 状态
  useEffect(() => {
    const names = new Set(agents.map(a => a.name));
    setPresets(prev => prev.map(p => ({ ...p, installed: names.has(p.name) })));
  }, [agents]);
  const toggle = async (name: string, enabled: boolean, ev: React.MouseEvent) => {
    ev.stopPropagation(); setToggling(name); try { await onToggle(name, enabled); } finally { setToggling(null); }
  };
  const handleCreate = async (name?: string, content?: string) => {
    const n = (name ?? newName).trim(); if (!n) return;
    if (!name) setCreating(true);
    setCreateErr("");
    try { await onCreate(n, content); setNewName(""); setShowCreate(false); setSelected(n); }
    catch (e) { setCreateErr(e instanceof Error ? e.message : t("claudeConfig.agents.createFailed")); }
    finally { if (!name) setCreating(false); }
  };
  const handleDelete = async (name: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!confirm(`${t("claudeConfig.agents.deleteConfirm")} "${name}"？`)) return;
    setDeleting(name);
    try { await onDelete(name); if (selected === name) setSelected(null); }
    finally { setDeleting(null); }
  };
  return (
    <div className="space-y-4">
      <SectionHeader icon={Bot} color="#f472b6" label={t("claudeConfig.agents.title")} desc="~/.claude/agents/"
        right={<div className="flex items-center gap-2">
          <CountBadges items={[{ label: t("common.total"), count: agents.length }, { label: t("common.enabled"), count: agents.filter(a => a.enabled).length, color: "#22c55e" }]} />
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white"><Plus size={10} /> {t("claudeConfig.agents.newAgent")}</button>
        </div>} />
      {showCreate && (
        <div className="bg-app-secondary border border-accent/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-app">{t("claudeConfig.agents.newAgent")}</p>
          <div className="flex gap-2">
            <input value={newName} onChange={e => { setNewName(e.target.value); setCreateErr(""); }} placeholder="Agent 名称（如 code-reviewer）"
              className="flex-1 px-3 py-2 text-xs bg-app border border-app rounded-lg outline-none focus:border-accent/60 text-app placeholder:text-app-tertiary"
              onKeyDown={e => e.key === "Enter" && handleCreate()} />
            <button onClick={() => handleCreate()} disabled={creating || !newName.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40">
              {creating ? t("common.loading") : t("common.create")}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(""); setCreateErr(""); }}
              className="px-3 py-2 text-xs rounded-lg border border-app text-app-secondary hover:text-app"><X size={12} /></button>
          </div>
          {createErr && <p className="text-[10px] text-red-400">{createErr}</p>}
        </div>
      )}
      <PresetGallery presets={presets} onInstall={(n, c) => handleCreate(n, c)} itemLabel="Agent" />
      {agents.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {agents.map(a => (
              <button key={a.name} onClick={() => setSelected(a.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === a.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary",
                  !a.enabled && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-app">{a.name}</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={e => handleDelete(a.name, e)} disabled={deleting === a.name}
                      className="p-1 rounded hover:bg-red-500/10 text-app-tertiary hover:text-red-400 transition-colors" title="删除">
                      <Trash2 size={11} />
                    </button>
                    <ToggleSwitch enabled={a.enabled} loading={toggling === a.name} onClick={e => toggle(a.name, !a.enabled, e)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusTag label={a.scope} color="#7878a8" />
                  {!a.enabled && <StatusTag label={t("common.disabled")} color="#ef4444" />}
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? <DetailPanel title={detail.name} path={detail.path} metadata={detail.metadata}
              content={detail.content} contentLabel={t("claudeConfig.agents.agentContent")} />
              : <EmptyDetail text={t("claudeConfig.agents.selectHint")} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Commands
// ═══════════════════════════════════════════════════════════════════
function SecCommands({ commands, onToggle, onCreate, onDelete }: {
  commands: CommandInfo[]; onToggle: (n: string, e: boolean) => Promise<void>;
  onCreate: (name: string, content?: string) => Promise<void>; onDelete: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const detail = commands.find(c => c.name === selected);
  useEffect(() => { api.claudeConfig.presetCommands().then(setPresets).catch(() => {}); }, []);
  useEffect(() => {
    const names = new Set(commands.map(c => c.name));
    setPresets(prev => prev.map(p => ({ ...p, installed: names.has(p.name) })));
  }, [commands]);
  const toggle = async (name: string, enabled: boolean, ev: React.MouseEvent) => {
    ev.stopPropagation(); setToggling(name); try { await onToggle(name, enabled); } finally { setToggling(null); }
  };
  const handleCreate = async (name?: string, content?: string) => {
    const n = (name ?? newName).trim(); if (!n) return;
    if (!name) setCreating(true);
    setCreateErr("");
    try { await onCreate(n, content); setNewName(""); setShowCreate(false); setSelected(n); }
    catch (e) { setCreateErr(e instanceof Error ? e.message : t("claudeConfig.agents.createFailed")); }
    finally { if (!name) setCreating(false); }
  };
  const handleDelete = async (name: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!confirm(`${t("claudeConfig.commands.deleteConfirm")} "/${name}"？`)) return;
    setDeleting(name);
    try { await onDelete(name); if (selected === name) setSelected(null); }
    finally { setDeleting(null); }
  };
  return (
    <div className="space-y-4">
      <SectionHeader icon={Terminal} color="#22c55e" label={t("claudeConfig.commands.title")} desc="~/.claude/commands/"
        right={<div className="flex items-center gap-2">
          <CountBadges items={[{ label: t("common.total"), count: commands.length }, { label: t("common.enabled"), count: commands.filter(c => c.enabled).length, color: "#22c55e" }]} />
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white"><Plus size={10} /> {t("claudeConfig.commands.newCommand")}</button>
        </div>} />
      {showCreate && (
        <div className="bg-app-secondary border border-accent/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-app">{t("claudeConfig.commands.newCommand")}</p>
          <div className="flex gap-2">
            <div className="flex items-center flex-1 px-3 py-2 bg-app border border-app rounded-lg focus-within:border-accent/60">
              <span className="text-xs text-app-tertiary font-mono">/</span>
              <input value={newName} onChange={e => { setNewName(e.target.value); setCreateErr(""); }} placeholder="命令名称（如 review）"
                className="flex-1 ml-1 text-xs bg-transparent outline-none text-app placeholder:text-app-tertiary font-mono"
                onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            <button onClick={() => handleCreate()} disabled={creating || !newName.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40">
              {creating ? t("common.loading") : t("common.create")}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(""); setCreateErr(""); }}
              className="px-3 py-2 text-xs rounded-lg border border-app text-app-secondary hover:text-app"><X size={12} /></button>
          </div>
          {createErr && <p className="text-[10px] text-red-400">{createErr}</p>}
        </div>
      )}
      <PresetGallery presets={presets} onInstall={(n, c) => handleCreate(n, c)} itemLabel="Command" />
      {commands.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {commands.map(c => (
              <button key={c.name} onClick={() => setSelected(c.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === c.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary",
                  !c.enabled && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-app font-mono">/{c.name}</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={e => handleDelete(c.name, e)} disabled={deleting === c.name}
                      className="p-1 rounded hover:bg-red-500/10 text-app-tertiary hover:text-red-400 transition-colors" title="删除">
                      <Trash2 size={11} />
                    </button>
                    <ToggleSwitch enabled={c.enabled} loading={toggling === c.name} onClick={e => toggle(c.name, !c.enabled, e)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusTag label={c.scope} color="#7878a8" />
                  {!c.enabled && <StatusTag label={t("common.disabled")} color="#ef4444" />}
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? <DetailPanel title={`/${detail.name}`} path={detail.path} content={detail.content} contentLabel={t("claudeConfig.commands.commandContent")} />
              : <EmptyDetail text={t("claudeConfig.commands.selectHint")} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: MCP
// ═══════════════════════════════════════════════════════════════════
function SecMcp({ overview, onOverviewUpdate }: { overview: ClaudeOverview | null; onOverviewUpdate: (o: ClaudeOverview) => void }) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServer[]>(overview?.mcp_servers ?? []);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", url: "", transport: "http", scope: "user" });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (overview) setServers(overview.mcp_servers); }, [overview]);
  const refresh = async () => { setRefreshing(true); try { const l = await api.claudeConfig.listMcp(); setServers(l); if (overview) onOverviewUpdate({ ...overview, mcp_servers: l }); } finally { setRefreshing(false); } };
  const handleRemove = async (name: string) => { setRemoving(name); try { const r = await api.claudeConfig.removeMcp(name); setServers(r.servers); if (overview) onOverviewUpdate({ ...overview, mcp_servers: r.servers }); } finally { setRemoving(null); } };
  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.url.trim()) return;
    setAdding(true); setAddError("");
    try { const r = await api.claudeConfig.addMcp({ name: addForm.name.trim(), url: addForm.url.trim(), transport: addForm.transport, scope: addForm.scope }); setServers(r.servers); if (overview) onOverviewUpdate({ ...overview, mcp_servers: r.servers }); setAddForm({ name: "", url: "", transport: "http", scope: "user" }); setShowAdd(false); }
    catch (e) { setAddError(e instanceof Error ? e.message : t("claudeConfig.mcp.addFailed")); } finally { setAdding(false); }
  };
  const SM: Record<string, { label: string; color: string; bg: string }> = {
    connected: { label: t("claudeConfig.mcp.connected"), color: "#22c55e", bg: "bg-green-500/10" },
    needs_auth: { label: t("claudeConfig.mcp.needsAuth"), color: "#f59e0b", bg: "bg-yellow-500/10" },
    error: { label: t("claudeConfig.mcp.error"), color: "#ef4444", bg: "bg-red-500/10" },
    unknown: { label: t("claudeConfig.mcp.unknown"), color: "#7878a8", bg: "bg-app-tertiary/20" },
  };
  return (
    <div className="space-y-4">
      <SectionHeader icon={Globe} color="#3b82f6" label={t("claudeConfig.mcp.title")} desc="Model Context Protocol 服务器管理"
        right={<div className="flex gap-2">
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-app text-app-secondary hover:text-app"><RotateCcw size={10} className={refreshing ? "animate-spin" : ""} /> {t("common.refresh")}</button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white"><Plus size={10} /> {t("common.add")}</button>
        </div>} />
      {showAdd && (
        <div className="bg-app-secondary border border-accent/30 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">{t("claudeConfig.mcp.name")}</label><input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="my-server" spellCheck={false} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] font-mono text-app outline-none focus:border-accent/60" /></div>
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">{t("claudeConfig.mcp.url")}</label><input value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." spellCheck={false} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] font-mono text-app outline-none focus:border-accent/60" /></div>
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">{t("claudeConfig.mcp.protocol")}</label><select value={addForm.transport} onChange={e => setAddForm(f => ({ ...f, transport: e.target.value }))} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] text-app outline-none"><option value="http">HTTP</option><option value="sse">SSE</option><option value="stdio">Stdio</option></select></div>
            <div><label className="text-[9px] text-app-tertiary uppercase block mb-1">{t("claudeConfig.mcp.scope")}</label><select value={addForm.scope} onChange={e => setAddForm(f => ({ ...f, scope: e.target.value }))} className="w-full bg-app border border-app rounded-md px-3 py-1.5 text-[11px] text-app outline-none"><option value="user">{t("claudeConfig.mcp.global")}</option><option value="project">{t("claudeConfig.mcp.project")}</option></select></div>
          </div>
          {addError && <p className="text-[11px] text-red-400">{addError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding || !addForm.name.trim() || !addForm.url.trim()} className={cn("text-[11px] px-3 py-1.5 rounded-md font-medium", addForm.name.trim() && addForm.url.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>{adding ? t("common.loading") : t("common.add")}</button>
            <button onClick={() => { setShowAdd(false); setAddError(""); }} className="text-[11px] text-app-tertiary hover:text-app px-3 py-1.5">{t("common.cancel")}</button>
          </div>
        </div>
      )}
      {!servers.length ? <Empty text={t("claudeConfig.mcp.noServers")} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {servers.map(s => { const sm = SM[s.status] ?? SM.unknown; return (
            <div key={s.name} className="bg-app-secondary border border-app rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sm.color, boxShadow: s.status === "connected" ? `0 0 6px ${sm.color}60` : undefined }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="text-xs font-semibold text-app">{s.name}</span><StatusTag label={sm.label} color={sm.color} /><StatusTag label={s.transport} color="#7878a8" /></div>
                {s.url && <div className="flex items-center gap-1 mt-1"><Link size={9} className="text-app-tertiary shrink-0" /><span className="text-[10px] font-mono text-app-tertiary truncate">{s.url}</span></div>}
              </div>
              <button onClick={() => handleRemove(s.name)} disabled={removing === s.name} className="text-app-tertiary hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-500/10"><Trash2 size={13} /></button>
            </div>
          ); })}
        </div>
      )}
      {/* MCP 市场嵌入 */}
      <McpMarketEmbed />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Hooks
// ═══════════════════════════════════════════════════════════════════
function SecHooks({ config, hookEvents, onUpdate }: { config: ClaudeConfig; hookEvents: string[]; onUpdate: (c: ClaudeConfig) => void }) {
  const { t } = useTranslation();
  const EVENT_LABELS = useMemo(() => getEventLabels(t), [t]);
  const [saving, setSaving] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, HookRule[]>>({});
  const getRules = (ev: string): HookRule[] => editState[ev] ?? config.hooks[ev] ?? [];
  const setRules = (ev: string, r: HookRule[]) => setEditState(p => ({ ...p, [ev]: r }));
  const dirty = (ev: string) => { const e = editState[ev]; return e ? JSON.stringify(e) !== JSON.stringify(config.hooks[ev] ?? []) : false; };
  const save = async (ev: string) => { setSaving(ev); try { const u = await api.claudeConfig.updateHooks(ev, getRules(ev)); onUpdate(u); setEditState(p => { const n = { ...p }; delete n[ev]; return n; }); } finally { setSaving(null); } };
  const del = async (ev: string) => { setSaving(ev); try { onUpdate(await api.claudeConfig.deleteHookEvent(ev)); setEditState(p => { const n = { ...p }; delete n[ev]; return n; }); } finally { setSaving(null); } };
  const addRule = (ev: string) => { setRules(ev, [...getRules(ev), { matcher: "", hooks: [{ type: "command", command: "", timeout: 5 }] }]); };
  const rmRule = (ev: string, i: number) => setRules(ev, getRules(ev).filter((_, j) => j !== i));
  const updRule = (ev: string, i: number, f: "matcher", v: string) => { const r = [...getRules(ev)]; r[i] = { ...r[i], [f]: v }; setRules(ev, r); };
  const addHook = (ev: string, i: number) => { const r = [...getRules(ev)]; r[i] = { ...r[i], hooks: [...r[i].hooks, { type: "command", command: "", timeout: 5 }] }; setRules(ev, r); };
  const rmHook = (ev: string, ri: number, hi: number) => { const r = [...getRules(ev)]; r[ri] = { ...r[ri], hooks: r[ri].hooks.filter((_, j) => j !== hi) }; setRules(ev, r); };
  const updHook = (ev: string, ri: number, hi: number, u: Partial<HookEntry>) => { const r = [...getRules(ev)]; const h = [...r[ri].hooks]; h[hi] = { ...h[hi], ...u }; r[ri] = { ...r[ri], hooks: h }; setRules(ev, r); };

  const activeCount = hookEvents.filter(ev => (config.hooks[ev]?.length ?? 0) > 0).length;
  return (
    <div className="space-y-3">
      <SectionHeader icon={Webhook} color="#f97316" label={t("claudeConfig.hooks.title")} desc="Claude Code 事件触发时执行外部命令"
        right={<CountBadges items={[{ label: t("claudeConfig.hooks.configured"), count: activeCount, color: "#f97316" }]} />} />
      {hookEvents.map(ev => {
        const meta = EVENT_LABELS[ev] ?? { label: ev, desc: "" };
        const rules = getRules(ev);
        const has = rules.length > 0;
        const isDirty = dirty(ev);
        return (
          <div key={ev} className={cn("rounded-xl border overflow-hidden", has ? "border-app bg-app-secondary" : "border-app/50 bg-app-secondary/50")}>
            {/* Header — 不再可点击折叠 */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-app">{meta.label}</span>
                  <span className="text-[9px] font-mono text-app-tertiary">{ev}</span>
                  {has && <StatusTag label={`${rules.length} ${t("claudeConfig.hooks.rules")}`} color="var(--accent)" />}
                  {isDirty && <StatusTag label={t("claudeConfig.hooks.unsaved")} color="#eab308" />}
                </div>
                <p className="text-[10px] text-app-tertiary mt-0.5">{meta.desc}</p>
              </div>
              <button onClick={() => addRule(ev)} className="text-app-tertiary hover:text-accent p-1" title="添加规则"><Plus size={14} /></button>
            </div>
            {/* Rules — 始终展示 */}
            {has && (
              <div className="border-t border-app px-4 py-3 space-y-3">
                {rules.map((rule, ri) => (
                  <div key={ri} className="bg-app rounded-lg border border-app/50 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-app-tertiary shrink-0 w-14">Matcher</label>
                      <input value={rule.matcher} onChange={e => updRule(ev, ri, "matcher", e.target.value)} placeholder="* 或留空" spellCheck={false}
                        className="flex-1 bg-app-secondary border border-app rounded px-2 py-1 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                      <button onClick={() => rmRule(ev, ri)} className="text-app-tertiary hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </div>
                    {rule.hooks.map((h, hi) => (
                      <div key={hi} className="flex items-center gap-2 pl-[62px]">
                        <input value={h.command} onChange={e => updHook(ev, ri, hi, { command: e.target.value })} placeholder="/path/to/script.sh" spellCheck={false}
                          className="flex-1 bg-app-secondary border border-app rounded px-2 py-1 text-[11px] font-mono text-app outline-none focus:border-accent/60" />
                        <div className="flex items-center gap-1"><label className="text-[9px] text-app-tertiary">{t("claudeConfig.hooks.timeout")}</label>
                          <input type="number" value={h.timeout} onChange={e => updHook(ev, ri, hi, { timeout: parseInt(e.target.value) || 5 })}
                            className="w-10 bg-app-secondary border border-app rounded px-1.5 py-1 text-[11px] font-mono text-app text-center outline-none" min={1} max={60} /><span className="text-[9px] text-app-tertiary">s</span></div>
                        <button onClick={() => rmHook(ev, ri, hi)} className="text-app-tertiary hover:text-red-400 p-1"><X size={11} /></button>
                      </div>
                    ))}
                    <button onClick={() => addHook(ev, ri)} className="ml-[62px] text-[10px] text-app-tertiary hover:text-accent flex items-center gap-1"><Plus size={10} /> {t("claudeConfig.hooks.addCommand")}</button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => save(ev)} disabled={!isDirty || saving === ev}
                    className={cn("flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium", isDirty ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
                    <Save size={11} />{saving === ev ? t("common.saving") : t("common.save")}</button>
                  <button onClick={() => del(ev)} disabled={saving === ev}
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 border border-red-500/20"><Trash2 size={11} /> {t("claudeConfig.hooks.clear")}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Rules
// ═══════════════════════════════════════════════════════════════════
function SecRules({ rules, onToggle, onCreate, onDelete }: {
  rules: RuleInfo[]; onToggle: (n: string, e: boolean) => Promise<void>;
  onCreate: (name: string, content?: string) => Promise<void>; onDelete: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const detail = rules.find(r => r.name === selected);
  useEffect(() => { api.claudeConfig.presetRules().then(setPresets).catch(() => {}); }, []);
  useEffect(() => {
    const names = new Set(rules.map(r => r.name));
    setPresets(prev => prev.map(p => ({ ...p, installed: names.has(p.name) })));
  }, [rules]);
  const toggle = async (name: string, enabled: boolean, ev: React.MouseEvent) => {
    ev.stopPropagation(); setToggling(name); try { await onToggle(name, enabled); } finally { setToggling(null); }
  };
  const handleCreate = async (name?: string, content?: string) => {
    const n = (name ?? newName).trim(); if (!n) return;
    if (!name) setCreating(true);
    setCreateErr("");
    try { await onCreate(n, content); setNewName(""); setShowCreate(false); setSelected(n); }
    catch (e) { setCreateErr(e instanceof Error ? e.message : t("claudeConfig.agents.createFailed")); }
    finally { if (!name) setCreating(false); }
  };
  const handleDelete = async (name: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!confirm(`${t("claudeConfig.rules.deleteConfirm")} "${name}"？`)) return;
    setDeleting(name);
    try { await onDelete(name); if (selected === name) setSelected(null); }
    finally { setDeleting(null); }
  };
  return (
    <div className="space-y-4">
      <SectionHeader icon={BookOpen} color="#06b6d4" label={t("claudeConfig.rules.title")} desc="~/.claude/rules/"
        right={<div className="flex items-center gap-2">
          <CountBadges items={[{ label: t("common.total"), count: rules.length }, { label: t("common.enabled"), count: rules.filter(r => r.enabled).length, color: "#22c55e" }]} />
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white"><Plus size={10} /> {t("claudeConfig.rules.newRule")}</button>
        </div>} />
      {showCreate && (
        <div className="bg-app-secondary border border-accent/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-app">{t("claudeConfig.rules.newRule")}</p>
          <div className="flex gap-2">
            <input value={newName} onChange={e => { setNewName(e.target.value); setCreateErr(""); }} placeholder="规则名称（如 no-console-log）"
              className="flex-1 px-3 py-2 text-xs bg-app border border-app rounded-lg outline-none focus:border-accent/60 text-app placeholder:text-app-tertiary"
              onKeyDown={e => e.key === "Enter" && handleCreate()} />
            <button onClick={() => handleCreate()} disabled={creating || !newName.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40">
              {creating ? t("common.loading") : t("common.create")}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(""); setCreateErr(""); }}
              className="px-3 py-2 text-xs rounded-lg border border-app text-app-secondary hover:text-app"><X size={12} /></button>
          </div>
          {createErr && <p className="text-[10px] text-red-400">{createErr}</p>}
        </div>
      )}
      <PresetGallery presets={presets} onInstall={(n, c) => handleCreate(n, c)} itemLabel="Rule" />
      {rules.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2">
            {rules.map(r => (
              <button key={r.name} onClick={() => setSelected(r.name)}
                className={cn("w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === r.name ? "border-accent/40 bg-accent/5" : "border-app bg-app-secondary hover:border-app-secondary",
                  !r.enabled && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-app">{r.name}</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={e => handleDelete(r.name, e)} disabled={deleting === r.name}
                      className="p-1 rounded hover:bg-red-500/10 text-app-tertiary hover:text-red-400 transition-colors" title="删除">
                      <Trash2 size={11} />
                    </button>
                    <ToggleSwitch enabled={r.enabled} loading={toggling === r.name} onClick={e => toggle(r.name, !r.enabled, e)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusTag label={r.scope} color="#7878a8" />
                  {!r.enabled && <StatusTag label={t("common.disabled")} color="#ef4444" />}
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {detail ? <DetailPanel title={detail.name} path={detail.path} content={detail.content} contentLabel={t("claudeConfig.rules.ruleContent")} />
              : <EmptyDetail text={t("claudeConfig.rules.selectHint")} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Permissions
// ═══════════════════════════════════════════════════════════════════
function SecPermissions({ config, onUpdate }: { config: ClaudeConfig; onUpdate: (c: ClaudeConfig) => void }) {
  const { t } = useTranslation();
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config.permissions, null, 2));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [parseError, setParseError] = useState("");
  useEffect(() => { setJsonText(JSON.stringify(config.permissions, null, 2)); }, [config.permissions]);
  const handleSave = async () => {
    let parsed; try { parsed = JSON.parse(jsonText); } catch { setParseError(t("claudeConfig.permissions.jsonError")); setStatus("error"); return; }
    setParseError(""); setSaving(true);
    try { onUpdate(await api.claudeConfig.updatePermissions(parsed)); setStatus("ok"); setTimeout(() => setStatus("idle"), 2000); }
    catch (e) { setParseError(e instanceof Error ? e.message : t("common.saveFailed")); setStatus("error"); } finally { setSaving(false); }
  };
  const isDirty = jsonText !== JSON.stringify(config.permissions, null, 2);
  return (
    <div className="space-y-3">
      <SectionHeader icon={Shield} color="#ef4444" label={t("claudeConfig.permissions.title")} desc="Claude Code 工具调用权限（allow / deny 列表）" />
      <textarea value={jsonText} onChange={e => { setJsonText(e.target.value); setStatus("idle"); setParseError(""); }} spellCheck={false}
        rows={Math.max(8, jsonText.split("\n").length + 1)}
        className={cn("w-full bg-app-secondary border rounded-xl px-4 py-3 text-[11px] font-mono text-app outline-none resize-y leading-relaxed", status === "error" ? "border-red-500/40" : "border-app focus:border-accent/60")} />
      {parseError && <p className="text-[11px] text-red-400">{parseError}</p>}
      <button onClick={handleSave} disabled={!isDirty || saving}
        className={cn("flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium", isDirty ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
        {status === "ok" ? <Check size={11} /> : <Save size={11} />}{saving ? t("common.saving") : status === "ok" ? t("common.saved") : t("claudeConfig.permissions.savePermissions")}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: 环境变量
// ═══════════════════════════════════════════════════════════════════
function SecEnvVars() {
  const { t } = useTranslation();
  const DEFS = [
    { key: "ANTHROPIC_API_KEY", desc: t("claudeConfig.envVars.apiKey"), pw: true },
    { key: "ANTHROPIC_AUTH_TOKEN", desc: t("claudeConfig.envVars.authToken"), pw: true },
    { key: "ANTHROPIC_BASE_URL", desc: t("claudeConfig.envVars.apiEndpoint") },
    { key: "ANTHROPIC_MODEL", desc: "默认模型" },
    { key: "HTTPS_PROXY", desc: "HTTPS 代理" },
    { key: "HTTP_PROXY", desc: "HTTP 代理" },
    { key: "NO_PROXY", desc: "绕过代理" },
    { key: "CLAUDE_CONFIG_DIR", desc: "配置目录" },
    { key: "CLAUDE_CACHE_DIR", desc: "缓存目录" },
    { key: "CLAUDE_LOG_LEVEL", desc: "日志级别" },
    { key: "CLAUDE_NO_COLOR", desc: "禁用颜色" },
    { key: "CLAUDE_EDITOR", desc: "默认编辑器" },
    { key: "DEBUG", desc: "调试模式" },
  ];
  return (
    <div className="space-y-4">
      <SectionHeader icon={Variable} color="#a855f7" label={t("claudeConfig.envVars.title")} desc="Claude Code 相关环境变量（只读，修改需在 shell 中设置）" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {DEFS.map(env => (
          <div key={env.key} className="bg-app-secondary border border-app rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold font-mono text-accent">{env.key}</span>
              <span className="text-[9px] text-app-tertiary">{env.desc}</span>
            </div>
            <div className="text-[11px] font-mono text-app-secondary bg-app border border-app rounded-lg px-3 py-2">
              {env.pw ? "••••••••" : <span className="text-app-tertiary">（从环境读取）</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: Plugins
// ═══════════════════════════════════════════════════════════════════
function SecPlugins({ config, overview, onUpdate }: { config: ClaudeConfig; overview: ClaudeOverview | null; onUpdate: (c: ClaudeConfig) => void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const toggle = async (id: string, en: boolean) => { setSaving(id); try { onUpdate(await api.claudeConfig.togglePlugin(id, en)); } finally { setSaving(null); } };
  const remove = async (id: string) => { setSaving(id); try { onUpdate(await api.claudeConfig.removePlugin(id)); } finally { setSaving(null); } };
  const add = async () => { const id = newId.trim(); if (!id) return; setSaving(id); try { onUpdate(await api.claudeConfig.togglePlugin(id, true)); setNewId(""); } finally { setSaving(null); } };
  const plugins = Object.entries(config.enabled_plugins);
  const instMap = new Map((overview?.installed_plugins ?? []).map(p => [p.plugin_id, p]));
  return (
    <div className="space-y-4">
      <SectionHeader icon={Plug} color="#22c55e" label={t("claudeConfig.plugins.title")} desc="启用/禁用 Claude Code 插件" />
      {!plugins.length && <Empty text={t("claudeConfig.plugins.noPlugins")} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {plugins.map(([pid, enabled]) => {
          const inst = instMap.get(pid);
          const [name, pub] = pid.includes("@") ? pid.split("@") : [pid, ""];
          return (
            <div key={pid} className="bg-app-secondary border border-app rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <ToggleSwitch enabled={enabled} loading={saving === pid} onClick={() => toggle(pid, !enabled)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-xs font-semibold text-app">{name}</span>{pub && <span className="text-[9px] text-app-tertiary font-mono">@{pub}</span>}</div>
                </div>
                <StatusTag label={enabled ? t("common.enabled") : t("common.disabled")} color={enabled ? "#22c55e" : "#7878a8"} />
                <button onClick={() => remove(pid)} disabled={saving === pid} className="text-app-tertiary hover:text-red-400 p-1"><Trash2 size={13} /></button>
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
        <input value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder={t("claudeConfig.plugins.inputPluginId")} spellCheck={false}
          className="flex-1 bg-app-secondary border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app placeholder:text-app-tertiary outline-none focus:border-accent/60" />
        <button onClick={add} disabled={!newId.trim()}
          className={cn("flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg font-medium", newId.trim() ? "bg-accent hover:bg-accent-hover text-white" : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed")}>
          <Plus size={12} /> {t("common.add")}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: 监控
// ═══════════════════════════════════════════════════════════════════
function SecMonitoring({ overview }: { overview: ClaudeOverview }) {
  const { t } = useTranslation();
  const [projectDetails, setProjectDetails] = useState<Record<string, ProjectDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!overview?.projects.length) return;
    setLoadingDetails(true);
    Promise.allSettled(
      overview.projects.map(p =>
        api.claudeConfig.projectDetails(p.dir_name).then(d => ({ key: p.dir_name, data: d }))
      )
    ).then(results => {
      const map: Record<string, ProjectDetails> = {};
      for (const r of results) {
        if (r.status === "fulfilled") map[r.value.key] = r.value.data;
      }
      setProjectDetails(map);
      setLoadingDetails(false);
    });
  }, [overview]);

  const fmtTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = Date.now();
    const diffH = (now - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.floor(diffH * 60)}${t("claudeConfig.monitoring.minutesAgo")}`;
    if (diffH < 24) return `${Math.floor(diffH)}${t("claudeConfig.monitoring.hoursAgo")}`;
    if (diffH < 720) return `${Math.floor(diffH / 24)}${t("claudeConfig.monitoring.daysAgo")}`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={Activity} color="#10b981" label={t("claudeConfig.monitoring.title")} desc="Claude Code 使用统计与活动趋势" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("claudeConfig.overviewStats.totalMessages"), value: fmtNum(overview.total_messages), color: "#22c55e" },
          { label: t("claudeConfig.overviewStats.toolCalls"), value: fmtNum(overview.total_tool_calls), color: "#f59e0b" },
          { label: t("claudeConfig.overviewStats.sessionCount"), value: fmtNum(overview.total_sessions), color: "#38bdf8" },
          { label: t("claudeConfig.overviewStats.activeDays"), value: String(overview.active_days), color: "#a78bfa" },
          { label: "Skills", value: String(overview.skills.length), color: "#fbbf24" },
          { label: "MCP", value: String(overview.mcp_servers.length), color: "#60a5fa" },
          { label: "Plugins", value: String(overview.installed_plugins.length), color: "#4ade80" },
          { label: "Projects", value: String(overview.projects.length), color: "#f472b6" },
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
          <div className="flex items-center gap-2 mb-3"><BarChart3 size={13} className="text-app-tertiary" /><span className="text-xs font-semibold text-app">{t("claudeConfig.monitoring.activityTrend")}</span></div>
          <ActivityChart data={overview.daily_activity} />
        </div>
      )}
      <div className="bg-app-secondary border border-app rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen size={13} className="text-green-400" />
          <span className="text-xs font-semibold text-app">{t("claudeConfig.monitoring.projectMemory")}</span>
          <span className="text-[9px] text-app-tertiary">{overview.projects.length} 个项目</span>
          {loadingDetails && <span className="text-[9px] text-app-tertiary animate-pulse">{t("claudeConfig.monitoring.loadingDetails")}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {overview.projects.map(p => {
            const fullPath = "/" + p.dir_name.replace(/^-/, "").replace(/-/g, "/");
            const parts = fullPath.split("/").filter(Boolean);
            const projectName = parts[parts.length - 1] || p.dir_name;
            const details = projectDetails[p.dir_name];
            return (
              <div key={p.dir_name} className="bg-app border border-app rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-app truncate">{projectName}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {p.has_memory && <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">Memory</span>}
                    {p.has_claude_md && <span className="text-[8px] px-1 py-0.5 rounded bg-accent/10 text-accent font-medium">CLAUDE.md</span>}
                  </div>
                </div>
                <p className="text-[9px] text-app-tertiary font-mono truncate">{fullPath}</p>
                {details && (
                  <div className="flex items-center gap-3 pt-0.5">
                    <span className="text-[9px] text-app-tertiary flex items-center gap-1">
                      <MessageSquare size={9} /> {details.session_count} {t("claudeConfig.monitoring.sessions")}
                    </span>
                    {details.last_active && (
                      <span className="text-[9px] text-app-tertiary flex items-center gap-1">
                        <Calendar size={9} /> {fmtTime(details.last_active)}
                      </span>
                    )}
                  </div>
                )}
                {details?.description && (
                  <p className="text-[9px] text-app-tertiary/80 line-clamp-1">{details.description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: 关于
// ═══════════════════════════════════════════════════════════════════
function SecAbout({ systemInfo, overview }: { systemInfo: ClaudeSystemInfo | null; overview: ClaudeOverview | null }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  const checkUpdate = async () => {
    setChecking(true); setUpdateInfo(null);
    try {
      const res = await fetch("https://registry.npmjs.org/@anthropic-ai/claude-code/latest");
      const data = await res.json();
      const latest = data.version as string;
      const current = overview?.cli_version || systemInfo?.cli_version || "";
      if (latest === current) { setUpdateInfo("已是最新版本"); }
      else { setUpdateInfo(`最新版本: ${latest}，运行 npm update -g @anthropic-ai/claude-code 更新`); }
    } catch { setUpdateInfo("检查失败，请手动运行 claude --version"); }
    finally { setChecking(false); }
  };
  const infoItems = [
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
  ];
  return (
    <div className="space-y-4">
      <SectionHeader icon={Info} color="#3b82f6" label="关于 Claude Code" desc="系统信息与诊断" />
      {/* CLI 版本 - 特殊行，带更新按钮 */}
      <div className="bg-app-secondary border border-app rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-app-tertiary">CLI 版本</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-app">{overview?.cli_version || systemInfo?.cli_version || "..."}</span>
            <button onClick={checkUpdate} disabled={checking}
              className="text-[9px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors">
              {checking ? "检查中..." : "检查更新"}
            </button>
          </div>
        </div>
        {updateInfo && (
          <p className={cn("text-[10px] mt-2", updateInfo.startsWith("已是") ? "text-green-400" : "text-yellow-400")}>{updateInfo}</p>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {infoItems.map(({ label, value }) => (
          <div key={label} className="bg-app-secondary border border-app rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] text-app-tertiary">{label}</span>
            <span className="text-[11px] font-mono text-app truncate ml-4 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sec: 回收站
// ═══════════════════════════════════════════════════════════════════
function SecTrash({ items, onRefresh }: { items: DisabledItem[]; onRefresh: () => void }) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; color: string } | null>(null);

  const TYPE_LABELS: Record<string, string> = { agent: "Agent", command: "命令", rule: "规则", skill: "Skill" };
  const TYPE_COLORS: Record<string, string> = { agent: "#f472b6", command: "#22c55e", rule: "#06b6d4", skill: "#eab308" };

  const handleRestore = async (item: DisabledItem) => {
    setRestoring(item.name);
    try {
      await api.claudeConfig.restoreDisabledItem(item.type, item.name);
      setStatus({ text: `已恢复 "${item.name}"`, color: "#22c55e" });
      onRefresh();
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "恢复失败", color: "#ef4444" });
    } finally {
      setRestoring(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDelete = async (item: DisabledItem) => {
    if (!confirm(`确定永久删除 "${item.name}"？此操作不可恢复。`)) return;
    setDeleting(item.name);
    try {
      await api.claudeConfig.deleteDisabledItem(item.type, item.name);
      setStatus({ text: `已永久删除 "${item.name}"`, color: "#22c55e" });
      onRefresh();
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "删除失败", color: "#ef4444" });
    } finally {
      setDeleting(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`确定永久删除所有 ${items.length} 个禁用项？此操作不可恢复。`)) return;
    let ok = 0, fail = 0;
    for (const item of items) {
      try { await api.claudeConfig.deleteDisabledItem(item.type, item.name); ok++; } catch { fail++; }
    }
    setStatus({ text: fail ? `删除 ${ok} 项，${fail} 项失败` : `已永久删除 ${ok} 项`, color: fail ? "#eab308" : "#22c55e" });
    onRefresh();
    setTimeout(() => setStatus(null), 3000);
  };

  const handleRestoreAll = async () => {
    let ok = 0, fail = 0;
    for (const item of items) {
      try { await api.claudeConfig.restoreDisabledItem(item.type, item.name); ok++; } catch { fail++; }
    }
    setStatus({ text: fail ? `恢复 ${ok} 项，${fail} 项失败` : `已恢复 ${ok} 项`, color: fail ? "#eab308" : "#22c55e" });
    onRefresh();
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={ArchiveRestore} color="#f59e0b" label="回收站" desc="已禁用的组件，可恢复或永久删除"
        right={items.length > 0 ? (
          <div className="flex items-center gap-2">
            <button onClick={handleRestoreAll}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-app text-app-secondary hover:text-app hover:border-accent/40 transition-colors">
              <RotateCcw size={10} /> 全部恢复
            </button>
            <button onClick={handleDeleteAll}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 size={10} /> 全部删除
            </button>
          </div>
        ) : undefined} />

      {status && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: `${status.color}15`, color: status.color }}>
          {status.text}
        </div>
      )}

      {!items.length ? <Empty text="没有已禁用的组件" /> : (
        <div className="space-y-2">
          {items.map(item => {
            const typeColor = TYPE_COLORS[item.type] || "#7878a8";
            return (
              <div key={`${item.type}-${item.name}`}
                className="bg-app-secondary border border-app rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusTag label={TYPE_LABELS[item.type] || item.type} color={typeColor} />
                    <span className="text-xs font-semibold text-app">{item.name}</span>
                  </div>
                  <p className="text-[9px] text-app-tertiary font-mono mt-1 truncate">{item.file_path}</p>
                </div>
                <button onClick={() => handleRestore(item)} disabled={restoring === item.name}
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-app text-accent hover:bg-accent/10 transition-colors disabled:opacity-40">
                  <RotateCcw size={10} /> {restoring === item.name ? "..." : "恢复"}
                </button>
                <button onClick={() => handleDelete(item)} disabled={deleting === item.name}
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                  <Trash2 size={10} /> {deleting === item.name ? "..." : "删除"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared tiny components
// ═══════════════════════════════════════════════════════════════════
function StatusTag({ label, color }: { label: string; color: string }) {
  return <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>{label}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-12 text-app-tertiary text-xs">{text}</div>;
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="text-center py-20 text-app-tertiary text-xs">{text}</div>;
}

function DetailPanel({ title, path, metadata, auxiliaryFiles, content, contentLabel }: {
  title: string; path: string; metadata?: Record<string, unknown>;
  auxiliaryFiles?: string[]; content: string; contentLabel: string;
}) {
  return (
    <div className="bg-app-secondary border border-app rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-app">{title}</h3>
        <span className="text-[9px] font-mono text-app-tertiary">{path}</span>
      </div>
      {metadata && Object.keys(metadata).length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-app-secondary uppercase tracking-wider">元数据</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(metadata).map(([k, v]) => (
              <span key={k} className="text-[10px] px-2 py-1 rounded-md bg-app border border-app font-mono">
                <span className="text-accent">{k}</span>: <span className="text-app-secondary">{String(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {auxiliaryFiles && auxiliaryFiles.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-app-secondary uppercase tracking-wider">辅助文件</p>
          <div className="flex flex-wrap gap-1.5">
            {auxiliaryFiles.map(f => <span key={f} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-mono">{f}</span>)}
          </div>
        </div>
      )}
      <div>
        <p className="text-[10px] font-semibold text-app-secondary uppercase tracking-wider mb-2">{contentLabel}</p>
        <pre className="text-[11px] font-mono text-app bg-app border border-app rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed">{content}</pre>
      </div>
    </div>
  );
}

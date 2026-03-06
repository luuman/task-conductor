// frontend/src/components/GlobalConfigPanel.tsx
// 全局配置可视化编辑面板 —— 供 ClaudeConfig 页面嵌入使用
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import {
  Save,
  RotateCcw,
  Download,
  Upload,
  Check,
  AlertTriangle,
  FolderOpen,
  Key,
  Cpu,
  ToggleLeft,
  Settings2,
  Shield,
  Bell,
  Activity,
  GitBranch,
  Palette,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// ── 分区定义 ─────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  desc: string;
  type: "text" | "password" | "number" | "select" | "switch" | "slider" | "textarea" | "json" | "tags" | "kv" | "multicheck";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  checkOptions?: { value: string; label: string }[];
}

interface SectionDef {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: "project", label: "基础信息", desc: "项目标识与工作目录",
    icon: FolderOpen, color: "#22c55e",
    fields: [
      { key: "name", label: "项目名称", desc: "当前 Claude Code 项目标识", type: "text", placeholder: "My Project" },
      { key: "description", label: "项目描述", desc: "项目用途说明", type: "textarea", placeholder: "项目简要描述..." },
      { key: "workDir", label: "工作目录", desc: "代码所在目录路径", type: "text", placeholder: "./" },
      { key: "framework", label: "语言/框架", desc: "Python/JavaScript/Java 等", type: "select", options: [
        { value: "auto", label: "自动检测" },
        { value: "python", label: "Python" },
        { value: "javascript", label: "JavaScript" },
        { value: "typescript", label: "TypeScript" },
        { value: "java", label: "Java" },
        { value: "go", label: "Go" },
        { value: "rust", label: "Rust" },
        { value: "cpp", label: "C++" },
        { value: "other", label: "其他" },
      ]},
    ],
  },
  {
    id: "api", label: "API 配置", desc: "Claude API 认证与连接参数",
    icon: Key, color: "#f59e0b",
    fields: [
      { key: "apiKey", label: "API 密钥", desc: "Claude API 认证密钥", type: "password", placeholder: "sk-ant-..." },
      { key: "endpoint", label: "API 端点", desc: "自定义 API 地址", type: "text", placeholder: "https://api.anthropic.com" },
      { key: "version", label: "API 版本", desc: "API 版本选择", type: "select", options: [
        { value: "v1", label: "v1" },
        { value: "v2", label: "v2" },
        { value: "beta", label: "beta" },
      ]},
      { key: "timeout", label: "超时时间", desc: "请求超时（秒）", type: "number", min: 5, max: 300, unit: "s", placeholder: "30" },
      { key: "retries", label: "重试次数", desc: "失败重试次数", type: "number", min: 0, max: 10, placeholder: "3" },
    ],
  },
  {
    id: "model", label: "模型配置", desc: "模型选择与生成参数调节",
    icon: Cpu, color: "#8b5cf6",
    fields: [
      { key: "model", label: "模型选择", desc: "Claude 模型版本", type: "select", options: [
        { value: "claude-opus-4-6", label: "Claude Opus 4.6 (最强)" },
        { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (均衡)" },
        { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (快速)" },
      ]},
      { key: "temperature", label: "温度", desc: "输出随机性 (0=确定, 1=创意)", type: "slider", min: 0, max: 1, step: 0.05 },
      { key: "maxTokens", label: "最大 Token 数", desc: "响应长度限制", type: "number", min: 256, max: 200000, placeholder: "4096" },
      { key: "topP", label: "Top P", desc: "核采样参数", type: "slider", min: 0, max: 1, step: 0.05 },
      { key: "frequencyPenalty", label: "频率惩罚", desc: "避免重复生成", type: "slider", min: 0, max: 2, step: 0.1 },
      { key: "presencePenalty", label: "存在惩罚", desc: "话题多样性控制", type: "slider", min: 0, max: 2, step: 0.1 },
    ],
  },
  {
    id: "features", label: "功能开关", desc: "启用或禁用各项辅助功能",
    icon: ToggleLeft, color: "#06b6d4",
    fields: [
      { key: "autoComplete", label: "自动补全", desc: "代码自动补全", type: "switch" },
      { key: "realTimeAnalysis", label: "实时分析", desc: "实时代码分析", type: "switch" },
      { key: "errorDetection", label: "错误检测", desc: "自动检测代码错误", type: "switch" },
      { key: "performanceSuggestions", label: "性能建议", desc: "性能优化建议", type: "switch" },
      { key: "securityAudit", label: "安全审计", desc: "代码安全检查", type: "switch" },
      { key: "docGeneration", label: "文档生成", desc: "自动生成文档", type: "switch" },
    ],
  },
  {
    id: "advanced", label: "高级配置", desc: "并发、缓存、日志与网络",
    icon: Settings2, color: "#64748b",
    fields: [
      { key: "concurrency", label: "并发请求", desc: "最大并发数", type: "number", min: 1, max: 50, placeholder: "5" },
      { key: "cacheSize", label: "缓存大小", desc: "响应缓存 (MB)", type: "select", options: [
        { value: "50", label: "50 MB" },
        { value: "100", label: "100 MB" },
        { value: "200", label: "200 MB" },
        { value: "500", label: "500 MB" },
      ]},
      { key: "logLevel", label: "日志级别", desc: "日志详细程度", type: "select", options: [
        { value: "debug", label: "Debug" },
        { value: "info", label: "Info" },
        { value: "warn", label: "Warn" },
        { value: "error", label: "Error" },
      ]},
      { key: "logRetentionDays", label: "日志保留", desc: "日志保留天数", type: "number", min: 1, max: 365, unit: "天", placeholder: "7" },
      { key: "proxy", label: "代理设置", desc: "HTTP 代理地址", type: "text", placeholder: "http://proxy:8080" },
      { key: "customHeaders", label: "自定义头信息", desc: "自定义请求头 (JSON)", type: "json" },
    ],
  },
  {
    id: "permissions", label: "权限配置", desc: "文件、网络与执行权限",
    icon: Shield, color: "#ef4444",
    fields: [
      { key: "fileAccess", label: "文件访问", desc: "读/写/执行权限", type: "multicheck", checkOptions: [
        { value: "read", label: "读取" },
        { value: "write", label: "写入" },
        { value: "execute", label: "执行" },
      ]},
      { key: "networkAccess", label: "网络访问", desc: "允许访问网络", type: "switch" },
      { key: "terminalExec", label: "终端执行", desc: "允许执行命令", type: "switch" },
      { key: "envVars", label: "环境变量", desc: "自定义环境变量", type: "kv" },
      { key: "whitelistPaths", label: "白名单路径", desc: "允许访问的目录", type: "tags" },
      { key: "blacklistFiles", label: "黑名单文件", desc: "禁止访问的文件", type: "tags" },
    ],
  },
  {
    id: "notifications", label: "通知配置", desc: "邮件、Slack 与 Discord",
    icon: Bell, color: "#f97316",
    fields: [
      { key: "emailEnabled", label: "邮件通知", desc: "任务完成时发送邮件", type: "switch" },
      { key: "email", label: "邮箱地址", desc: "接收通知的邮箱", type: "text", placeholder: "user@example.com" },
      { key: "slackWebhook", label: "Slack Webhook", desc: "Slack 集成 Webhook URL", type: "text", placeholder: "https://hooks.slack.com/..." },
      { key: "discordWebhook", label: "Discord Webhook", desc: "Discord 集成 Webhook URL", type: "text", placeholder: "https://discord.com/api/webhooks/..." },
      { key: "notifyLevel", label: "通知级别", desc: "触发通知的最低级别", type: "select", options: [
        { value: "all", label: "所有事件" },
        { value: "warn", label: "警告及以上" },
        { value: "error", label: "仅错误" },
      ]},
    ],
  },
  {
    id: "monitoring", label: "性能监控", desc: "采样、告警与数据保留",
    icon: Activity, color: "#10b981",
    fields: [
      { key: "enabled", label: "监控开关", desc: "启用性能监控", type: "switch" },
      { key: "sampleRate", label: "采样率", desc: "监控数据采样比例", type: "slider", min: 0, max: 100, step: 5, unit: "%" },
      { key: "alertThresholdMs", label: "告警阈值", desc: "响应时间告警阈值", type: "number", min: 100, max: 60000, unit: "ms", placeholder: "2000" },
      { key: "dataRetentionDays", label: "数据保留", desc: "监控数据保留天数", type: "number", min: 1, max: 365, unit: "天", placeholder: "30" },
    ],
  },
  {
    id: "integrations", label: "集成配置", desc: "Git、Jira、GitHub 与 Slack",
    icon: GitBranch, color: "#a855f7",
    fields: [
      { key: "gitAutoCommit", label: "Git 自动提交", desc: "自动提交代码变更", type: "switch" },
      { key: "jiraUrl", label: "Jira 地址", desc: "Jira 实例 URL", type: "text", placeholder: "https://your-org.atlassian.net" },
      { key: "jiraToken", label: "Jira Token", desc: "Jira API 认证令牌", type: "password", placeholder: "jira-api-token" },
      { key: "githubToken", label: "GitHub Token", desc: "GitHub 个人访问令牌", type: "password", placeholder: "ghp_..." },
      { key: "slackBotToken", label: "Slack Bot Token", desc: "Slack Bot OAuth Token", type: "password", placeholder: "xoxb-..." },
    ],
  },
  {
    id: "ui", label: "界面设置", desc: "主题、字体与显示偏好",
    icon: Palette, color: "#ec4899",
    fields: [
      { key: "theme", label: "主题", desc: "界面主题模式", type: "select", options: [
        { value: "system", label: "跟随系统" },
        { value: "dark", label: "暗色" },
        { value: "light", label: "亮色" },
      ]},
      { key: "fontSize", label: "字体大小", desc: "界面字号", type: "select", options: [
        { value: "small", label: "小" },
        { value: "medium", label: "中" },
        { value: "large", label: "大" },
      ]},
      { key: "codeHighlight", label: "代码高亮", desc: "启用语法高亮", type: "switch" },
      { key: "autoSave", label: "自动保存", desc: "配置变更自动保存", type: "switch" },
    ],
  },
];

// ── 字段渲染器 ───────────────────────────────────────────────────────

function FieldRenderer({ field, value, onChange }: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [kvKey, setKvKey] = useState("");
  const [kvVal, setKvVal] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const jsonInit = useRef(false);

  // JSON 字段初始化
  useEffect(() => {
    if (field.type === "json" && !jsonInit.current) {
      setJsonText(typeof value === "object" ? JSON.stringify(value, null, 2) : "{}");
      jsonInit.current = true;
    }
  }, [field.type, value]);

  const inputCls = "w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60 placeholder:text-app-tertiary";

  switch (field.type) {
    case "text":
      return (
        <input value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder} spellCheck={false}
          className={inputCls} />
      );

    case "password":
      return (
        <div className="relative">
          <input type={showPassword ? "text" : "password"}
            value={typeof value === "string" ? value : ""}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder} spellCheck={false}
            className={cn(inputCls, "pr-8")} />
          <button onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-app-tertiary hover:text-app transition-colors">
            {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      );

    case "number":
      return (
        <div className="flex items-center gap-2">
          <input type="number" value={typeof value === "number" ? value : ""}
            onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
            min={field.min} max={field.max}
            placeholder={field.placeholder}
            className={cn(inputCls, "flex-1")} />
          {field.unit && <span className="text-[10px] text-app-tertiary shrink-0">{field.unit}</span>}
        </div>
      );

    case "select":
      return (
        <select value={typeof value === "string" ? value : String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          className={cn(inputCls, "cursor-pointer")}>
          {field.options?.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );

    case "switch": {
      const on = value === true;
      return (
        <div className="flex items-center gap-3">
          <button onClick={() => onChange(!on)}
            className={cn("w-10 h-[22px] rounded-full transition-colors relative shrink-0",
              on ? "bg-accent" : "bg-app-tertiary/40")}>
            <div className={cn("absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-[22px]" : "translate-x-[3px]")} />
          </button>
          <span className={cn("text-[11px] font-medium", on ? "text-accent" : "text-app-tertiary")}>
            {on ? "已开启" : "已关闭"}
          </span>
        </div>
      );
    }

    case "slider": {
      const num = typeof value === "number" ? value : field.min ?? 0;
      const pct = ((num - (field.min ?? 0)) / ((field.max ?? 1) - (field.min ?? 0))) * 100;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative h-2 bg-app-tertiary/20 rounded-full">
              <div className="absolute h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              <input type="range" min={field.min} max={field.max} step={field.step}
                value={num}
                onChange={e => onChange(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" />
            </div>
            <span className="text-[11px] font-mono text-app tabular-nums w-12 text-right">
              {num}{field.unit || ""}
            </span>
          </div>
          <div className="flex justify-between text-[9px] text-app-tertiary font-mono">
            <span>{field.min}{field.unit || ""}</span>
            <span>{field.max}{field.unit || ""}</span>
          </div>
        </div>
      );
    }

    case "textarea":
      return (
        <textarea value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder} spellCheck={false}
          rows={3}
          className={cn(inputCls, "resize-y")} />
      );

    case "json": {
      return (
        <div className="space-y-1.5">
          <textarea value={jsonText}
            onChange={e => {
              setJsonText(e.target.value);
              setJsonError("");
              try { onChange(JSON.parse(e.target.value)); }
              catch { setJsonError("JSON 格式错误"); }
            }}
            spellCheck={false} rows={4}
            className={cn(inputCls, "resize-y", jsonError && "border-red-500/40")} />
          {jsonError && <p className="text-[10px] text-red-400">{jsonError}</p>}
        </div>
      );
    }

    case "tags": {
      const tags = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/10 text-accent font-mono">
                {t}
                <button onClick={() => onChange(tags.filter((_, j) => j !== i))}
                  className="hover:text-red-400 transition-colors">
                  <Trash2 size={9} />
                </button>
              </span>
            ))}
            {tags.length === 0 && <span className="text-[10px] text-app-tertiary">暂无</span>}
          </div>
          <div className="flex gap-1.5">
            <input value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && tagInput.trim()) {
                  onChange([...tags, tagInput.trim()]);
                  setTagInput("");
                }
              }}
              placeholder="输入后按 Enter 添加" spellCheck={false}
              className={cn(inputCls, "flex-1")} />
            <button onClick={() => {
              if (tagInput.trim()) { onChange([...tags, tagInput.trim()]); setTagInput(""); }
            }}
              className="text-[10px] px-2 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              <Plus size={11} />
            </button>
          </div>
        </div>
      );
    }

    case "kv": {
      const obj = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value as Record<string, string> : {};
      const entries = Object.entries(obj);
      return (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-1 rounded">{k}</span>
              <span className="text-[10px] text-app-tertiary">=</span>
              <span className="text-[10px] font-mono text-app flex-1 truncate">{v}</span>
              <button onClick={() => {
                const next = { ...obj };
                delete next[k];
                onChange(next);
              }} className="text-app-tertiary hover:text-red-400 transition-colors">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {entries.length === 0 && <span className="text-[10px] text-app-tertiary">暂无</span>}
          <div className="flex gap-1.5">
            <input value={kvKey} onChange={e => setKvKey(e.target.value)}
              placeholder="KEY" spellCheck={false}
              className={cn(inputCls, "w-28")} />
            <input value={kvVal} onChange={e => setKvVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && kvKey.trim()) {
                  onChange({ ...obj, [kvKey.trim()]: kvVal });
                  setKvKey(""); setKvVal("");
                }
              }}
              placeholder="VALUE" spellCheck={false}
              className={cn(inputCls, "flex-1")} />
            <button onClick={() => {
              if (kvKey.trim()) { onChange({ ...obj, [kvKey.trim()]: kvVal }); setKvKey(""); setKvVal(""); }
            }}
              className="text-[10px] px-2 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              <Plus size={11} />
            </button>
          </div>
        </div>
      );
    }

    case "multicheck": {
      const selected = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="flex flex-wrap gap-2">
          {field.checkOptions?.map(o => {
            const checked = selected.includes(o.value);
            return (
              <button key={o.value}
                onClick={() => {
                  if (checked) onChange(selected.filter(v => v !== o.value));
                  else onChange([...selected, o.value]);
                }}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all",
                  checked
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-app bg-app text-app-tertiary hover:border-app-secondary"
                )}>
                <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center",
                  checked ? "border-accent bg-accent" : "border-app-tertiary/60")}>
                  {checked && <Check size={9} className="text-white" />}
                </div>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

// ── 分区面板 ─────────────────────────────────────────────────────────

function SectionPanel({ section, data, onChange, expanded, onToggle }: {
  section: SectionDef;
  data: AnyObj;
  onChange: (key: string, value: unknown) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;
  const filledCount = section.fields.filter(f => {
    const v = data[f.key];
    if (v === undefined || v === null || v === "") return false;
    if (f.type === "switch") return v === true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }).length;

  return (
    <div className={cn("rounded-xl border transition-all",
      expanded ? "border-app bg-app-secondary" : "border-app/60 bg-app-secondary/50 hover:border-app")}>
      {/* Header */}
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${section.color}15`, border: `1px solid ${section.color}30` }}>
          <Icon size={15} style={{ color: section.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-app">{section.label}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-app-tertiary/20 text-app-tertiary font-mono">
              {filledCount}/{section.fields.length}
            </span>
          </div>
          <p className="text-[10px] text-app-tertiary mt-0.5">{section.desc}</p>
        </div>
        {expanded
          ? <ChevronDown size={14} className="text-app-tertiary shrink-0" />
          : <ChevronRight size={14} className="text-app-tertiary shrink-0" />}
      </button>

      {/* Fields */}
      {expanded && (
        <div className="border-t border-app px-4 py-4 space-y-4">
          {section.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-[11px] font-medium text-app">{field.label}</span>
                  <span className="text-[10px] text-app-tertiary ml-2">{field.desc}</span>
                </div>
                <span className="text-[9px] font-mono text-app-tertiary/60">{section.id}.{field.key}</span>
              </div>
              <FieldRenderer field={field} value={data[field.key]} onChange={v => onChange(field.key, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 状态指示器 ───────────────────────────────────────────────────────

function StatusBar({ config, lastSaved, saving, dirty }: {
  config: AnyObj | null;
  lastSaved: string | null;
  saving: boolean;
  dirty: boolean;
}) {
  const apiOk = !!(config?.api?.apiKey);
  const modelName = config?.model?.model || "未设置";
  const monitorOn = config?.monitoring?.enabled !== false;

  return (
    <div className="flex items-center gap-4 flex-wrap text-[10px]">
      {/* API 状态 */}
      <div className="flex items-center gap-1.5">
        <div className={cn("w-2 h-2 rounded-full", apiOk ? "bg-green-400" : "bg-yellow-400")} />
        <span className="text-app-tertiary">API</span>
        <span className={cn("font-medium", apiOk ? "text-green-400" : "text-yellow-400")}>
          {apiOk ? "已配置" : "未配置"}
        </span>
      </div>
      {/* 模型 */}
      <div className="flex items-center gap-1.5">
        <Cpu size={10} className="text-app-tertiary" />
        <span className="text-app-tertiary">模型</span>
        <span className="font-mono text-app-secondary">{modelName.replace("claude-", "").slice(0, 15)}</span>
      </div>
      {/* 监控 */}
      <div className="flex items-center gap-1.5">
        <Activity size={10} className="text-app-tertiary" />
        <span className={cn("font-medium", monitorOn ? "text-green-400" : "text-app-tertiary")}>
          {monitorOn ? "监控中" : "监控关"}
        </span>
      </div>
      {/* 保存状态 */}
      <div className="ml-auto flex items-center gap-1.5">
        {saving && <span className="text-accent animate-pulse">保存中...</span>}
        {dirty && !saving && <span className="text-yellow-400">有未保存的更改</span>}
        {!dirty && !saving && lastSaved && (
          <span className="text-app-tertiary">
            最后保存: {lastSaved}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────────

export default function GlobalConfigPanel() {
  const [config, setConfig] = useState<AnyObj | null>(null);
  const [savedConfig, setSavedConfig] = useState<AnyObj | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("project");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api.tcConfig.get();
      setConfig(data);
      setSavedConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig);

  const handleFieldChange = (section: string, key: string, value: unknown) => {
    if (!config) return;
    setConfig(prev => ({
      ...prev!,
      [section]: { ...(prev![section] || {}), [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true); setSaveStatus("idle");
    try {
      const updated = await api.tcConfig.update(config);
      setConfig(updated);
      setSavedConfig(updated);
      setSaveStatus("ok");
      setLastSaved(new Date().toLocaleTimeString());
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const defaults = await api.tcConfig.reset();
      setConfig(defaults);
      setSavedConfig(defaults);
      setLastSaved(new Date().toLocaleTimeString());
    } finally { setSaving(false); }
  };

  const handleExport = () => {
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tc-global-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        setSaving(true);
        const updated = await api.tcConfig.import(data);
        setConfig(updated);
        setSavedConfig(updated);
        setLastSaved(new Date().toLocaleTimeString());
      } catch {
        setError("导入失败：JSON 格式错误");
      } finally { setSaving(false); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-app-tertiary text-xs animate-pulse">加载全局配置...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[11px] text-red-400">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* 状态栏 */}
      <div className="bg-app-secondary border border-app rounded-xl px-4 py-3">
        <StatusBar config={config} lastSaved={lastSaved} saving={saving} dirty={!!dirty} />
      </div>

      {/* 分区列表 */}
      <div className="space-y-2">
        {SECTIONS.map(section => (
          <SectionPanel
            key={section.id}
            section={section}
            data={config?.[section.id] || {}}
            onChange={(key, value) => handleFieldChange(section.id, key, value)}
            expanded={expandedSection === section.id}
            onToggle={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
          />
        ))}
      </div>

      {/* 操作按钮栏 */}
      <div className="flex items-center gap-2 pt-2 pb-4 sticky bottom-0 bg-app/80 backdrop-blur-sm rounded-xl px-1">
        <button onClick={handleSave} disabled={saving || !dirty}
          className={cn(
            "flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg font-medium transition-all",
            dirty
              ? "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20"
              : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed"
          )}>
          {saveStatus === "ok" ? <Check size={12} /> : <Save size={12} />}
          {saving ? "保存中..." : saveStatus === "ok" ? "已保存" : "保存配置"}
        </button>

        <button onClick={handleReset} disabled={saving}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
          <RotateCcw size={11} />
          重置默认
        </button>

        <div className="flex-1" />

        <button onClick={handleExport}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-app text-app-secondary hover:text-app transition-colors">
          <Download size={11} />
          导出
        </button>

        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-app text-app-secondary hover:text-app transition-colors">
          <Upload size={11} />
          导入
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />

        <button onClick={load} disabled={saving}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-app text-app-secondary hover:text-app transition-colors">
          <Zap size={11} />
          刷新
        </button>
      </div>
    </div>
  );
}

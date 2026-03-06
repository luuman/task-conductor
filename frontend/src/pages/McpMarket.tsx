// frontend/src/pages/McpMarket.tsx
import { useEffect, useState } from "react";
import {
  BookOpen, Figma, Calendar, Mail, Github, Globe, Folder,
  Database, Bug, LayoutList, Puzzle, Check, Loader2, Trash2, Lock, KeyRound,
} from "lucide-react";
import { api, type McpMarketServer } from "../lib/api";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "book-open": BookOpen,
  figma: Figma,
  calendar: Calendar,
  mail: Mail,
  github: Github,
  globe: Globe,
  folder: Folder,
  database: Database,
  bug: Bug,
  "layout-list": LayoutList,
  puzzle: Puzzle,
};

const CATEGORY_LABEL: Record<string, string> = {
  knowledge: "知识",
  design: "设计",
  productivity: "效率",
  development: "开发",
  utility: "工具",
  database: "数据库",
  custom: "自定义",
};

const CATEGORY_ORDER = ["development", "productivity", "knowledge", "design", "utility", "database", "custom"];

function ServerCard({ server, onAction }: {
  server: McpMarketServer;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  const Icon = ICON_MAP[server.icon] || Puzzle;
  const isOAuth = server.auth_type === "oauth";
  const needsToken = server.auth_type === "token" && !server.installed;

  const handleInstall = async () => {
    if (needsToken && !showTokenInput) {
      setShowTokenInput(true);
      return;
    }
    setLoading(true);
    try {
      await api.mcp.install(server.id, tokenInput || undefined);
      onAction();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setShowTokenInput(false);
      setTokenInput("");
    }
  };

  const handleUninstall = async () => {
    setLoading(true);
    try {
      await api.mcp.uninstall(server.id);
      onAction();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 transition-all group"
      style={{
        background: "var(--background-secondary)",
        border: `1px solid ${server.installed ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: server.installed ? "rgba(34,197,94,0.12)" : "var(--background-tertiary)",
          }}
        >
          <Icon size={20} className={server.installed ? "text-green-400" : "text-white/60"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-app">{server.name}</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
              style={{
                background: "var(--background-tertiary)",
                color: "var(--text-tertiary)",
              }}
            >
              {server.type.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] text-app-tertiary mt-0.5 leading-relaxed">
            {server.description}
          </p>
        </div>
      </div>

      {/* Token input */}
      {showTokenInput && (
        <div className="flex gap-2">
          <input
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder={server.auth_note || "输入 Token"}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-accent/60"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {isOAuth && !server.installed && (
          <span className="text-[10px] text-yellow-400/80 flex items-center gap-1">
            <Lock size={10} />
            {server.auth_note || "需要 OAuth 授权"}
          </span>
        )}
        {needsToken && !showTokenInput && !server.installed && (
          <span className="text-[10px] text-blue-400/80 flex items-center gap-1">
            <KeyRound size={10} />
            需要 API Token
          </span>
        )}
        {!isOAuth && !needsToken && !server.installed && <span />}
        {server.installed && (
          <span className="text-[10px] text-green-400 flex items-center gap-1 font-medium">
            <Check size={10} />
            已安装
          </span>
        )}

        <div className="flex gap-2">
          {server.installed ? (
            <button
              onClick={handleUninstall}
              disabled={loading}
              className="px-3 py-1.5 text-[11px] rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              卸载
            </button>
          ) : isOAuth ? (
            <button
              onClick={handleInstall}
              disabled={loading}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />}
              授权安装
            </button>
          ) : (
            <button
              onClick={handleInstall}
              disabled={loading || (needsToken && showTokenInput && !tokenInput.trim())}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {loading && <Loader2 size={11} className="animate-spin" />}
              {showTokenInput ? "确认安装" : "安装"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function McpMarket() {
  const [servers, setServers] = useState<McpMarketServer[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const load = () => {
    api.mcp.list().then(setServers).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const categories = CATEGORY_ORDER.filter(c =>
    servers.some(s => s.category === c)
  );

  const filtered = filter === "all"
    ? servers
    : filter === "installed"
    ? servers.filter(s => s.installed)
    : servers.filter(s => s.category === filter);

  const installedCount = servers.filter(s => s.installed).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-xs text-app-tertiary">
          一键安装 MCP 服务，扩展 Claude 的能力。已安装 {installedCount} / {servers.length} 个服务。
        </p>
      </div>

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {[
            { id: "all", label: "全部" },
            { id: "installed", label: `已安装 (${installedCount})` },
            ...categories.map(c => ({ id: c, label: CATEGORY_LABEL[c] || c })),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
              style={{
                background: filter === tab.id ? "var(--accent-subtle)" : "var(--background-secondary)",
                color: filter === tab.id ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${filter === tab.id ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(s => (
            <ServerCard key={s.id} server={s} onAction={load} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-app-tertiary text-sm">
            暂无匹配的 MCP 服务
          </div>
        )}
    </div>
  );
}

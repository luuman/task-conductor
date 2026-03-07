// frontend/src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getConfig, clearConfig } from "../lib/api";
import { cn } from "../lib/utils";
import { PerfSettings } from "../modules/perf/settings/PerfSettings";

interface SettingsProps {
  onDisconnect: () => void;
}

type TokenStatus = "checking" | "valid" | "invalid";
type SaveStatus = "idle" | "saving" | "ok" | "error";

export default function Settings({ onDisconnect }: SettingsProps) {
  const config = getConfig();
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [agentVersion, setAgentVersion] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);

  // workspace root
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");

  const baseUrl = (() => {
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (isLocal) return import.meta.env.VITE_API_URL || "http://localhost:8765";
    return config?.tunnelUrl || "http://localhost:8765";
  })();

  const connType =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "本地直连"
      : config?.type === "tunnel"
      ? "Cloudflare Tunnel"
      : config?.type === "ssh"
      ? "SSH 隧道"
      : "未知";

  const checkToken = async () => {
    setChecking(true);
    setTokenStatus("checking");
    try {
      await api.health();
      setTokenStatus("valid");
    } catch {
      setTokenStatus("invalid");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkToken();
    api.agentInfo()
      .then((info) => { setAgentVersion(info.version); setTunnelUrl(info.tunnel_url); })
      .catch(() => {});
    api.settings.get()
      .then((s) => { setWorkspaceRoot(s.workspace_root); setWorkspaceInput(s.workspace_root); })
      .catch(() => {});
  }, []);

  const handleSaveWorkspace = async () => {
    const path = workspaceInput.trim();
    if (!path || path === workspaceRoot) return;
    setSaveStatus("saving");
    setSaveError("");
    try {
      const res = await api.settings.update(path);
      setWorkspaceRoot(res.workspace_root);
      setWorkspaceInput(res.workspace_root);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "保存失败");
      setSaveStatus("error");
    }
  };

  const handleDisconnect = () => { clearConfig(); onDisconnect(); };

  const handleShutdown = async () => {
    if (!confirm("确定要关闭后端服务吗？关闭后需要在服务器上重新启动。")) return;
    setShuttingDown(true);
    try {
      await api.shutdown();
    } catch {
      // 服务关闭后请求会失败，属于正常情况
    }
  };

  const isDirty = workspaceInput.trim() !== workspaceRoot;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-base font-semibold text-app">设置</h1>
          <p className="text-app-tertiary text-xs mt-0.5">工作区配置与连接认证</p>
        </div>

        {/* 工作区设置 */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">工作区</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">
              新建项目时会在此根目录下创建对应文件夹
            </p>
          </div>

          <div className="px-4 py-4 space-y-3">
            {/* 路径输入 */}
            <div>
              <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1.5">
                根目录路径
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    value={workspaceInput}
                    onChange={(e) => { setWorkspaceInput(e.target.value); setSaveStatus("idle"); setSaveError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveWorkspace()}
                    placeholder="/home/user/projects"
                    spellCheck={false}
                    className={cn(
                      "w-full bg-app border rounded-md px-3 py-2 text-xs font-mono text-app outline-none transition-colors",
                      saveStatus === "error" ? "border-red-500/60 focus:border-red-500" :
                      isDirty ? "border-accent/60 focus:border-accent" :
                      "border-app focus:border-accent/60"
                    )}
                  />
                </div>
                <button
                  onClick={handleSaveWorkspace}
                  disabled={!isDirty || saveStatus === "saving"}
                  className={cn(
                    "px-3 py-2 text-xs rounded-md font-medium transition-all shrink-0",
                    !isDirty || saveStatus === "saving"
                      ? "bg-app-tertiary/30 text-app-tertiary cursor-not-allowed"
                      : "bg-accent hover:bg-accent-hover text-white"
                  )}
                >
                  {saveStatus === "saving" ? "保存中..." : saveStatus === "ok" ? "已保存 ✓" : "保存"}
                </button>
              </div>

              {/* Error */}
              {saveStatus === "error" && saveError && (
                <p className="text-[11px] text-red-400 mt-1.5">{saveError}</p>
              )}
            </div>

            {/* 当前生效预览 */}
            <div className="bg-app rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium">路径预览</p>
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <span className="text-app-secondary">{workspaceRoot || "…"}</span>
                <span className="text-app-tertiary">/</span>
                <span className="text-accent">{"<项目名称>"}</span>
              </div>
              <p className="text-[10px] text-app-tertiary">
                例：{workspaceRoot || "…"}/my-app
              </p>
            </div>
          </div>
        </section>

        {/* ── 性能模块 ── */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--background-secondary)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>底部性能栏</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>控制底部栏显示的指标与顺序</p>
          </div>
          <PerfSettings />
        </div>

        {/* 连接与认证 */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">连接与认证</h2>
          </div>

          <div className="divide-y divide-app">
            <Row label="连接地址">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[11px] text-accent truncate">{baseUrl}</span>
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border border-app text-app-tertiary">
                  {connType}
                </span>
              </div>
            </Row>

            <Row label="Token 状态">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  tokenStatus === "valid"   ? "bg-green-400" :
                  tokenStatus === "invalid" ? "bg-red-400" : "bg-yellow-400 animate-pulse"
                )} />
                <span className={cn(
                  "text-xs",
                  tokenStatus === "valid"   ? "text-green-400" :
                  tokenStatus === "invalid" ? "text-red-400" : "text-yellow-400"
                )}>
                  {tokenStatus === "valid" ? "有效" : tokenStatus === "invalid" ? "无效" : "验证中..."}
                </span>
                <button
                  onClick={checkToken}
                  disabled={checking}
                  className="text-[10px] text-app-tertiary hover:text-app transition-colors disabled:opacity-40"
                >
                  重新验证
                </button>
              </div>
            </Row>

            <Row label="后端版本">
              {agentVersion ? (
                <span className="text-xs text-app font-mono">v{agentVersion}</span>
              ) : (
                <span className="text-xs text-app-tertiary">获取中...</span>
              )}
            </Row>

            <Row label="Tunnel 地址">
              {tunnelUrl ? (
                <a
                  href={tunnelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-accent hover:underline truncate max-w-[320px]"
                >
                  {tunnelUrl}
                </a>
              ) : (
                <span className="text-xs text-app-tertiary">未检测到</span>
              )}
            </Row>

            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-app">重新配置连接</p>
                <p className="text-[10px] text-app-tertiary mt-0.5">清除本地凭据，返回登录页</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                断开连接
              </button>
            </div>
          </div>
        </section>

        {/* 关闭服务 */}
        <section className="bg-app-secondary border border-red-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-app font-semibold">关闭服务</p>
              <p className="text-[10px] text-app-tertiary mt-0.5">
                停止后端进程，关闭后需要在服务器上手动重新启动
              </p>
            </div>
            <button
              onClick={handleShutdown}
              disabled={shuttingDown}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
                shuttingDown
                  ? "bg-red-500/20 text-red-300 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-500 text-white"
              )}
            >
              {shuttingDown ? "正在关闭..." : "关闭服务"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <span className="text-xs text-app-tertiary shrink-0 w-24">{label}</span>
      <div className="flex-1 flex justify-end min-w-0">{children}</div>
    </div>
  );
}

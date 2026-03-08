// frontend/src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getConfig, clearConfig } from "../lib/api";
import { cn } from "../lib/utils";
import { PerfSettings } from "../modules/perf/settings/PerfSettings";
import { setLanguage, getLanguage } from "../i18n";

interface SettingsProps {
  onDisconnect: () => void;
}

type TokenStatus = "checking" | "valid" | "invalid";
type SaveStatus = "idle" | "saving" | "ok" | "error";

export default function Settings({ onDisconnect }: SettingsProps) {
  const { t } = useTranslation();
  const config = getConfig();
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [agentVersion, setAgentVersion] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // workspace root
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");

  // feishu config
  const [feishu, setFeishu] = useState({ app_id: "", app_secret: "", owner_id: "", default_chat_id: "" });
  const [feishuInput, setFeishuInput] = useState({ app_id: "", app_secret: "", owner_id: "", default_chat_id: "" });
  const [feishuSaveStatus, setFeishuSaveStatus] = useState<SaveStatus>("idle");

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
      ? t('settings.connectionTypes.local')
      : config?.type === "tunnel"
      ? t('settings.connectionTypes.tunnel')
      : config?.type === "ssh"
      ? t('settings.connectionTypes.ssh')
      : t('settings.connectionTypes.unknown');

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
      .then((s) => {
        setWorkspaceRoot(s.workspace_root); setWorkspaceInput(s.workspace_root);
        const fs = { app_id: s.feishu_app_id || "", app_secret: s.feishu_app_secret || "", owner_id: s.feishu_owner_id || "", default_chat_id: s.feishu_default_chat_id || "" };
        setFeishu(fs); setFeishuInput(fs);
      })
      .catch(() => {});
  }, []);

  const handleSaveWorkspace = async () => {
    const path = workspaceInput.trim();
    if (!path || path === workspaceRoot) return;
    setSaveStatus("saving");
    setSaveError("");
    try {
      const res = await api.settings.update({ workspace_root: path });
      setWorkspaceRoot(res.workspace_root as string);
      setWorkspaceInput(res.workspace_root as string);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t('common.saveFailed'));
      setSaveStatus("error");
    }
  };

  const handleDisconnect = () => { clearConfig(); onDisconnect(); };

  const handleShutdown = async () => {
    if (!confirm(t('settings.shutdown.confirmShutdown'))) return;
    setShuttingDown(true);
    try {
      await api.shutdown();
    } catch {
      // 服务关闭后请求会失败，属于正常情况
    }
  };

  const handleSaveFeishu = async () => {
    setFeishuSaveStatus("saving");
    try {
      const body: Record<string, string> = {};
      if (feishuInput.app_id !== feishu.app_id) body.feishu_app_id = feishuInput.app_id;
      if (feishuInput.app_secret !== feishu.app_secret) body.feishu_app_secret = feishuInput.app_secret;
      if (feishuInput.owner_id !== feishu.owner_id) body.feishu_owner_id = feishuInput.owner_id;
      if (feishuInput.default_chat_id !== feishu.default_chat_id) body.feishu_default_chat_id = feishuInput.default_chat_id;
      if (Object.keys(body).length === 0) { setFeishuSaveStatus("idle"); return; }
      await api.settings.updateFeishu(body);
      setFeishu({ ...feishuInput });
      setFeishuSaveStatus("ok");
      setTimeout(() => setFeishuSaveStatus("idle"), 2000);
    } catch {
      setFeishuSaveStatus("error");
    }
  };

  const handleRestart = async () => {
    if (!confirm(t('settings.restart.confirm'))) return;
    setRestarting(true);
    try {
      await api.settings.restart();
    } catch {
      // 重启后连接会断开，属于正常情况
    }
    // 等待后端重启后刷新页面
    setTimeout(() => window.location.reload(), 3000);
  };

  const isFeishuDirty = feishuInput.app_id !== feishu.app_id ||
    feishuInput.app_secret !== feishu.app_secret ||
    feishuInput.owner_id !== feishu.owner_id ||
    feishuInput.default_chat_id !== feishu.default_chat_id;

  const isDirty = workspaceInput.trim() !== workspaceRoot;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-base font-semibold text-app">{t('settings.header.title')}</h1>
          <p className="text-app-tertiary text-xs mt-0.5">{t('settings.header.subtitle')}</p>
        </div>

        {/* 工作区设置 */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.workspace.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">
              {t('settings.workspace.hint')}
            </p>
          </div>

          <div className="px-4 py-4 space-y-3">
            {/* 路径输入 */}
            <div>
              <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1.5">
                {t('settings.workspace.rootPath')}
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
                  {saveStatus === "saving" ? t('settings.saveStates.saving') : saveStatus === "ok" ? t('settings.saveStates.saved') : t('settings.saveStates.save')}
                </button>
              </div>

              {/* Error */}
              {saveStatus === "error" && saveError && (
                <p className="text-[11px] text-red-400 mt-1.5">{saveError}</p>
              )}
            </div>

            {/* 当前生效预览 */}
            <div className="bg-app rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium">{t('settings.workspace.pathPreview')}</p>
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <span className="text-app-secondary">{workspaceRoot || "…"}</span>
                <span className="text-app-tertiary">/</span>
                <span className="text-accent">{t('settings.workspace.projectName')}</span>
              </div>
              <p className="text-[10px] text-app-tertiary">
                {t('settings.workspace.example')}{workspaceRoot || "…"}/my-app
              </p>
            </div>
          </div>
        </section>

        {/* ── 语言切换 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.language.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.language.hint')}</p>
          </div>
          <div className="px-4 py-3 flex gap-2">
            {(["zh", "en"] as const).map(lng => (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                className={cn(
                  "px-4 py-2 text-xs rounded-md font-medium transition-all",
                  getLanguage() === lng
                    ? "bg-accent text-white"
                    : "bg-app border border-app text-app-secondary hover:text-app"
                )}
              >
                {t(`settings.language.${lng}`)}
              </button>
            ))}
          </div>
        </section>

        {/* ── 飞书配置 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.feishu.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.feishu.hint')}</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <FieldInput label="App ID" value={feishuInput.app_id}
              onChange={v => setFeishuInput(p => ({ ...p, app_id: v }))}
              placeholder="cli_xxxxxxxx" />
            <FieldInput label="App Secret" value={feishuInput.app_secret}
              onChange={v => setFeishuInput(p => ({ ...p, app_secret: v }))}
              placeholder="xxxxxxxx" type="password" />
            <FieldInput label="Owner ID" value={feishuInput.owner_id}
              onChange={v => setFeishuInput(p => ({ ...p, owner_id: v }))}
              placeholder="ou_xxxxxxxx" />
            <FieldInput label={t('settings.feishu.defaultChatId')} value={feishuInput.default_chat_id}
              onChange={v => setFeishuInput(p => ({ ...p, default_chat_id: v }))}
              placeholder="oc_xxxxxxxx" />
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSaveFeishu}
                disabled={!isFeishuDirty || feishuSaveStatus === "saving"}
                className={cn(
                  "px-3 py-2 text-xs rounded-md font-medium transition-all",
                  !isFeishuDirty || feishuSaveStatus === "saving"
                    ? "bg-app-tertiary/30 text-app-tertiary cursor-not-allowed"
                    : "bg-accent hover:bg-accent-hover text-white"
                )}
              >
                {feishuSaveStatus === "saving" ? t('settings.saveStates.saving') : feishuSaveStatus === "ok" ? t('settings.saveStates.saved') : t('settings.saveStates.save')}
              </button>
              <span className="text-[10px] text-app-tertiary">{t('settings.feishu.restartNote')}</span>
            </div>
          </div>
        </section>

        {/* ── 重启服务 ── */}
        <section className="bg-app-secondary border border-amber-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-app font-semibold">{t('settings.restart.title')}</p>
              <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.restart.hint')}</p>
            </div>
            <button
              onClick={handleRestart}
              disabled={restarting}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
                restarting
                  ? "bg-amber-500/20 text-amber-300 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-500 text-white"
              )}
            >
              {restarting ? t('settings.restart.restarting') : t('settings.restart.title')}
            </button>
          </div>
        </section>

        {/* ── 性能模块 ── */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--background-secondary)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{t('settings.performance.title')}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{t('settings.performance.hint')}</p>
          </div>
          <PerfSettings />
        </div>

        {/* 连接与认证 */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.connection.title')}</h2>
          </div>

          <div className="divide-y divide-app">
            <Row label={t('settings.connection.address')}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[11px] text-accent truncate">{baseUrl}</span>
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border border-app text-app-tertiary">
                  {connType}
                </span>
              </div>
            </Row>

            <Row label={t('settings.connection.tokenStatus')}>
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
                  {tokenStatus === "valid" ? t('settings.connection.valid') : tokenStatus === "invalid" ? t('settings.connection.invalid') : t('settings.connection.verifying')}
                </span>
                <button
                  onClick={checkToken}
                  disabled={checking}
                  className="text-[10px] text-app-tertiary hover:text-app transition-colors disabled:opacity-40"
                >
                  {t('settings.connection.reVerify')}
                </button>
              </div>
            </Row>

            <Row label={t('settings.connection.backendVersion')}>
              {agentVersion ? (
                <span className="text-xs text-app font-mono">v{agentVersion}</span>
              ) : (
                <span className="text-xs text-app-tertiary">{t('settings.connection.fetching')}</span>
              )}
            </Row>

            <Row label={t('settings.connection.tunnelAddress')}>
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
                <span className="text-xs text-app-tertiary">{t('settings.connection.notDetected')}</span>
              )}
            </Row>

            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-app">{t('settings.connection.reconfigure')}</p>
                <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.connection.clearCredentials')}</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                {t('settings.connection.disconnect')}
              </button>
            </div>
          </div>
        </section>

        {/* 关闭服务 */}
        <section className="bg-app-secondary border border-red-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-app font-semibold">{t('settings.shutdown.title')}</p>
              <p className="text-[10px] text-app-tertiary mt-0.5">
                {t('settings.shutdown.hint')}
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
              {shuttingDown ? t('settings.shutdown.shuttingDown') : t('settings.shutdown.title')}
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

function FieldInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full bg-app border border-app rounded-md px-3 py-2 text-xs font-mono text-app outline-none transition-colors focus:border-accent/60"
      />
    </div>
  );
}

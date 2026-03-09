// frontend/src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getConfig, clearConfig } from "../lib/api";
import { cn } from "../lib/utils";
import { PerfSettings } from "../modules/perf/settings/PerfSettings";
import { setLanguage, getLanguage } from "../i18n";
import { applyTheme } from "../hooks/useAppSettings";

interface SettingsProps {
  onDisconnect: () => void;
}

type TokenStatus = "checking" | "valid" | "invalid";
type SaveStatus = "idle" | "saving" | "ok" | "error";

const ALL_STAGES = ["input", "analysis", "prd", "ui", "plan", "dev", "test", "deploy", "monitor"];

export default function Settings({ onDisconnect }: SettingsProps) {
  const { t } = useTranslation();
  const config = getConfig();
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [agentVersion, setAgentVersion] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [sshInfo, setSshInfo] = useState<{ host: string | null; port: number; user: string | null; pin: string | null }>({ host: null, port: 22, user: null, pin: null });
  const [copied, setCopied] = useState(false);
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

  // general settings state
  const [settings, setSettings] = useState({
    notify_tts_enabled: true,
    notify_tts_pipe_path: "/home/sichengli/Documents/code2/speak-pipe",
    notify_webhook_url: "",
    notify_webhook_enabled: false,
    notify_browser_enabled: true,
    pipeline_approval_stages: ["analysis", "prd", "ui", "plan", "test", "deploy"] as string[],
    pipeline_max_retries: 3,
    pipeline_confidence_threshold: 0.5,
    observe_session_limit: 50,
    observe_event_limit: 200,
    observe_auto_cleanup: false,
    observe_cleanup_days: 30,
    ui_theme: "dark",
    ui_sidebar_collapsed: false,
    ui_default_page: "dashboard",
    ui_log_max_lines: 500,
    security_tunnel_enabled: false,
  });
  const [newPin, setNewPin] = useState("");

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

  const pickSettingsFields = (s: Record<string, unknown>) => {
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(settings)) {
      if (key in s && s[key] !== undefined && s[key] !== null) {
        picked[key] = s[key];
      }
    }
    return picked;
  };

  useEffect(() => {
    checkToken();
    api.agentInfo()
      .then((info) => {
        setAgentVersion(info.version);
        setTunnelUrl(info.tunnel_url);
        setSshInfo({ host: info.ssh_host, port: info.ssh_port, user: info.ssh_user, pin: info.pin });
      })
      .catch(() => {});
    api.settings.get()
      .then((s) => {
        setWorkspaceRoot(s.workspace_root); setWorkspaceInput(s.workspace_root);
        const fs = { app_id: s.feishu_app_id || "", app_secret: s.feishu_app_secret || "", owner_id: s.feishu_owner_id || "", default_chat_id: s.feishu_default_chat_id || "" };
        setFeishu(fs); setFeishuInput(fs);
        setSettings(prev => ({ ...prev, ...pickSettingsFields(s as unknown as Record<string, unknown>) }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // generic setting update (auto-save to backend)
  const updateSetting = async (key: string, value: unknown) => {
    const prevSettings = { ...settings };
    setSettings(p => ({ ...p, [key]: value }));
    // 主题变更立即生效
    if (key === "ui_theme") applyTheme(value as string);
    try {
      await api.settings.update({ [key]: value });
      // 保存成功后才写入 localStorage 缓存
      try {
        const cached = JSON.parse(localStorage.getItem("tc_app_settings") || "{}");
        cached[key] = value;
        localStorage.setItem("tc_app_settings", JSON.stringify(cached));
      } catch { /* ignore */ }
    } catch {
      // 保存失败时回滚
      setSettings(prevSettings);
      if (key === "ui_theme") applyTheme(prevSettings.ui_theme);
    }
  };

  const toggleApprovalStage = (stage: string) => {
    const current = settings.pipeline_approval_stages;
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage];
    updateSetting('pipeline_approval_stages', next);
  };

  const handleExportDb = async () => {
    try {
      const res = await api.settings.exportDb();
      alert(`${t('settings.data.exportDb')}: ${res.path}\n${res.size_mb} MB`);
    } catch { /* */ }
  };

  const handleClearSessions = async () => {
    try {
      await api.settings.clearSessions();
    } catch { /* */ }
  };

  const handleClearTasks = async () => {
    try {
      await api.settings.clearCompletedTasks();
    } catch { /* */ }
  };

  const handleChangePin = async () => {
    if (!newPin || newPin.length < 4) return;
    try {
      await api.settings.updatePin(newPin);
      setNewPin("");
      alert(t('settings.security.pinUpdated'));
    } catch {
      alert(t('settings.security.pinUpdateFailed'));
    }
  };

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
      // expected after shutdown
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
      // expected after restart
    }
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
                <span className="text-app-secondary">{workspaceRoot || "..."}</span>
                <span className="text-app-tertiary">/</span>
                <span className="text-accent">{t('settings.workspace.projectName')}</span>
              </div>
              <p className="text-[10px] text-app-tertiary">
                {t('settings.workspace.example')}{workspaceRoot || "..."}/my-app
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

        {/* ── 通知设置 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.notification.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.notification.hint')}</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <ToggleRow label={t('settings.notification.ttsEnabled')} value={settings.notify_tts_enabled} onChange={v => updateSetting('notify_tts_enabled', v)} />
            {settings.notify_tts_enabled && (
              <FieldInput label={t('settings.notification.ttsPipePath')} value={settings.notify_tts_pipe_path} onChange={v => updateSetting('notify_tts_pipe_path', v)} placeholder="/path/to/speak-pipe" />
            )}
            <ToggleRow label={t('settings.notification.webhookEnabled')} value={settings.notify_webhook_enabled} onChange={v => updateSetting('notify_webhook_enabled', v)} />
            {settings.notify_webhook_enabled && (
              <FieldInput label={t('settings.notification.webhookUrl')} value={settings.notify_webhook_url} onChange={v => updateSetting('notify_webhook_url', v)} placeholder="https://hooks.example.com/..." />
            )}
            <ToggleRow label={t('settings.notification.browserEnabled')} value={settings.notify_browser_enabled} onChange={v => updateSetting('notify_browser_enabled', v)} />
          </div>
        </section>

        {/* ── 流水线配置 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.pipeline.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.pipeline.hint')}</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            {/* 审批阶段多选 */}
            <div>
              <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1.5">
                {t('settings.pipeline.approvalStages')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_STAGES.map(stage => (
                  <button key={stage}
                    onClick={() => toggleApprovalStage(stage)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] rounded-md border transition-all",
                      settings.pipeline_approval_stages.includes(stage)
                        ? "bg-accent/15 border-accent/40 text-accent"
                        : "bg-app border-app text-app-tertiary hover:text-app"
                    )}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>
            <NumberInput label={t('settings.pipeline.maxRetries')} value={settings.pipeline_max_retries} onChange={v => updateSetting('pipeline_max_retries', v)} min={1} max={10} />
            <NumberInput label={t('settings.pipeline.confidenceThreshold')} value={settings.pipeline_confidence_threshold} onChange={v => updateSetting('pipeline_confidence_threshold', v)} min={0} max={1} step={0.1} />
          </div>
        </section>

        {/* ── 观测层设置 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.observe.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.observe.hint')}</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <NumberInput label={t('settings.observe.sessionLimit')} value={settings.observe_session_limit} onChange={v => updateSetting('observe_session_limit', v)} min={10} max={500} />
            <NumberInput label={t('settings.observe.eventLimit')} value={settings.observe_event_limit} onChange={v => updateSetting('observe_event_limit', v)} min={50} max={1000} />
            <ToggleRow label={t('settings.observe.autoCleanup')} value={settings.observe_auto_cleanup} onChange={v => updateSetting('observe_auto_cleanup', v)} />
            {settings.observe_auto_cleanup && (
              <NumberInput label={t('settings.observe.cleanupDays')} value={settings.observe_cleanup_days} onChange={v => updateSetting('observe_cleanup_days', v)} min={1} max={365} />
            )}
          </div>
        </section>

        {/* ── 界面偏好 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.ui.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.ui.hint')}</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            {/* 主题 */}
            <div>
              <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1.5">{t('settings.ui.theme')}</label>
              <div className="flex gap-2">
                {(["dark", "light", "system"] as const).map(theme => (
                  <button key={theme}
                    onClick={() => updateSetting('ui_theme', theme)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] rounded-md border transition-all",
                      settings.ui_theme === theme
                        ? "bg-accent text-white border-accent"
                        : "bg-app border-app text-app-secondary hover:text-app"
                    )}
                  >
                    {t(`settings.ui.themes.${theme}`)}
                  </button>
                ))}
              </div>
            </div>
            {/* 默认页面 */}
            <div>
              <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1.5">{t('settings.ui.defaultPage')}</label>
              <div className="flex gap-2">
                {([
                  { id: "dashboard", labelKey: "sidebar.nav.dashboard" },
                  { id: "conversations", labelKey: "sidebar.nav.conversations" },
                  { id: "canvas", labelKey: "sidebar.nav.canvas" },
                ] as const).map(({ id, labelKey }) => (
                  <button key={id}
                    onClick={() => updateSetting('ui_default_page', id)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] rounded-md border transition-all",
                      settings.ui_default_page === id
                        ? "bg-accent text-white border-accent"
                        : "bg-app border-app text-app-secondary hover:text-app"
                    )}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <ToggleRow label={t('settings.ui.sidebarCollapsed')} value={settings.ui_sidebar_collapsed} onChange={v => updateSetting('ui_sidebar_collapsed', v)} />
            <NumberInput label={t('settings.ui.logMaxLines')} value={settings.ui_log_max_lines} onChange={v => updateSetting('ui_log_max_lines', v)} min={100} max={5000} step={100} />
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

        {/* ── 数据管理 ── */}
        <section className="bg-app-secondary border border-amber-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.data.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.data.hint')}</p>
          </div>
          <div className="divide-y divide-app">
            <ActionRow label={t('settings.data.exportDb')} hint={t('settings.data.exportDbHint')} buttonText={t('settings.data.export')} buttonColor="blue" onClick={handleExportDb} />
            <ActionRow label={t('settings.data.clearSessions')} hint={t('settings.data.clearSessionsHint')} buttonText={t('settings.data.clear')} buttonColor="amber" onClick={handleClearSessions} confirm />
            <ActionRow label={t('settings.data.clearTasks')} hint={t('settings.data.clearTasksHint')} buttonText={t('settings.data.clear')} buttonColor="amber" onClick={handleClearTasks} confirm />
          </div>
        </section>

        {/* ── 安全设置 ── */}
        <section className="bg-app-secondary border border-app rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-app">
            <h2 className="text-xs font-semibold text-app">{t('settings.security.title')}</h2>
            <p className="text-[10px] text-app-tertiary mt-0.5">{t('settings.security.hint')}</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div>
              <label className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium block mb-1.5">{t('settings.security.changePin')}</label>
              <div className="flex gap-2">
                <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)}
                  placeholder={t('settings.security.newPinPlaceholder')}
                  className="flex-1 bg-app border border-app rounded-md px-3 py-2 text-xs font-mono text-app outline-none transition-colors focus:border-accent/60" />
                <button onClick={handleChangePin} disabled={!newPin || newPin.length < 4}
                  className={cn("px-3 py-2 text-xs rounded-md font-medium transition-all",
                    !newPin || newPin.length < 4 ? "bg-app-tertiary/30 text-app-tertiary cursor-not-allowed"
                      : "bg-accent hover:bg-accent-hover text-white"
                  )}>
                  {t('settings.security.updatePin')}
                </button>
              </div>
            </div>
            <ToggleRow label={t('settings.security.tunnelEnabled')} value={settings.security_tunnel_enabled} onChange={v => updateSetting('security_tunnel_enabled', v)} />
          </div>
        </section>

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

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-app">{label}</span>
      <button onClick={() => onChange(!value)}
        className={cn("w-9 h-5 rounded-full transition-colors relative",
          value ? "bg-accent" : "bg-app-tertiary/40"
        )}>
        <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
          value ? "left-[18px]" : "left-0.5"
        )} />
      </button>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-app">{label}</span>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className="w-20 bg-app border border-app rounded-md px-2 py-1.5 text-xs font-mono text-app text-right outline-none transition-colors focus:border-accent/60" />
    </div>
  );
}

function ActionRow({ label, hint, buttonText, buttonColor, onClick, confirm: needConfirm }: {
  label: string; hint: string; buttonText: string; buttonColor: "blue" | "amber" | "red";
  onClick: () => void; confirm?: boolean;
}) {
  const colorMap = {
    blue: "bg-blue-600 hover:bg-blue-500 text-white",
    amber: "bg-amber-600 hover:bg-amber-500 text-white",
    red: "bg-red-600 hover:bg-red-500 text-white",
  };
  const handleClick = () => {
    if (needConfirm && !window.confirm(`${label}?`)) return;
    onClick();
  };
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-xs text-app">{label}</p>
        <p className="text-[10px] text-app-tertiary mt-0.5">{hint}</p>
      </div>
      <button onClick={handleClick} className={cn("text-xs px-3 py-1.5 rounded-md font-medium transition-colors", colorMap[buttonColor])}>
        {buttonText}
      </button>
    </div>
  );
}

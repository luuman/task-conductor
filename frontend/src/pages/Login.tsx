// frontend/src/pages/Login.tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { authWithPin, saveConfig } from "../lib/api";
import { cn } from "../lib/utils";

type Mode = "local" | "tunnel" | "ssh";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const [mode, setMode] = useState<Mode>(isLocal ? "local" : "tunnel");

  const [tunnelUrl, setTunnelUrl] = useState("");
  const [pin, setPin]             = useState("");
  const [sshHost, setSshHost]     = useState("");
  const [sshPort, setSshPort]     = useState("22");
  const [sshUser, setSshUser]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // 解析连接链接参数
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectParam = params.get("connect");
    if (!connectParam) return;
    try {
      const config = JSON.parse(atob(connectParam));
      if (config.type === "tunnel" && config.tunnelUrl) {
        setMode("tunnel");
        setTunnelUrl(config.tunnelUrl);
      } else if (config.type === "ssh") {
        setMode("ssh");
        if (config.sshHost) setSshHost(config.sshHost);
        if (config.sshPort) setSshPort(String(config.sshPort));
        if (config.sshUser) setSshUser(config.sshUser);
      }
    } catch { /* 参数损坏则忽略 */ }
  }, []);

  const handleTunnelConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const token = await authWithPin(tunnelUrl, pin);
      saveConfig({ type: "tunnel", tunnelUrl, token });
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.errors.connectionFailed'));
      setLoading(false);
    }
  };

  const handleSshConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const token = await authWithPin("http://localhost:8765", pin);
      saveConfig({ type: "ssh", tunnelUrl: "http://localhost:8765", sshHost, sshPort: parseInt(sshPort), sshUser, token });
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.errors.sshConnectionFailed'));
      setLoading(false);
    }
  };

  const tabs = ([
    { id: "local",  label: t('login.connectionModes.local'),   localOnly: true  },
    { id: "tunnel", label: t('login.connectionModes.tunnel'), localOnly: false },
    { id: "ssh",    label: t('login.connectionModes.ssh'),    localOnly: false },
  ] as { id: Mode; label: string; localOnly: boolean }[]).filter(m => !m.localOnly || isLocal);

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── Dot-grid background (Orion style) ─────────────── */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             backgroundImage: `radial-gradient(circle, rgba(68,119,255,0.18) 1px, transparent 1px)`,
             backgroundSize: "28px 28px",
           }} />
      {/* Radial vignette to soften edges */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             background: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, var(--background) 100%)",
           }} />

      {/* ── Card ─────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm space-y-6 rounded-2xl p-8"
           style={{
             background: "var(--background-secondary)",
             border: "1px solid var(--border)",
             boxShadow: "0 0 0 1px rgba(68,119,255,0.06), 0 24px 64px rgba(0,0,0,0.6)",
           }}>

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 pb-2">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold"
               style={{ background: "var(--accent)", boxShadow: "0 0 20px rgba(68,119,255,0.4)" }}>
            TC
          </div>
          <div className="text-center">
            <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              TaskConductor
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {t('login.subtitle')}
            </p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg p-0.5 gap-0.5"
             style={{ background: "var(--background-tertiary)", border: "1px solid var(--border-subtle)" }}>
          {tabs.map((m) => (
            <button key={m.id} onClick={() => { setMode(m.id); setError(""); }}
              className={cn(
                "flex-1 py-1.5 text-[12px] rounded-md transition-all font-medium",
                mode === m.id ? "text-white" : "hover:text-app-secondary"
              )}
              style={{
                background: mode === m.id ? "var(--accent)" : "transparent",
                color: mode === m.id ? "#fff" : "var(--text-tertiary)",
                boxShadow: mode === m.id ? "0 1px 8px rgba(68,119,255,0.35)" : undefined,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ── 本地模式 ──────────────────────────────────── */}
        {mode === "local" && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError("");
            try {
              const token = await authWithPin("", pin);
              saveConfig({ type: "tunnel", tunnelUrl: "", token });
              onLogin();
            } catch {
              setError(t('login.local.pinError'));
              setLoading(false);
            }
          }} className="space-y-4">
            <div className="rounded-lg px-3 py-2 text-[11px]"
                 style={{ background: "var(--background-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
              {t('login.local.backendUrl')}：<span className="font-mono" style={{ color: "var(--accent)" }}>localhost:7070 → :8765</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.local.pinCode')}</label>
              <Input value={pin} onChange={(e) => setPin(e.target.value)}
                placeholder={t('login.local.pinPlaceholder')} maxLength={6} inputMode="numeric" autoFocus />
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {t('login.local.pinHint')}
              </p>
            </div>
            {error && <p className="text-[11px]" style={{ color: "var(--danger)" }}>{error}</p>}
            <Button type="submit" disabled={pin.length !== 6 || loading} className="w-full" size="lg">
              {loading ? t('login.local.connecting') : t('login.local.connectButton')}
            </Button>
          </form>
        )}

        {/* ── Tunnel ────────────────────────────────────── */}
        {mode === "tunnel" && (
          <form onSubmit={handleTunnelConnect} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>Agent URL</label>
              <Input value={tunnelUrl} onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="https://abc123.trycloudflare.com" autoFocus />
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {t('login.tunnel.runOnServer')} <code className="px-1 rounded" style={{ background: "var(--background-tertiary)" }}>./start.sh</code>
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.local.pinCode')}</label>
              <Input value={pin} onChange={(e) => setPin(e.target.value)}
                placeholder={t('login.local.pinPlaceholder')} maxLength={6} inputMode="numeric" />
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{t('login.tunnel.pinHint')}</p>
            </div>
            {error && <p className="text-[11px]" style={{ color: "var(--danger)" }}>{error}</p>}
            <Button type="submit" disabled={!tunnelUrl || pin.length !== 6 || loading} className="w-full" size="lg">
              {loading ? t('login.local.connecting') : t('login.tunnel.connectAgent')}
            </Button>
          </form>
        )}

        {/* ── SSH ───────────────────────────────────────── */}
        {mode === "ssh" && (
          <form onSubmit={handleSshConnect} className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.ssh.host')}</label>
                <Input value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.ssh.port')}</label>
                <Input value={sshPort} onChange={(e) => setSshPort(e.target.value)} placeholder="22" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.ssh.username')}</label>
              <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="user" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.local.pinCode')}</label>
              <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder={t('login.local.pinPlaceholder')} maxLength={6} />
            </div>
            <div className="rounded-lg p-3 text-[10px] space-y-1.5"
                 style={{ background: "var(--background-tertiary)", border: "1px solid var(--border-subtle)" }}>
              <p className="font-medium" style={{ color: "var(--text-secondary)" }}>{t('login.ssh.setupHint')}</p>
              <code className="block font-mono" style={{ color: "var(--accent)" }}>
                ssh -L 8765:localhost:8765 {sshUser || "user"}@{sshHost || "server"} -p {sshPort}
              </code>
            </div>
            {error && <p className="text-[11px]" style={{ color: "var(--danger)" }}>{error}</p>}
            <Button type="submit" disabled={!sshHost || !sshUser || pin.length !== 6 || loading} className="w-full" size="lg">
              {loading ? t('login.local.connecting') : t('login.ssh.connectButton')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

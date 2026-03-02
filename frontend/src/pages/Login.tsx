// frontend/src/pages/Login.tsx
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { authWithPin, saveConfig, checkAuth } from "../lib/api";
import { cn } from "../lib/utils";

type Mode = "tunnel" | "ssh";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<Mode>("tunnel");

  // Tunnel mode
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [pin, setPin] = useState("");

  // SSH mode
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTunnelConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const token = await authWithPin(tunnelUrl, pin);
      saveConfig({ type: "tunnel", tunnelUrl, token });
      if (await checkAuth()) {
        onLogin();
      } else {
        throw new Error("连接后验证失败");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "连接失败");
      setLoading(false);
    }
  };

  const handleSshConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // SSH 模式：用 localhost:8000 访问（SSH tunnel 已由用户在本地建立）
      const localUrl = "http://localhost:8000";
      const token = await authWithPin(localUrl, pin);
      saveConfig({
        type: "ssh",
        tunnelUrl: localUrl,
        sshHost, sshPort: parseInt(sshPort), sshUser, token,
      });
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "SSH 连接失败，请先在终端建立 SSH 隧道");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white text-sm font-bold">TC</div>
            <span className="text-base font-semibold text-app">TaskConductor</span>
          </div>
          <p className="text-app-tertiary text-xs">连接你的本地 AI 开发 Agent</p>
        </div>

        {/* Mode Tabs */}
        <div className="flex bg-app-tertiary rounded-lg p-0.5 gap-0.5">
          {(["tunnel", "ssh"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={cn(
                "flex-1 py-1.5 text-xs rounded-md transition-colors font-medium",
                mode === m
                  ? "bg-app-secondary text-app shadow-sm"
                  : "text-app-tertiary hover:text-app-secondary"
              )}
            >
              {m === "tunnel" ? "Tunnel" : "SSH"}
            </button>
          ))}
        </div>

        {/* Tunnel Form */}
        {mode === "tunnel" && (
          <form onSubmit={handleTunnelConnect} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-app-secondary text-xs">Agent URL</label>
              <Input
                value={tunnelUrl}
                onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="https://abc123.trycloudflare.com"
                autoFocus
              />
              <p className="text-app-tertiary text-[10px]">
                在服务器运行 <code className="bg-app-tertiary px-1 rounded">./start.sh</code> 获取此 URL
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-app-secondary text-xs">PIN 码</label>
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="6位数字"
                maxLength={6}
                inputMode="numeric"
              />
              <p className="text-app-tertiary text-[10px]">
                Agent 启动时终端显示的 6 位 PIN
              </p>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <Button
              type="submit"
              disabled={!tunnelUrl || pin.length !== 6 || loading}
              className="w-full"
              size="lg"
            >
              {loading ? "连接中..." : "连接 Agent"}
            </Button>
          </form>
        )}

        {/* SSH Form */}
        {mode === "ssh" && (
          <form onSubmit={handleSshConnect} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <label className="text-app-secondary text-xs">主机</label>
                <Input value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-app-secondary text-xs">端口</label>
                <Input value={sshPort} onChange={(e) => setSshPort(e.target.value)} placeholder="22" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-app-secondary text-xs">用户名</label>
              <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="user" />
            </div>
            <div className="space-y-1.5">
              <label className="text-app-secondary text-xs">PIN 码</label>
              <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Agent 显示的 6 位 PIN" maxLength={6} />
            </div>
            <div className="bg-app-tertiary rounded-md p-2.5 text-app-secondary text-[10px] space-y-1">
              <p className="font-medium text-app-secondary">使用前请在本地终端建立 SSH 隧道：</p>
              <code className="block text-accent">ssh -L 8000:localhost:8000 {sshUser || "user"}@{sshHost || "server"} -p {sshPort}</code>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <Button type="submit" disabled={!sshHost || !sshUser || pin.length !== 6 || loading} className="w-full" size="lg">
              {loading ? "连接中..." : "通过 SSH 连接"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

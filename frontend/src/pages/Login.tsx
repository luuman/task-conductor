import { useState } from "react";
import { api } from "../lib/api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      localStorage.setItem("tc_token", token);
      await api.health();
      onLogin();
    } catch {
      localStorage.removeItem("tc_token");
      setError("无法连接服务器，请检查 Token 或服务器地址");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 p-8 rounded-2xl w-96 space-y-5 shadow-2xl"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">TaskConductor</h1>
          <p className="text-gray-400 text-sm mt-1">AI 驱动的开发流水线平台</p>
        </div>
        <div className="space-y-2">
          <label className="text-gray-300 text-sm">API Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="输入服务器 API Token"
            className="w-full bg-gray-800 text-white rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={!token || loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition"
        >
          {loading ? "连接中..." : "连接服务器"}
        </button>
        <p className="text-gray-600 text-xs text-center">
          默认连接 http://localhost:8000
        </p>
      </form>
    </div>
  );
}

// frontend/src/lib/api.ts

export interface ConnectionConfig {
  type: "tunnel" | "ssh";
  // tunnel mode
  tunnelUrl?: string;
  pin?: string;
  // ssh mode
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKey?: string;
  // stored after auth
  token?: string;
}

const CONFIG_KEY = "tc_connection";

export function getConfig(): ConnectionConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveConfig(config: ConnectionConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function getBaseUrl(): string {
  const config = getConfig();
  if (config?.type === "tunnel" && config.tunnelUrl) {
    return config.tunnelUrl.replace(/\/$/, "");
  }
  if (config?.type === "ssh" && config.tunnelUrl) {
    return config.tunnelUrl.replace(/\/$/, "");
  }
  return import.meta.env.VITE_API_URL || "http://localhost:8000";
}

function getToken(): string {
  return getConfig()?.token || "";
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const base = getBaseUrl();
  const resp = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${await resp.text()}`);
  return resp.json();
}

// PIN auth
export async function authWithPin(tunnelUrl: string, pin: string): Promise<string> {
  const base = tunnelUrl.replace(/\/$/, "");
  const resp = await fetch(`${base}/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!resp.ok) throw new Error("Invalid PIN");
  const data = await resp.json();
  return data.token;
}

export async function checkAuth(): Promise<boolean> {
  try {
    await request("/auth/check");
    return true;
  } catch {
    return false;
  }
}

export interface Project { id: number; name: string; repo_url: string; created_at: string; }
export interface Task { id: number; project_id: number; title: string; description: string; stage: string; status: string; created_at: string; updated_at: string; }
export interface StageArtifact { id: number; task_id: number; stage: string; artifact_type: string; content: string; created_at: string; }
export interface AnalysisOption { label: string; title: string; effort: string; risk: string; description: string; }

export const api = {
  health: () => request<{ status: string }>("/health"),
  agentInfo: () => request<{ tunnel_url: string | null; version: string }>("/agent/info"),
  projects: {
    list: () => request<Project[]>("/api/projects"),
    create: (body: { name: string; repo_url: string }) =>
      request<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
    tasks: (projectId: number) => request<Task[]>(`/api/projects/${projectId}/tasks`),
  },
  tasks: {
    get: (id: number) => request<Task>(`/api/tasks/${id}`),
    create: (projectId: number, body: { title: string; description: string }) =>
      request<Task>(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(body) }),
    approve: (id: number, action: "approve" | "reject", reason = "") =>
      request<Task>(`/api/tasks/${id}/approve`, { method: "POST", body: JSON.stringify({ action, reason }) }),
    advance: (id: number) =>
      request<Task>(`/api/tasks/${id}/advance`, { method: "POST" }),
    artifacts: (id: number) => request<StageArtifact[]>(`/api/tasks/${id}/artifacts`),
  },
  pipeline: {
    runAnalysis: (taskId: number) =>
      request<{ status: string }>(`/api/pipeline/${taskId}/run-analysis`, { method: "POST" }),
  },
};

export function getWsUrl(path: string): string {
  return getBaseUrl().replace(/^http/, "ws") + path;
}

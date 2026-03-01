const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("tc_token") || "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const resp = await fetch(`${BASE}${path}`, {
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

export interface Project {
  id: number;
  name: string;
  repo_url: string;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string;
  stage: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface StageArtifact {
  id: number;
  task_id: number;
  stage: string;
  artifact_type: string;
  content: string;
  created_at: string;
}

export interface AnalysisOption {
  label: string;
  title: string;
  effort: string;
  risk: string;
  description: string;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  projects: {
    list: () => request<Project[]>("/api/projects"),
    create: (body: { name: string; repo_url: string }) =>
      request<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    tasks: (projectId: number) =>
      request<Task[]>(`/api/projects/${projectId}/tasks`),
  },
  tasks: {
    get: (id: number) => request<Task>(`/api/tasks/${id}`),
    create: (projectId: number, body: { title: string; description: string }) =>
      request<Task>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    approve: (id: number, action: "approve" | "reject", reason = "") =>
      request<Task>(`/api/tasks/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      }),
    advance: (id: number) =>
      request<Task>(`/api/tasks/${id}/advance`, { method: "POST" }),
    artifacts: (id: number) =>
      request<StageArtifact[]>(`/api/tasks/${id}/artifacts`),
  },
  pipeline: {
    runAnalysis: (taskId: number) =>
      request<{ status: string; task_id: number }>(
        `/api/pipeline/${taskId}/run-analysis`,
        { method: "POST" }
      ),
  },
};

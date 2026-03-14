import type { ApiAdapter, ApiMode, Project, Task, AiSession } from './types'

function getStoredTunnelUrl(): string {
  return localStorage.getItem('tc_tunnel_url') ?? 'http://localhost:8765'
}

export class HttpAdapter implements ApiAdapter {
  private baseUrl: string

  constructor(mode: ApiMode) {
    this.baseUrl = mode === 'local-http'
      ? ''
      : getStoredTunnelUrl()
  }

  private headers(): HeadersInit {
    const token = localStorage.getItem('tc_token')
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  getProjects() { return this.fetch<Project[]>('/api/projects') }
  createProject(data: { name: string; description?: string }) {
    return this.fetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) })
  }
  getTasks(projectId: number) { return this.fetch<Task[]>(`/api/projects/${projectId}/tasks`) }
  getTask(taskId: number) { return this.fetch<Task>(`/api/tasks/${taskId}`) }
  createTask(projectId: number, data: { title: string; description?: string }) {
    return this.fetch<Task>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) })
  }
  approveTask(taskId: number, data: { action: 'approve' | 'reject'; reason?: string }) {
    return this.fetch<void>(`/api/tasks/${taskId}/approve`, { method: 'POST', body: JSON.stringify(data) })
  }
  advanceTask(taskId: number) {
    return this.fetch<void>(`/api/tasks/${taskId}/advance`, { method: 'POST' })
  }
  getSessions() { return this.fetch<AiSession[]>('/api/sessions') }
  async healthCheck() {
    try { await fetch(`${this.baseUrl}/health`); return true } catch { return false }
  }
}

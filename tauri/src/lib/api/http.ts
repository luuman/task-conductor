import type { ApiAdapter, ApiMode, Project, Task, AiSession, Settings } from './types'

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
  getSettings() { return this.fetch<Settings>('/api/settings') }
  updateSettings(data: Partial<Settings>) {
    return this.fetch<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) })
  }
  updatePin(newPin: string) {
    return this.fetch<{ ok: boolean }>('/api/settings/security/pin', { method: 'PUT', body: JSON.stringify({ new_pin: newPin }) })
  }
  exportDb() {
    return this.fetch<{ path: string; size_mb: number }>('/api/settings/data/export-db', { method: 'POST' })
  }
  clearSessions() {
    return this.fetch<{ ok: boolean; message: string }>('/api/settings/data/clear-sessions', { method: 'POST' })
  }
  clearCompletedTasks() {
    return this.fetch<{ ok: boolean; count: number }>('/api/settings/data/clear-completed-tasks', { method: 'POST' })
  }
  async restartService() {
    await this.fetch<void>('/api/settings/restart', { method: 'POST' })
  }
}

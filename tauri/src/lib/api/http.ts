import type { ApiAdapter, ApiMode, Project, Task, AiSession, Settings, FileItem, ProjectKnowledge } from './types'
import { cache, CACHE_TTL } from '../cache'

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

  // ─── 带缓存的读取 API ───

  getProjects() {
    return cache.getOrFetch('projects', CACHE_TTL.projects, () =>
      this.fetch<Project[]>('/api/projects')
    )
  }

  getProjectFiles(projectId: number) {
    return cache.getOrFetch(`project:${projectId}:files`, CACHE_TTL.projectFiles, () =>
      this.fetch<{ path: string; items: FileItem[] }>(`/api/projects/${projectId}/files`)
    )
  }

  getProjectKnowledge(projectId: number) {
    return cache.getOrFetch(`project:${projectId}:knowledge`, CACHE_TTL.projectKnowledge, () =>
      this.fetch<ProjectKnowledge[]>(`/api/projects/${projectId}/knowledge`)
    )
  }

  getTasks(projectId: number) {
    return cache.getOrFetch(`project:${projectId}:tasks`, CACHE_TTL.tasks, () =>
      this.fetch<Task[]>(`/api/projects/${projectId}/tasks`)
    )
  }

  getTask(taskId: number) {
    return cache.getOrFetch(`task:${taskId}`, CACHE_TTL.task, () =>
      this.fetch<Task>(`/api/tasks/${taskId}`)
    )
  }

  getSessions() {
    return cache.getOrFetch('sessions', CACHE_TTL.sessions, () =>
      this.fetch<AiSession[]>('/api/sessions')
    )
  }

  getSettings() {
    return cache.getOrFetch('settings', CACHE_TTL.settings, () =>
      this.fetch<Settings>('/api/settings')
    )
  }

  async healthCheck() {
    try { await fetch(`${this.baseUrl}/health`); return true } catch { return false }
  }

  // ─── 写入 API（写入后清除相关缓存） ───

  async createProject(data: { name: string; description?: string }) {
    const result = await this.fetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) })
    cache.invalidate('projects')
    return result
  }

  async createTask(projectId: number, data: { title: string; description?: string }) {
    const result = await this.fetch<Task>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) })
    cache.invalidate(`project:${projectId}:tasks`)
    return result
  }

  async approveTask(taskId: number, data: { action: 'approve' | 'reject'; reason?: string }) {
    await this.fetch<void>(`/api/tasks/${taskId}/approve`, { method: 'POST', body: JSON.stringify(data) })
    cache.invalidate(`task:${taskId}`)
  }

  async advanceTask(taskId: number) {
    await this.fetch<void>(`/api/tasks/${taskId}/advance`, { method: 'POST' })
    cache.invalidate(`task:${taskId}`)
  }

  async updateSettings(data: Partial<Settings>) {
    const result = await this.fetch<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) })
    cache.invalidate('settings')
    return result
  }

  async updatePin(newPin: string) {
    return this.fetch<{ ok: boolean }>('/api/settings/security/pin', { method: 'PUT', body: JSON.stringify({ new_pin: newPin }) })
  }

  exportDb() {
    return this.fetch<{ path: string; size_mb: number }>('/api/settings/data/export-db', { method: 'POST' })
  }

  async clearSessions() {
    const result = await this.fetch<{ ok: boolean; message: string }>('/api/settings/data/clear-sessions', { method: 'POST' })
    cache.invalidate('sessions')
    return result
  }

  async clearCompletedTasks() {
    const result = await this.fetch<{ ok: boolean; count: number }>('/api/settings/data/clear-completed-tasks', { method: 'POST' })
    cache.clear() // 批量清除可能影响多个项目的任务缓存
    return result
  }

  async restartService() {
    await this.fetch<void>('/api/settings/restart', { method: 'POST' })
    cache.clear()
  }
}

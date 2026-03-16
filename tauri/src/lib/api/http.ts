import type {
  ApiAdapter, ApiMode, Project, Task, AiSession, SessionEvent, Settings, FileItem, ProjectKnowledge,
  Metrics, ClaudeUsage, ClaudeOverview, ClaudeConfig, HookRule, McpServer,
  SkillDetail, CommandInfo, RuleInfo, AgentInfo, PresetItem, ClaudeSystemInfo,
  DisabledItem, ProjectComponents, ProjectDetails,
  GitStatus, GitCommit, GitBranch, GitStash, BranchFileChange,
  InlineEditRequest, InlineEditResponse,
  TranscriptMessage, ConversationNote,
} from './types'
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

  getSessionEvents(sessionId: string) {
    return this.fetch<SessionEvent[]>(`/api/sessions/${encodeURIComponent(sessionId)}/events`)
  }

  getTranscript(sessionId: string) {
    return this.fetch<{ messages: TranscriptMessage[]; file_found: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`)
  }

  getSessionNote(sessionId: string) {
    return this.fetch<ConversationNote>(`/api/sessions/${encodeURIComponent(sessionId)}/note`)
  }

  updateSessionNote(sessionId: string, data: Partial<ConversationNote>) {
    return this.fetch<ConversationNote>(`/api/sessions/${encodeURIComponent(sessionId)}/note`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
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

  getMetrics() {
    return this.fetch<Metrics>('/api/metrics')
  }

  getClaudeUsage() {
    return this.fetch<ClaudeUsage>('/api/metrics/claude-usage')
  }

  getClaudeOverview() {
    return this.fetch<ClaudeOverview>('/api/claude-config/overview')
  }

  getClaudeConfig() {
    return this.fetch<ClaudeConfig>('/api/claude-config')
  }

  updateClaudeConfigKey(key: string, value: unknown) {
    return this.fetch<{ ok: boolean }>(`/api/claude-config/other/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  }

  // ─── Claude Config 完整 API ───

  claudeConfig = {
    getConfig: () =>
      this.fetch<ClaudeConfig>('/api/claude-config'),

    getOverview: () =>
      this.fetch<ClaudeOverview>('/api/claude-config/overview'),

    getHookEvents: () =>
      this.fetch<string[]>('/api/claude-config/hook-events'),

    updateHooks: (event: string, rules: HookRule[]) =>
      this.fetch<ClaudeConfig>('/api/claude-config/hooks', {
        method: 'PUT',
        body: JSON.stringify({ event, rules }),
      }),

    deleteHooks: (event: string) =>
      this.fetch<ClaudeConfig>(`/api/claude-config/hooks/${encodeURIComponent(event)}`, { method: 'DELETE' }),

    updatePlugin: (plugin_id: string, enabled: boolean) =>
      this.fetch<ClaudeConfig>('/api/claude-config/plugins', {
        method: 'PUT',
        body: JSON.stringify({ plugin_id, enabled }),
      }),

    deletePlugin: (id: string) =>
      this.fetch<ClaudeConfig>(`/api/claude-config/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    updateOtherKey: (key: string, value: unknown) =>
      this.fetch<ClaudeConfig>(`/api/claude-config/other/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),

    deleteOtherKey: (key: string) =>
      this.fetch<ClaudeConfig>(`/api/claude-config/other/${encodeURIComponent(key)}`, { method: 'DELETE' }),

    updatePermissions: (permissions: Record<string, unknown>) =>
      this.fetch<ClaudeConfig>('/api/claude-config/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),

    getMcpServers: () =>
      this.fetch<McpServer[]>('/api/claude-config/mcp'),

    addMcpServer: (data: { name: string; url?: string; command?: string; args?: string[]; transport: string; scope: string }) =>
      this.fetch<{ ok: boolean; output?: string; servers: McpServer[] }>('/api/claude-config/mcp', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    deleteMcpServer: (name: string, scope?: string) => {
      const params = scope ? `?scope=${encodeURIComponent(scope)}` : ''
      return this.fetch<{ ok: boolean; servers: McpServer[] }>(
        `/api/claude-config/mcp/${encodeURIComponent(name)}${params}`,
        { method: 'DELETE' },
      )
    },

    getSkills: () =>
      this.fetch<SkillDetail[]>('/api/claude-config/skills'),

    toggleSkill: (name: string, enabled: boolean) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/skills/toggle', {
        method: 'POST',
        body: JSON.stringify({ name, enabled }),
      }),

    getCommands: () =>
      this.fetch<CommandInfo[]>('/api/claude-config/commands'),

    toggleCommand: (name: string, enabled: boolean) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/commands/toggle', {
        method: 'POST',
        body: JSON.stringify({ name, enabled }),
      }),

    createCommand: (name: string, content?: string) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/commands', {
        method: 'POST',
        body: JSON.stringify({ name, content }),
      }),

    deleteCommand: (name: string) =>
      this.fetch<{ ok: boolean }>(`/api/claude-config/commands/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    getRules: () =>
      this.fetch<RuleInfo[]>('/api/claude-config/rules'),

    toggleRule: (name: string, enabled: boolean) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/rules/toggle', {
        method: 'POST',
        body: JSON.stringify({ name, enabled }),
      }),

    createRule: (name: string, content?: string) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/rules', {
        method: 'POST',
        body: JSON.stringify({ name, content }),
      }),

    deleteRule: (name: string) =>
      this.fetch<{ ok: boolean }>(`/api/claude-config/rules/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    getAgents: () =>
      this.fetch<AgentInfo[]>('/api/claude-config/agents'),

    toggleAgent: (name: string, enabled: boolean) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/agents/toggle', {
        method: 'POST',
        body: JSON.stringify({ name, enabled }),
      }),

    createAgent: (name: string, content?: string) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/agents', {
        method: 'POST',
        body: JSON.stringify({ name, content }),
      }),

    deleteAgent: (name: string) =>
      this.fetch<{ ok: boolean }>(`/api/claude-config/agents/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    getAgentPresets: () =>
      this.fetch<PresetItem[]>('/api/claude-config/presets/agents'),

    getCommandPresets: () =>
      this.fetch<PresetItem[]>('/api/claude-config/presets/commands'),

    getRulePresets: () =>
      this.fetch<PresetItem[]>('/api/claude-config/presets/rules'),

    getSystemInfo: () =>
      this.fetch<ClaudeSystemInfo>('/api/claude-config/system-info'),

    getClaudeMd: () =>
      this.fetch<{ content: string; path: string }>('/api/claude-config/claude-md'),

    updateClaudeMd: (content: string) =>
      this.fetch<{ content: string; path: string }>('/api/claude-config/claude-md', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),

    getDisabledItems: () =>
      this.fetch<DisabledItem[]>('/api/claude-config/disabled-items'),

    restoreDisabledItem: (type: string, name: string) =>
      this.fetch<{ ok: boolean }>('/api/claude-config/disabled-items/restore', {
        method: 'POST',
        body: JSON.stringify({ type, name }),
      }),

    deleteDisabledItem: (type: string, name: string) =>
      this.fetch<{ ok: boolean }>(
        `/api/claude-config/disabled-items/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      ),

    getProjectComponents: (dirName: string) =>
      this.fetch<ProjectComponents>(`/api/claude-config/projects/${encodeURIComponent(dirName)}/components`),

    getProjectDetails: (dirName: string) =>
      this.fetch<ProjectDetails>(`/api/claude-config/projects/${encodeURIComponent(dirName)}/details`),
  }
}

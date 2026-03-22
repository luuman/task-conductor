import type {
  ApiAdapter, ApiMode, Project, Task, StageArtifact, AiSession, SessionEvent, Settings, FileItem, ProjectKnowledge,
  Metrics, ClaudeUsage, SystemMetrics, ProcessList, ClaudeOverview, ClaudeConfig, HookRule, McpServer,
  SkillDetail, CommandInfo, RuleInfo, AgentInfo, PresetItem, ClaudeSystemInfo,
  DisabledItem, ProjectComponents, ProjectDetails,
  GitStatus, GitCommit, GitBranch, GitStash, BranchFileChange,
  InlineEditRequest, InlineEditResponse,
  TranscriptMessage, ConversationNote, FileTreeNode,
  InterviewMessage, InterviewStartResponse,
  CanvasData, PaginatedMessages,
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

  getTaskArtifacts(taskId: number) {
    return this.fetch<StageArtifact[]>(`/api/tasks/${taskId}/artifacts`)
  }

  getSessions() {
    return cache.getOrFetch('sessions', CACHE_TTL.sessions, () =>
      this.fetch<AiSession[]>('/api/sessions')
    )
  }

  getSessionEvents(sessionId: string) {
    return this.fetch<SessionEvent[]>(`/api/sessions/${encodeURIComponent(sessionId)}/events`)
  }

  getTranscript(sessionId: string, params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams()
    if (params?.limit != null) searchParams.set('limit', String(params.limit))
    if (params?.offset != null) searchParams.set('offset', String(params.offset))
    const qs = searchParams.toString()
    const url = `/api/sessions/${encodeURIComponent(sessionId)}/transcript${qs ? `?${qs}` : ''}`
    return this.fetch<{ messages: TranscriptMessage[]; file_found: boolean; total: number; has_more: boolean }>(url)
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

  // ─── 文件操作 API（无缓存） ───

  getFileContent(projectId: number, path: string) {
    return this.fetch<{ path: string; name: string; size: number; binary: boolean; content: string }>(
      `/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`,
    )
  }

  saveFile(projectId: number, path: string, content: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    })
  }

  createFile(projectId: number, path: string, content?: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file`, {
      method: 'POST',
      body: JSON.stringify({ path, content: content ?? '' }),
    })
  }

  createDirectory(projectId: number, path: string) {
    return this.fetch<void>(`/api/projects/${projectId}/directory`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  renameFile(projectId: number, oldPath: string, newPath: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file/rename`, {
      method: 'POST',
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    })
  }

  deleteFile(projectId: number, path: string) {
    return this.fetch<void>(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    })
  }

  listDir(projectId: number, path: string) {
    return this.fetch<{ path: string; items: FileItem[] }>(
      `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
    )
  }

  searchFiles(projectId: number, query: string) {
    return this.fetch<FileItem[]>(
      `/api/projects/${projectId}/files/search?q=${encodeURIComponent(query)}`,
    )
  }

  // ─── Git 操作 API（无缓存） ───

  gitStatus(projectId: number) {
    return this.fetch<GitStatus>(`/api/projects/${projectId}/git/status`)
  }

  async gitDiff(projectId: number, opts?: { file?: string; staged?: boolean; commit?: string }) {
    const params = new URLSearchParams()
    if (opts?.file) params.set('file', opts.file)
    if (opts?.staged) params.set('staged', 'true')
    if (opts?.commit) params.set('commit', opts.commit)
    const qs = params.toString()
    const res = await this.fetch<{ diff: string }>(`/api/projects/${projectId}/git/diff${qs ? `?${qs}` : ''}`)
    return res.diff
  }

  gitStage(projectId: number, files?: string[]) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stage`, {
      method: 'POST',
      body: JSON.stringify(files ? { files } : { all: true }),
    })
  }

  gitUnstage(projectId: number, files?: string[]) {
    return this.fetch<void>(`/api/projects/${projectId}/git/unstage`, {
      method: 'POST',
      body: JSON.stringify(files ? { files } : { all: true }),
    })
  }

  gitDiscard(projectId: number, files: string[]) {
    return this.fetch<void>(`/api/projects/${projectId}/git/discard`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    })
  }

  gitCommit(projectId: number, message: string) {
    return this.fetch<void>(`/api/projects/${projectId}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  async gitLog(projectId: number, limit?: number, branch?: string) {
    const params = new URLSearchParams()
    if (limit != null) params.set('limit', String(limit))
    if (branch) params.set('branch', branch)
    const qs = params.toString()
    const res = await this.fetch<{ commits: GitCommit[] }>(`/api/projects/${projectId}/git/log${qs ? `?${qs}` : ''}`)
    return res.commits
  }

  async gitBranches(projectId: number) {
    const res = await this.fetch<{ branches: GitBranch[] }>(`/api/projects/${projectId}/git/branches`)
    return res.branches
  }

  gitCheckout(projectId: number, branch: string, create?: boolean) {
    return this.fetch<void>(`/api/projects/${projectId}/git/checkout`, {
      method: 'POST',
      body: JSON.stringify(create ? { create: branch } : { branch }),
    })
  }

  gitPush(projectId: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/push`, { method: 'POST' })
  }

  gitPull(projectId: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/pull`, { method: 'POST' })
  }

  gitFetch(projectId: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/fetch`, { method: 'POST' })
  }

  async gitStashList(projectId: number) {
    const res = await this.fetch<{ stashes: GitStash[] }>(`/api/projects/${projectId}/git/stash`)
    return res.stashes
  }

  gitStashSave(projectId: number, message?: string) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stash/save`, {
      method: 'POST',
      body: JSON.stringify(message != null ? { message } : {}),
    })
  }

  gitStashApply(projectId: number, index: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stash/apply`, {
      method: 'POST',
      body: JSON.stringify({ index }),
    })
  }

  gitStashDrop(projectId: number, index: number) {
    return this.fetch<void>(`/api/projects/${projectId}/git/stash/drop`, {
      method: 'POST',
      body: JSON.stringify({ index }),
    })
  }

  // ─── Git 虚拟浏览 API ───

  gitShow(projectId: number, ref: string, path: string) {
    const params = new URLSearchParams({ ref, path })
    return this.fetch<{ content: string }>(`/api/projects/${projectId}/git/show?${params}`)
  }

  gitBranchFiles(projectId: number, branch: string, base?: string) {
    const params = new URLSearchParams({ branch })
    if (base) params.set('base', base)
    return this.fetch<BranchFileChange[]>(`/api/projects/${projectId}/git/branch-files?${params}`)
  }

  gitBranchDiff(projectId: number, branch: string, file: string, base?: string) {
    const params = new URLSearchParams({ branch, file })
    if (base) params.set('base', base)
    return this.fetch<string>(`/api/projects/${projectId}/git/branch-diff?${params}`)
  }

  // ─── Interview API ───

  startInterview(taskId: number) {
    return this.fetch<InterviewStartResponse>(`/api/tasks/${taskId}/interview/start`, { method: 'POST' })
  }

  saveInterviewMessage(taskId: number, data: { role: string; content: string; extra?: string }) {
    return this.fetch<InterviewMessage>(`/api/tasks/${taskId}/interview/message`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  getInterviewMessages(taskId: number) {
    return this.fetch<InterviewMessage[]>(`/api/tasks/${taskId}/interview/messages`)
  }

  async updatePrd(taskId: number, prd: string) {
    const result = await this.fetch<Task>(`/api/tasks/${taskId}/prd`, {
      method: 'PUT',
      body: JSON.stringify({ prd }),
    })
    cache.invalidate(`task:${taskId}`)
    return result
  }

  async completeInterview(taskId: number, data: { prd: string; stages: string[] }) {
    const result = await this.fetch<Task>(`/api/tasks/${taskId}/interview/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    cache.invalidate(`task:${taskId}`)
    return result
  }

  // ─── Canvas API ───

  getCanvasData(taskId: number) {
    return this.fetch<CanvasData>(`/api/tasks/${taskId}/canvas`)
  }

  async saveCanvasData(taskId: number, data: string) {
    const result = await this.fetch<CanvasData>(`/api/tasks/${taskId}/canvas`, {
      method: 'PUT',
      body: JSON.stringify({ canvas_data: data }),
    })
    cache.invalidate(`task:${taskId}`)
    return result
  }

  getInterviewMessagesPaginated(taskId: number, beforeId?: number, limit?: number) {
    const params = new URLSearchParams()
    if (beforeId != null) params.set('before_id', String(beforeId))
    if (limit != null) params.set('limit', String(limit))
    const qs = params.toString()
    return this.fetch<PaginatedMessages>(`/api/tasks/${taskId}/interview/messages/paginated${qs ? `?${qs}` : ''}`)
  }

  // ─── AI API ───

  getFileTree(projectId: number, depth = 3) {
    return this.fetch<FileTreeNode>(`/api/projects/${projectId}/file-tree?depth=${depth}`)
  }

  aiInlineEdit(req: InlineEditRequest) {
    return this.fetch<InlineEditResponse>('/api/ai/inline-edit', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  }

  getMetrics() {
    return cache.getOrFetch('metrics', CACHE_TTL.metrics, () =>
      this.fetch<Metrics>('/api/metrics')
    )
  }

  getClaudeUsage() {
    return this.fetch<ClaudeUsage>('/api/metrics/claude-usage')
  }

  getSystemMetrics() {
    return this.fetch<SystemMetrics>('/api/metrics/system')
  }

  getProcesses() {
    return this.fetch<ProcessList>('/api/metrics/processes')
  }

  killProcess(pid: number) {
    return this.fetch<{ ok: boolean; pid: number; name: string }>(`/api/metrics/processes/${pid}/kill`, { method: 'POST' })
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

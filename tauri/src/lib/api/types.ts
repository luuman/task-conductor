export type ApiMode = 'remote-http' | 'local-http' | 'tauri-ipc'

export interface Project {
  id: number
  name: string
  description: string | null
  repo_url: string
  max_parallel: number
  execution_mode: string
  is_test: boolean
  sort_order: number
  created_at: string
}

export interface ProjectKnowledge {
  id: number
  stage: string
  category: string
  title: string
  content: string
  source_task_id: number | null
  created_at: string
}

export interface FileItem {
  name: string
  path: string
  is_dir: boolean
  size: number | null
  modified: string
}

export interface Task {
  id: number
  project_id: number
  title: string
  description: string | null
  current_stage: string
  status: string
  created_at: string
  provider?: string
}

export interface StageArtifact {
  id: number
  task_id: number
  stage: string
  content: string
  created_at: string
}

export interface AiSession {
  session_id: string
  provider: string
  event_count: number
  started_at: string
  last_event_at: string
}

export interface Settings {
  workspace_root: string
  feishu_app_id: string
  feishu_app_secret: string
  feishu_owner_id: string
  feishu_default_chat_id: string
  notify_tts_enabled: boolean
  notify_tts_pipe_path: string
  notify_webhook_url: string
  notify_webhook_enabled: boolean
  notify_browser_enabled: boolean
  pipeline_approval_stages: string[]
  pipeline_max_retries: number
  pipeline_confidence_threshold: number
  observe_session_limit: number
  observe_event_limit: number
  observe_auto_cleanup: boolean
  observe_cleanup_days: number
  ui_theme: string
  ui_sidebar_collapsed: boolean
  ui_default_page: string
  ui_log_max_lines: number
  security_tunnel_enabled: boolean
}

export interface Metrics {
  tasks: {
    total: number
    by_status: Record<string, number>
    avg_duration_s: number | null
    approval_rate: number | null
  }
  claude: Record<string, unknown>
  kpi: {
    ai_rating: number
    interactions: number
    avg_response_time_s: number
    uptime_pct: number
  }
  gauge: {
    availability_pct: number
  }
  weekly: Record<string, unknown>
}

export interface ClaudeUsage {
  tokens: Record<string, unknown>
  tools: Record<string, unknown>
  recent_tools: Array<Record<string, unknown>>
  sessions: {
    total: number
    active: number
  }
  performance: Record<string, unknown>
}

export interface HookEntry {
  type: string
  command: string
  timeout: number
}

export interface HookRule {
  matcher: string
  hooks: HookEntry[]
}

export interface McpServer {
  name: string
  url: string | null
  command: string | null
  args: string[] | null
  transport: string
  status: string
  scope: string
}

export interface SkillInfo {
  name: string
  path: string
}

export interface ProjectRef {
  dir_name: string
  has_memory: boolean
  has_claude_md: boolean
}

export interface DailyActivity {
  date: string
  message_count: number
  session_count: number
  tool_call_count: number
}

export interface ClaudeOverview {
  cli_version: string
  home_path: string
  total_messages: number
  total_tool_calls: number
  total_sessions: number
  first_active_day: string | null
  last_active_day: string | null
  active_days: number
  daily_activity: DailyActivity[]
  installed_plugins: Array<{ plugin_id: string; name: string; publisher: string; scope: string; version: string }>
  skills: SkillInfo[]
  hook_scripts: Array<{ name: string; path: string; size_bytes: number }>
  projects: ProjectRef[]
  mcp_servers: McpServer[]
}

export interface ClaudeConfig {
  hooks: Record<string, HookRule[]>
  enabled_plugins: Record<string, boolean>
  permissions: Record<string, unknown>
  other: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface ApiAdapter {
  getProjects(): Promise<Project[]>
  createProject(data: { name: string; description?: string }): Promise<Project>
  getProjectFiles(projectId: number): Promise<{ path: string; items: FileItem[] }>
  getProjectKnowledge(projectId: number): Promise<ProjectKnowledge[]>
  getTasks(projectId: number): Promise<Task[]>
  getTask(taskId: number): Promise<Task>
  createTask(projectId: number, data: { title: string; description?: string }): Promise<Task>
  approveTask(taskId: number, data: { action: 'approve' | 'reject'; reason?: string }): Promise<void>
  advanceTask(taskId: number): Promise<void>
  getSessions(): Promise<AiSession[]>
  healthCheck(): Promise<boolean>
  getSettings(): Promise<Settings>
  updateSettings(data: Partial<Settings>): Promise<Settings>
  updatePin(newPin: string): Promise<{ ok: boolean }>
  exportDb(): Promise<{ path: string; size_mb: number }>
  clearSessions(): Promise<{ ok: boolean; message: string }>
  clearCompletedTasks(): Promise<{ ok: boolean; count: number }>
  restartService(): Promise<void>
  getMetrics(): Promise<Metrics>
  getClaudeUsage(): Promise<ClaudeUsage>
  getClaudeOverview(): Promise<ClaudeOverview>
  getClaudeConfig(): Promise<ClaudeConfig>
  updateClaudeConfigKey(key: string, value: unknown): Promise<{ ok: boolean }>
}

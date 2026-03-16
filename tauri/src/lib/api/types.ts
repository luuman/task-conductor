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

export interface ApiAdapter {
  getProjects(): Promise<Project[]>
  createProject(data: { name: string; description?: string }): Promise<Project>
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
}

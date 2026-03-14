export type ApiMode = 'remote-http' | 'local-http' | 'tauri-ipc'

export interface Project {
  id: number
  name: string
  description: string | null
  created_at: string
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
}

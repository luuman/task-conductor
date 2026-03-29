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
  stages_config: string | null  // JSON list[str]，启用的阶段；null = 全部
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

export interface FileTreeNode {
  name: string
  type: 'directory' | 'file'
  children?: FileTreeNode[]
}

export interface FileItem {
  name: string
  path: string
  is_dir: boolean
  size: number | null
  modified: string
}

export interface Version {
  id: number
  project_id: number
  name: string          // "v1.0" / 自定义
  title: string | null
  description: string | null
  status: 'planning' | 'active' | 'shipped'
  target_date: string | null  // YYYY-MM-DD
  sort_order: number
  created_at: string
}

export interface VersionCreate {
  name: string
  title?: string | null
  description?: string | null
  status?: 'planning' | 'active' | 'shipped'
  target_date?: string | null
  sort_order?: number
}

export interface VersionUpdate {
  name?: string
  title?: string | null
  description?: string | null
  status?: 'planning' | 'active' | 'shipped'
  target_date?: string | null
  sort_order?: number
}

export interface Task {
  id: number
  project_id: number
  version_id: number | null
  title: string
  description: string | null
  stage: string
  status: string
  depends_on: string | null
  stages: string | null           // JSON list[str]，per-task 阶段
  prd_content: string | null      // 结构化 PRD JSON
  interview_status: 'none' | 'active' | 'completed'
  claude_session_id?: string | null
  canvas_data?: string | null
  worktree_path: string | null
  branch_name: string | null
  queued_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  provider?: string
}

export interface InterviewMessage {
  id: number
  task_id: number
  role: 'user' | 'assistant'
  content: string
  extra?: string | null
  created_at: string
}

export interface InterviewStartResponse {
  system_prompt: string
  task: Task
}

export interface StageArtifact {
  id: number
  task_id: number
  stage: string
  artifact_type: string
  content: string
  confidence: number | null
  assumptions: string | null
  critic_notes: string | null
  retry_count: number
  error_log: string | null
  created_at: string
}

export interface AiSession {
  session_id: string
  provider: string
  event_count: number
  started_at: string
  last_event_at?: string
  last_seen_at?: string
  cwd?: string
  status?: string
  summary?: string | null
  note?: { alias?: string | null; notes?: string | null; tags?: string[]; linked_task_id?: number | null }
}

export interface SessionEvent {
  id: number
  session_id: string
  event_type: string
  tool_name: string | null
  tool_input: unknown
  tool_result: unknown
  extra: unknown
  created_at: string
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

export interface SystemMetrics {
  cpu: {
    percent: number
    user_pct: number | null
    system_pct: number | null
    iowait_pct: number | null
    count_logical: number
    count_physical: number
    freq_mhz: number | null
    freq_max_mhz: number | null
    ctx_switches_per_sec: number | null
    load_avg: { '1m': number; '5m': number; '15m': number } | null
    per_core: number[]
  }
  memory: {
    total_gb: number
    used_gb: number
    avail_gb: number
    free_gb: number
    buffers_gb: number
    cached_gb: number
    percent: number
  }
  swap: { total_gb: number; used_gb: number; percent: number }
  disk_space: { total_gb: number | null; used_gb: number | null; free_gb: number | null; percent: number | null }
  disk_io: { read_mbps: number | null; write_mbps: number | null; read_iops: number | null; write_iops: number | null; util_pct: number | null }
  network: { in_kbps: number | null; out_kbps: number | null; sent_mb: number | null; recv_mb: number | null; tcp_states: Record<string, number>; err_out: number | null; err_in: number | null }
  uptime_hours: number
  hostname: string
  platform: string
  process_count: number | null
  sensors: { temperatures: Array<{ sensor: string; label: string; current: number; high: number | null; critical: number | null }>; fans: Array<{ sensor: string; label: string; rpm: number }> }
  net_interfaces: Array<{ name: string; ip: string }>
  disk_device: string | null
}

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  cpu_pct: number
  mem_mb: number
}

export interface ProcessList {
  by_cpu: ProcessInfo[]
  by_mem: ProcessInfo[]
  all: ProcessInfo[]
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

export interface SkillDetail {
  name: string
  path: string
  description: string
  metadata: Record<string, unknown>
  content: string
  has_auxiliary: boolean
  auxiliary_files: string[]
  enabled: boolean
}

export interface AgentInfo {
  name: string
  path: string
  content: string
  scope: string
  enabled: boolean
  metadata: Record<string, unknown>
}

export interface CommandInfo {
  name: string
  path: string
  content: string
  scope: string
  enabled: boolean
}

export interface RuleInfo {
  name: string
  path: string
  content: string
  scope: string
  enabled: boolean
}

export interface DisabledItem {
  type: 'agent' | 'command' | 'rule' | 'skill'
  name: string
  file_path: string
  scope?: string
}

export interface ClaudeSystemInfo {
  cli_version: string
  home_path: string
  config_path: string
  cache_dir: string
  cache_size_mb: number
  history_size_mb: number
  session_count: number
  project_count: number
  skill_count: number
  plugin_count: number
  hook_script_count: number
  mcp_server_count: number
  platform: string
  python_version: string
}

export interface PresetItem {
  name: string
  title: string
  desc: string
  icon: string
  content: string
  installed: boolean
}

export interface ProjectDetails {
  dir_name: string
  session_count: number
  last_active: string
  description: string
}

export interface ProjectComponents {
  dir_name: string
  project_path: string
  agents: string[]
  commands: string[]
  rules: string[]
  has_settings: boolean
  has_claude_md: boolean
}

// ─── 编辑器 ───

export interface EditorTab {
  path: string
  name: string
  language: string
}

// ─── Git ───

export interface GitStatus {
  branch: string
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
}

export interface GitFileChange {
  path: string
  status: string
}

export interface BranchFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
  additions: number
  deletions: number
}

export interface GitCommit {
  hash: string
  parents: string[]
  author: string
  date: string
  refs: string
  message: string
}

export interface GitBranch {
  name: string
  current: boolean
  remote: boolean
}

export interface GitStash {
  ref: string
  message: string
  date: string
}

export interface InlineEditRequest {
  file_path: string
  file_content: string
  selection: { startLine: number; endLine: number }
  instruction: string
}

export interface InlineEditResponse {
  original: string
  modified: string
}

export interface TranscriptBlock {
  type: 'text' | 'tool_use'
  text?: string | null
  tool_name?: string | null
  tool_input?: Record<string, unknown> | null
  tool_use_id?: string | null
  tool_result?: string | null
  tool_error?: boolean | null
}

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  ts: string | null
  blocks: TranscriptBlock[]
  model?: string | null
}

export interface PaginatedMessages {
  messages: InterviewMessage[]
  total: number
  has_more: boolean
}

export interface CanvasData {
  task_id: number
  canvas_data: string | null
}

export interface CanvasNodeData {
  id: string
  type: 'module' | 'wireframe' | 'note' | 'group'
  x: number
  y: number
  width: number
  height: number
  title: string
  icon?: string
  status?: string
  features?: { text: string; done: boolean }[]
  color?: number
  content?: string
}

export interface CanvasEdgeData {
  id: string
  source: string
  target: string
  color?: number
}

export interface CanvasState {
  nodes: CanvasNodeData[]
  edges: CanvasEdgeData[]
  zoom?: number
  panX?: number
  panY?: number
}

export interface ConversationNote {
  alias?: string | null
  notes?: string | null
  tags?: string[]
  linked_task_id?: number | null
}

export interface ApiAdapter {
  getProjects(): Promise<Project[]>
  createProject(data: { name: string; description?: string }): Promise<Project>
  updateProjectStagesConfig(projectId: number, stagesConfig: string[]): Promise<Project>
  // 版本管理
  getVersions(projectId: number): Promise<Version[]>
  createVersion(projectId: number, data: VersionCreate): Promise<Version>
  updateVersion(projectId: number, versionId: number, data: VersionUpdate): Promise<Version>
  deleteVersion(projectId: number, versionId: number): Promise<void>
  assignTaskToVersion(projectId: number, versionId: number, taskId: number): Promise<Task>
  removeTaskFromVersion(projectId: number, versionId: number, taskId: number): Promise<Task>
  getProjectFiles(projectId: number): Promise<{ path: string; items: FileItem[] }>
  getProjectKnowledge(projectId: number): Promise<ProjectKnowledge[]>
  getTasks(projectId: number): Promise<Task[]>
  getTask(taskId: number): Promise<Task>
  getTaskArtifacts(taskId: number): Promise<StageArtifact[]>
  createTask(projectId: number, data: { title: string; description?: string }): Promise<Task>
  approveTask(taskId: number, data: { action: 'approve' | 'reject'; reason?: string }): Promise<void>
  startTask(taskId: number): Promise<Task>
  advanceTask(taskId: number): Promise<void>
  getSessions(): Promise<AiSession[]>
  getSessionEvents(sessionId: string): Promise<SessionEvent[]>
  getTranscript(sessionId: string, params?: { limit?: number; offset?: number }): Promise<{ messages: TranscriptMessage[]; file_found: boolean; total: number; has_more: boolean }>
  getQuestions(sessionId: string): Promise<{ questions: Array<{ index: number; text: string }>; total: number }>
  getSessionNote(sessionId: string): Promise<ConversationNote>
  updateSessionNote(sessionId: string, data: Partial<ConversationNote>): Promise<ConversationNote>
  healthCheck(): Promise<boolean>
  getSettings(): Promise<Settings>
  updateSettings(data: Partial<Settings>): Promise<Settings>
  updatePin(newPin: string): Promise<{ ok: boolean }>
  exportDb(): Promise<{ path: string; size_mb: number }>
  clearSessions(): Promise<{ ok: boolean; message: string }>
  clearCompletedTasks(): Promise<{ ok: boolean; count: number }>
  restartService(): Promise<void>
  getFileTree(projectId: number, depth?: number): Promise<FileTreeNode>
  getMetrics(): Promise<Metrics>
  getClaudeUsage(): Promise<ClaudeUsage>
  getSystemMetrics(): Promise<SystemMetrics>
  getProcesses(): Promise<ProcessList>
  killProcess(pid: number): Promise<{ ok: boolean; pid: number; name: string }>
  getClaudeOverview(): Promise<ClaudeOverview>
  getClaudeConfig(): Promise<ClaudeConfig>
  updateClaudeConfigKey(key: string, value: unknown): Promise<{ ok: boolean }>

  // ─── 文件操作 ───
  getFileContent(projectId: number, path: string): Promise<{ path: string; name: string; size: number; binary: boolean; content: string }>
  saveFile(projectId: number, path: string, content: string): Promise<void>
  createFile(projectId: number, path: string, content?: string): Promise<void>
  createDirectory(projectId: number, path: string): Promise<void>
  renameFile(projectId: number, oldPath: string, newPath: string): Promise<void>
  deleteFile(projectId: number, path: string): Promise<void>
  listDir(projectId: number, path: string): Promise<{ path: string; items: FileItem[] }>
  searchFiles(projectId: number, query: string): Promise<FileItem[]>

  // ─── Git 操作 ───
  gitStatus(projectId: number): Promise<GitStatus>
  gitDiff(projectId: number, opts?: { file?: string; staged?: boolean; commit?: string }): Promise<string>
  gitStage(projectId: number, files?: string[]): Promise<void>
  gitUnstage(projectId: number, files?: string[]): Promise<void>
  gitDiscard(projectId: number, files: string[]): Promise<void>
  gitCommit(projectId: number, message: string): Promise<void>
  gitLog(projectId: number, limit?: number, branch?: string): Promise<GitCommit[]>
  gitBranches(projectId: number): Promise<GitBranch[]>
  gitCheckout(projectId: number, branch: string, create?: boolean): Promise<void>
  gitPush(projectId: number): Promise<void>
  gitPull(projectId: number): Promise<void>
  gitFetch(projectId: number): Promise<void>
  gitStashList(projectId: number): Promise<GitStash[]>
  gitStashSave(projectId: number, message?: string): Promise<void>
  gitStashApply(projectId: number, index: number): Promise<void>
  gitStashDrop(projectId: number, index: number): Promise<void>

  // ─── Git 虚拟浏览 ───
  gitShow(projectId: number, ref: string, path: string): Promise<{ content: string }>
  gitBranchFiles(projectId: number, branch: string, base?: string): Promise<BranchFileChange[]>
  gitBranchDiff(projectId: number, branch: string, file: string, base?: string): Promise<string>

  // ─── Interview ───
  startInterview(taskId: number): Promise<InterviewStartResponse>
  saveInterviewMessage(taskId: number, data: { role: string; content: string; extra?: string }): Promise<InterviewMessage>
  getInterviewMessages(taskId: number): Promise<InterviewMessage[]>
  updatePrd(taskId: number, prd: string): Promise<Task>
  completeInterview(taskId: number, data: { prd: string; stages: string[] }): Promise<Task>

  // ─── Canvas ───
  getCanvasData(taskId: number): Promise<CanvasData>
  saveCanvasData(taskId: number, data: string): Promise<CanvasData>
  getInterviewMessagesPaginated(taskId: number, beforeId?: number, limit?: number): Promise<PaginatedMessages>

  // ─── AI ───
  aiInlineEdit(req: InlineEditRequest): Promise<InlineEditResponse>

  claudeConfig: {
    getConfig(): Promise<ClaudeConfig>
    getOverview(): Promise<ClaudeOverview>
    getHookEvents(): Promise<string[]>
    updateHooks(event: string, rules: HookRule[]): Promise<ClaudeConfig>
    deleteHooks(event: string): Promise<ClaudeConfig>
    updatePlugin(plugin_id: string, enabled: boolean): Promise<ClaudeConfig>
    deletePlugin(id: string): Promise<ClaudeConfig>
    updateOtherKey(key: string, value: unknown): Promise<ClaudeConfig>
    deleteOtherKey(key: string): Promise<ClaudeConfig>
    updatePermissions(permissions: Record<string, unknown>): Promise<ClaudeConfig>
    getMcpServers(): Promise<McpServer[]>
    addMcpServer(data: { name: string; url?: string; command?: string; args?: string[]; transport: string; scope: string }): Promise<{ ok: boolean; output?: string; servers: McpServer[] }>
    deleteMcpServer(name: string, scope?: string): Promise<{ ok: boolean; servers: McpServer[] }>
    getSkills(): Promise<SkillDetail[]>
    toggleSkill(name: string, enabled: boolean): Promise<{ ok: boolean }>
    getCommands(): Promise<CommandInfo[]>
    toggleCommand(name: string, enabled: boolean): Promise<{ ok: boolean }>
    createCommand(name: string, content?: string): Promise<{ ok: boolean }>
    deleteCommand(name: string): Promise<{ ok: boolean }>
    getRules(): Promise<RuleInfo[]>
    toggleRule(name: string, enabled: boolean): Promise<{ ok: boolean }>
    createRule(name: string, content?: string): Promise<{ ok: boolean }>
    deleteRule(name: string): Promise<{ ok: boolean }>
    getAgents(): Promise<AgentInfo[]>
    toggleAgent(name: string, enabled: boolean): Promise<{ ok: boolean }>
    createAgent(name: string, content?: string): Promise<{ ok: boolean }>
    deleteAgent(name: string): Promise<{ ok: boolean }>
    getAgentPresets(): Promise<PresetItem[]>
    getCommandPresets(): Promise<PresetItem[]>
    getRulePresets(): Promise<PresetItem[]>
    getSystemInfo(): Promise<ClaudeSystemInfo>
    getClaudeMd(): Promise<{ content: string; path: string }>
    updateClaudeMd(content: string): Promise<{ content: string; path: string }>
    getDisabledItems(): Promise<DisabledItem[]>
    restoreDisabledItem(type: string, name: string): Promise<{ ok: boolean }>
    deleteDisabledItem(type: string, name: string): Promise<{ ok: boolean }>
    getProjectComponents(dirName: string): Promise<ProjectComponents>
    getProjectDetails(dirName: string): Promise<ProjectDetails>
  }
}

// frontend/src/lib/api.ts
import i18n from "../i18n";

export interface ConnectionConfig {
  type: "tunnel" | "ssh";
  // tunnel mode
  tunnelUrl?: string;
  pin?: string;
  // ssh mode
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKey?: string;
  // stored after auth
  token?: string;
}

const CONFIG_KEY = "tc_connection";

export function getConfig(): ConnectionConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveConfig(config: ConnectionConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function getBaseUrl(): string {
  // Local access (localhost/127.0.0.1): connect to backend directly, bypassing tunnel URL and system proxy
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  if (isLocal) {
    // Use Vite proxy, no hard-coded backend port; on macOS just forward 7070
    return import.meta.env.VITE_API_URL || "";
  }
  const config = getConfig();
  if (config?.type === "tunnel" && config.tunnelUrl) {
    return config.tunnelUrl.replace(/\/$/, "");
  }
  if (config?.type === "ssh" && config.tunnelUrl) {
    return config.tunnelUrl.replace(/\/$/, "");
  }
  return import.meta.env.VITE_API_URL || "http://localhost:8765";
}

function getToken(): string {
  return getConfig()?.token || "";
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const base = getBaseUrl();
  const resp = await fetch(`${base}${path}`, {
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

// Local auth without PIN (localhost only)
export async function authLocal(): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const resp = await fetch("/auth/local", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error("local auth failed");
    const data = await resp.json();
    return data.token;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// PIN auth
export async function authWithPin(tunnelUrl: string, pin: string): Promise<string> {
  const base = tunnelUrl.replace(/\/$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(`${base}/auth/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(i18n.t("login.errors.pinWrong"));
    const data = await resp.json();
    return data.token;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error) {
      if (err.name === "AbortError") throw new Error(i18n.t("login.errors.connectionTimeout"));
      if (err.message === "Failed to fetch") throw new Error(i18n.t("login.errors.cannotConnect"));
    }
    throw err;
  }
}

export async function checkAuth(): Promise<boolean> {
  try {
    await request("/auth/check");
    return true;
  } catch {
    return false;
  }
}

export interface Project {
  id: number;
  name: string;
  repo_url: string;
  max_parallel: number;
  execution_mode: string;
  is_test: boolean;
  feishu_chat_id: string | null;
  feishu_sync: boolean;
  sort_order: number;
  created_at: string;
}
export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string;
  stage: string;
  status: string;
  depends_on: string | null;       // JSON list[int]
  worktree_path: string | null;
  branch_name: string | null;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface StageArtifact {
  id: number;
  task_id: number;
  stage: string;
  artifact_type: string;
  content: string;
  confidence: number | null;
  assumptions: string | null;      // JSON list[str]
  critic_notes: string | null;
  retry_count: number;
  error_log: string | null;
  created_at: string;
}
export interface AnalysisOption { label: string; title: string; effort: string; risk: string; description: string; }

export interface ProjectKnowledge {
  id: number;
  stage: string;
  category: string;
  title: string;
  content: string;
  source_task_id: number | null;
  created_at: string;
}

export interface ConversationNote {
  alias: string | null;
  notes: string | null;
  tags: string[];
  linked_task_id: number | null;
}

export interface TranscriptBlock {
  type: "text" | "tool_use";
  text?: string;
  tool_name?: string | null;
  tool_input?: Record<string, unknown> | null;
}

export interface TranscriptMessage {
  role: "user" | "assistant";
  ts: string | null;
  blocks: TranscriptBlock[];
  model?: string | null;
}

export interface TranscriptResponse {
  messages: TranscriptMessage[];
  file_found: boolean;
}

export interface ClaudeSession {
  id: number;
  session_id: string;
  cwd: string;
  status: "active" | "idle" | "stopped";
  linked_task_id: number | null;
  started_at: string;
  last_seen_at: string;
  event_count: number;
  note: ConversationNote;
}

export interface ClaudeEvent {
  id: number;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  created_at: string;
}

export interface Metrics {
  tasks: {
    total: number;
    by_status: Record<string, number>;
    avg_duration_s: number | null;
    approval_rate: number | null;
  };
  claude: {
    call_count: number;
    avg_ttft_ms: number | null;
    avg_duration_s: number | null;
    avg_chars_per_sec: number | null;
    recent_ttfts_ms: number[];
    active_processes: number;
  };
  kpi: {
    ai_rating: number;
    interactions: number;
    avg_response_time_s: number | null;
    uptime_pct: number;
  };
  gauge: {
    availability_pct: number;
  };
  weekly: Array<{
    day: string;
    count: number;
    success_rate: number;
    is_today: boolean;
  }>;
}

export interface SystemMetrics {
  cpu: {
    percent: number;
    user_pct: number | null;
    system_pct: number | null;
    iowait_pct: number | null;
    count_logical: number;
    count_physical: number | null;
    freq_mhz: number | null;
    freq_max_mhz: number | null;
    ctx_switches_per_sec: number | null;
    load_avg: { "1m": number; "5m": number; "15m": number } | null;
    per_core: number[];
  };
  memory: { total_gb: number; used_gb: number; avail_gb: number; free_gb: number; buffers_gb: number; cached_gb: number; percent: number };
  swap:   { total_gb: number; used_gb: number; percent: number };
  disk_space: { total_gb: number | null; used_gb: number | null; free_gb: number | null; percent: number | null };
  disk_io: { read_mbps: number | null; write_mbps: number | null; read_iops: number | null; write_iops: number | null; util_pct: number | null };
  network: {
    in_kbps: number | null; out_kbps: number | null;
    sent_mb: number | null; recv_mb: number | null;
    tcp_states: Record<string, number>;
    err_out: number | null; err_in: number | null;
  };
  uptime_hours: number;
  hostname: string;
  platform: string;
  process_count: number | null;
  sensors: {
    temperatures: Array<{ sensor: string; label: string; current: number; high: number | null; critical: number | null }>;
    fans: Array<{ sensor: string; label: string; rpm: number }>;
  };
  net_interfaces: Array<{ name: string; ip: string }>;
  disk_device: string | null;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_pct: number;
  mem_mb: number;
}

export interface ClaudeUsageMetrics {
  tokens: {
    total_input: number;
    total_output: number;
    total_cache_write: number;
    total_cache_read: number;
    total_cost_usd: number;
    session_count: number;
    by_model: Array<{ model: string; input: number; output: number; cost: number; calls: number }>;
    hourly: Array<{ hour: number; input: number; output: number; cost: number }>;
  };
  tools: Array<{ tool: string; count: number; pct: number }>;
  recent_tools: Array<{ tool: string; session: string; ts: number }>;
  sessions: { total: number; active: number };
  performance: {
    call_count: number;
    avg_ttft_ms: number | null;
    avg_duration_s: number | null;
    avg_chars_per_sec: number | null;
    recent_ttfts_ms: number[];
    active_processes: number;
  };
}

// Claude Config types
export interface HookEntry { type: string; command: string; timeout: number; }
export interface HookRule { matcher: string; hooks: HookEntry[]; }
export interface ClaudeConfig {
  hooks: Record<string, HookRule[]>;
  enabled_plugins: Record<string, boolean>;
  permissions: Record<string, unknown>;
  other: Record<string, unknown>;
  raw: Record<string, unknown>;
}
export interface InstalledPlugin {
  plugin_id: string; name: string; publisher: string;
  scope: string; version: string; install_path: string;
  installed_at: string; last_updated: string; git_commit: string | null;
}
export interface DailyActivity {
  date: string; message_count: number; session_count: number; tool_call_count: number;
}
export interface SkillInfo { name: string; path: string; }
export interface HookScriptInfo { name: string; path: string; size_bytes: number; }
export interface ProjectRef { dir_name: string; has_memory: boolean; has_claude_md: boolean; }
export interface McpServer {
  name: string; url: string | null; command: string | null;
  args: string[] | null; transport: string; status: string; scope: string;
}
export interface ClaudeOverview {
  cli_version: string; home_path: string;
  total_messages: number; total_tool_calls: number; total_sessions: number;
  first_active_day: string | null; last_active_day: string | null;
  active_days: number;
  daily_activity: DailyActivity[];
  installed_plugins: InstalledPlugin[];
  skills: SkillInfo[];
  hook_scripts: HookScriptInfo[];
  projects: ProjectRef[];
  mcp_servers: McpServer[];
}

export interface SkillDetail {
  name: string; path: string; description: string;
  metadata: Record<string, unknown>; content: string;
  has_auxiliary: boolean; auxiliary_files: string[];
  enabled: boolean;
}
export interface CommandInfo { name: string; path: string; content: string; scope: string; enabled: boolean; }
export interface RuleInfo { name: string; path: string; content: string; scope: string; enabled: boolean; }
export interface AgentInfo {
  name: string; path: string; content: string; scope: string;
  enabled: boolean; metadata: Record<string, unknown>;
}
export interface PresetItem {
  name: string; title: string; desc: string; icon: string; content: string; installed: boolean;
}
export interface DisabledItem {
  type: "agent" | "command" | "rule" | "skill";
  name: string;
  file_path: string;
  scope: string;
}
export interface ProjectComponents {
  dir_name: string;
  project_path: string;
  agents: { name: string; scope: string; enabled: boolean }[];
  commands: { name: string; scope: string; enabled: boolean }[];
  rules: { name: string; scope: string; enabled: boolean }[];
  has_settings: boolean;
  has_claude_md: boolean;
}
export interface ProjectDetails {
  dir_name: string;
  session_count: number;
  last_active: string | null;
  description: string;
}
export interface ClaudeSystemInfo {
  cli_version: string; home_path: string; config_path: string;
  cache_dir: string; cache_size_mb: number; history_size_mb: number;
  session_count: number; project_count: number; skill_count: number;
  plugin_count: number; hook_script_count: number; mcp_server_count: number;
  platform: string; python_version: string;
}

export interface McpMarketServer {
  id: string; name: string; description: string; icon: string;
  type: string; url?: string; auth_type: "none" | "token" | "oauth";
  auth_note?: string; auth_env?: string; category: string; installed: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  modified: string;
}

export interface FileListResponse {
  path: string;
  items: FileItem[];
}

export interface FileContentResponse {
  path: string;
  name: string;
  size: number;
  binary: boolean;
  content: string | null;
}

export interface InboxItem { id: string; title: string; description: string; }
export interface ItemAnalysis {
  id: string;
  priority: number;
  understanding: string;
  complexity: "S" | "M" | "L" | "XL";
  approach: string;
  tags: string[];
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  shutdown: () => request<{ status: string }>("/api/shutdown", { method: "POST" }),
  agentInfo: () => request<{ tunnel_url: string | null; version: string }>("/agent/info"),
  projects: {
    list: () => request<Project[]>("/api/projects"),
    create: (body: { name: string; repo_url: string; max_parallel?: number; execution_mode?: string; is_test?: boolean }) =>
      request<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
    delete: (projectId: number) =>
      request<{ ok: boolean }>(`/api/projects/${projectId}`, { method: "DELETE" }),
    scan: () => request<Project[]>("/api/projects/scan", { method: "POST" }),
    updateSort: (projectId: number, body: { sort_order?: number; is_test?: boolean }) =>
      request<Project>(`/api/projects/${projectId}/sort`, { method: "PUT", body: JSON.stringify(body) }),
    toggleFeishuSync: (projectId: number, enabled: boolean) =>
      request<Project>(`/api/projects/${projectId}/feishu-sync`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    tasks: (projectId: number) => request<Task[]>(`/api/projects/${projectId}/tasks`),
    files: (projectId: number, path = "") =>
      request<FileListResponse>(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`),
    fileContent: (projectId: number, path: string) =>
      request<FileContentResponse>(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`),
    saveFile: (projectId: number, path: string, content: string) =>
      request<{ path: string; name: string; size: number; ok: boolean }>(
        `/api/projects/${projectId}/file`,
        { method: "PUT", body: JSON.stringify({ path, content }) },
      ),
    searchFiles: (projectId: number, q: string) =>
      request<{ query: string; items: FileItem[] }>(
        `/api/projects/${projectId}/files/search?q=${encodeURIComponent(q)}`,
      ),
    knowledge: (projectId: number) =>
      request<ProjectKnowledge[]>(`/api/projects/${projectId}/knowledge`),
    deleteKnowledge: (projectId: number, knowledgeId: number) =>
      request<{ ok: boolean }>(`/api/projects/${projectId}/knowledge/${knowledgeId}`, { method: "DELETE" }),
  },
  tasks: {
    get: (id: number) => request<Task>(`/api/tasks/${id}`),
    create: (projectId: number, body: { title: string; description: string; depends_on?: number[] }) =>
      request<Task>(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(body) }),
    approve: (id: number, action: "approve" | "reject", reason = "") =>
      request<Task>(`/api/tasks/${id}/approve`, { method: "POST", body: JSON.stringify({ action, reason }) }),
    advance: (id: number) =>
      request<Task>(`/api/tasks/${id}/advance`, { method: "POST" }),
    artifacts: (id: number) => request<StageArtifact[]>(`/api/tasks/${id}/artifacts`),
  },
  pipeline: {
    runAnalysis: (taskId: number) =>
      request<{ status: string }>(`/api/pipeline/${taskId}/run-analysis`, { method: "POST" }),
    runStage: (taskId: number, stage: string) =>
      request<{ status: string; task_id: number; stage: string }>(`/api/pipeline/${taskId}/run/${stage}`, { method: "POST" }),
  },
  metrics: () => request<Metrics>("/api/metrics"),
  system: () => request<SystemMetrics>("/api/metrics/system"),
  claudeUsage: () => request<ClaudeUsageMetrics>("/api/metrics/claude-usage"),
  processes: () => request<{ by_cpu: ProcessInfo[]; by_mem: ProcessInfo[] }>("/api/metrics/processes"),
  taskManager: {
    analyze: (items: InboxItem[]) =>
      request<{ results: ItemAnalysis[] }>("/api/task-manager/analyze", {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
  },
  sessions: {
    list: () => request<ClaudeSession[]>("/api/sessions"),
    events: (sessionId: string) => request<ClaudeEvent[]>(`/api/sessions/${sessionId}/events`),
    transcript: (sessionId: string) => request<TranscriptResponse>(`/api/sessions/${sessionId}/transcript`),
    getNote: (sessionId: string) =>
      request<ConversationNote>(`/api/sessions/${sessionId}/note`),
    upsertNote: (sessionId: string, body: Partial<ConversationNote>) =>
      request<ConversationNote>(`/api/sessions/${sessionId}/note`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  settings: {
    get: () => request<{
      workspace_root: string;
      feishu_app_id: string;
      feishu_app_secret: string;
      feishu_owner_id: string;
      feishu_default_chat_id: string;
    }>("/api/settings"),
    update: (workspace_root: string) =>
      request<{ workspace_root: string }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ workspace_root }),
      }),
    updateFeishu: (body: {
      feishu_app_id?: string;
      feishu_app_secret?: string;
      feishu_owner_id?: string;
      feishu_default_chat_id?: string;
    }) =>
      request<Record<string, string>>("/api/settings/feishu", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    restart: () =>
      request<void>("/api/settings/restart", { method: "POST" }),
  },
  claudeConfig: {
    get: () => request<ClaudeConfig>("/api/claude-config"),
    overview: () => request<ClaudeOverview>("/api/claude-config/overview"),
    hookEvents: () => request<string[]>("/api/claude-config/hook-events"),
    updateHooks: (event: string, rules: HookRule[]) =>
      request<ClaudeConfig>("/api/claude-config/hooks", {
        method: "PUT",
        body: JSON.stringify({ event, rules }),
      }),
    deleteHookEvent: (event: string) =>
      request<ClaudeConfig>(`/api/claude-config/hooks/${event}`, { method: "DELETE" }),
    togglePlugin: (plugin_id: string, enabled: boolean) =>
      request<ClaudeConfig>("/api/claude-config/plugins", {
        method: "PUT",
        body: JSON.stringify({ plugin_id, enabled }),
      }),
    removePlugin: (plugin_id: string) =>
      request<ClaudeConfig>(`/api/claude-config/plugins/${encodeURIComponent(plugin_id)}`, { method: "DELETE" }),
    updateOther: (key: string, value: unknown) =>
      request<ClaudeConfig>(`/api/claude-config/other/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    deleteOther: (key: string) =>
      request<ClaudeConfig>(`/api/claude-config/other/${key}`, { method: "DELETE" }),
    updatePermissions: (permissions: Record<string, unknown>) =>
      request<ClaudeConfig>("/api/claude-config/permissions", {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      }),
    listMcp: () => request<McpServer[]>("/api/claude-config/mcp"),
    addMcp: (body: { name: string; url?: string; command?: string; args?: string[]; transport?: string; scope?: string; env?: Record<string, string>; headers?: Record<string, string> }) =>
      request<{ ok: boolean; output: string; servers: McpServer[] }>("/api/claude-config/mcp", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    removeMcp: (name: string, scope = "user") =>
      request<{ ok: boolean; servers: McpServer[] }>(`/api/claude-config/mcp/${encodeURIComponent(name)}?scope=${scope}`, {
        method: "DELETE",
      }),
    listSkills: () => request<SkillDetail[]>("/api/claude-config/skills"),
    toggleSkill: (name: string, enabled: boolean) =>
      request<{ ok: boolean }>("/api/claude-config/skills/toggle", { method: "POST", body: JSON.stringify({ name, enabled }) }),
    listCommands: () => request<CommandInfo[]>("/api/claude-config/commands"),
    toggleCommand: (name: string, enabled: boolean) =>
      request<{ ok: boolean }>("/api/claude-config/commands/toggle", { method: "POST", body: JSON.stringify({ name, enabled }) }),
    createCommand: (name: string, content?: string) =>
      request<{ ok: boolean }>("/api/claude-config/commands/create", { method: "POST", body: JSON.stringify({ name, content }) }),
    deleteCommand: (name: string) =>
      request<{ ok: boolean }>(`/api/claude-config/commands/${encodeURIComponent(name)}`, { method: "DELETE" }),
    listRules: () => request<RuleInfo[]>("/api/claude-config/rules"),
    toggleRule: (name: string, enabled: boolean) =>
      request<{ ok: boolean }>("/api/claude-config/rules/toggle", { method: "POST", body: JSON.stringify({ name, enabled }) }),
    createRule: (name: string, content?: string) =>
      request<{ ok: boolean }>("/api/claude-config/rules/create", { method: "POST", body: JSON.stringify({ name, content }) }),
    deleteRule: (name: string) =>
      request<{ ok: boolean }>(`/api/claude-config/rules/${encodeURIComponent(name)}`, { method: "DELETE" }),
    listAgents: () => request<AgentInfo[]>("/api/claude-config/agents"),
    toggleAgent: (name: string, enabled: boolean) =>
      request<{ ok: boolean }>("/api/claude-config/agents/toggle", { method: "POST", body: JSON.stringify({ name, enabled }) }),
    createAgent: (name: string, content?: string) =>
      request<{ ok: boolean }>("/api/claude-config/agents/create", { method: "POST", body: JSON.stringify({ name, content }) }),
    deleteAgent: (name: string) =>
      request<{ ok: boolean }>(`/api/claude-config/agents/${encodeURIComponent(name)}`, { method: "DELETE" }),
    presetAgents: () => request<PresetItem[]>("/api/claude-config/presets/agents"),
    presetCommands: () => request<PresetItem[]>("/api/claude-config/presets/commands"),
    presetRules: () => request<PresetItem[]>("/api/claude-config/presets/rules"),
    systemInfo: () => request<ClaudeSystemInfo>("/api/claude-config/system-info"),
    getClaudeMd: () => request<{ content: string; path: string }>("/api/claude-config/claude-md"),
    updateClaudeMd: (content: string) =>
      request<{ content: string; path: string }>("/api/claude-config/claude-md", {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    disabledItems: () => request<DisabledItem[]>("/api/claude-config/disabled-items"),
    restoreDisabledItem: (type: string, name: string) =>
      request<{ ok: boolean }>("/api/claude-config/disabled-items/restore", {
        method: "POST",
        body: JSON.stringify({ type, name }),
      }),
    deleteDisabledItem: (type: string, name: string) =>
      request<{ ok: boolean }>(`/api/claude-config/disabled-items/${type}/${encodeURIComponent(name)}`, { method: "DELETE" }),
    projectComponents: (dirName: string) =>
      request<ProjectComponents>(`/api/claude-config/projects/${encodeURIComponent(dirName)}/components`),
    projectDetails: (dirName: string) =>
      request<ProjectDetails>(`/api/claude-config/projects/${encodeURIComponent(dirName)}/details`),
  },
  tcConfig: {
    get: () => request<Record<string, unknown>>("/api/tc-config"),
    update: (config: Record<string, unknown>) =>
      request<Record<string, unknown>>("/api/tc-config", { method: "PUT", body: JSON.stringify({ config }) }),
    reset: () => request<Record<string, unknown>>("/api/tc-config/reset", { method: "POST" }),
    import: (config: Record<string, unknown>) =>
      request<Record<string, unknown>>("/api/tc-config/import", { method: "POST", body: JSON.stringify({ config }) }),
  },
  mcp: {
    list: () => request<McpMarketServer[]>("/api/mcp/servers"),
    install: (id: string, token?: string) =>
      request<{ ok: boolean }>(`/api/mcp/servers/${id}/install`, {
        method: "POST",
        body: JSON.stringify(token ? { token } : {}),
      }),
    uninstall: (id: string) =>
      request<{ ok: boolean }>(`/api/mcp/servers/${id}/uninstall`, { method: "DELETE" }),
  },
};

export function getWsUrl(path: string): string {
  const base = getBaseUrl();
  if (!base && typeof window !== "undefined") {
    // Vite proxy mode: derive WebSocket URL from current page address
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
  }
  return base.replace(/^http/, "ws") + path;
}

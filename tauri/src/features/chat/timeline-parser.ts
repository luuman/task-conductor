/**
 * timeline-parser.ts — 将 TranscriptMessage[] 解析为操作时间线步骤
 */
import type { TranscriptMessage } from '../../lib/api/types'

export interface TimelineStep {
  id: string
  kind: 'text' | 'tool'
  ts: string | null

  /** kind='text' 时的文本内容 */
  text?: string

  /** kind='tool' 时的工具信息 */
  toolName?: string
  toolDetail?: string
  toolInput?: Record<string, unknown>
  toolResult?: string | null
  toolError?: boolean

  /** Edit 专用 */
  oldString?: string
  newString?: string

  /** 分类标签 */
  category: 'text' | 'read' | 'edit' | 'write' | 'bash' | 'grep' | 'glob' | 'agent' | 'ask' | 'search' | 'task' | 'other'

  /** 相邻同类型合并数量（>1 表示已合并） */
  mergedCount?: number

  /** 合并时保存的所有原始步骤（含自身），用于展示多个结果 */
  mergedSteps?: TimelineStep[]
}

const CATEGORY_MAP: Record<string, TimelineStep['category']> = {
  Read: 'read', Grep: 'grep', Glob: 'glob',
  Edit: 'edit', MultiEdit: 'edit', Write: 'write',
  Bash: 'bash', Agent: 'agent', AskUserQuestion: 'ask',
  WebSearch: 'search', WebFetch: 'search',
  TaskCreate: 'task', TaskUpdate: 'task', TaskList: 'task',
  TaskGet: 'task', TaskStop: 'task',
}

function getToolDetail(name: string, input: Record<string, unknown> | null | undefined): string {
  if (!name || !input) return ''
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': {
      const fp = String(input.file_path || '')
      const fileName = fp.split('/').pop() || fp
      const offset = input.offset ? ` offset:${input.offset}` : ''
      const limit = input.limit ? ` limit:${input.limit}` : ''
      return `${fileName}${offset}${limit}`
    }
    case 'Bash': return String(input.command || '').slice(0, 120)
    case 'Grep': return `"${input.pattern || ''}" in ${String(input.path || '').split('/').pop() || '.'}`
    case 'Glob': return String(input.pattern || '')
    case 'Agent': return String(input.description || '').slice(0, 80)
    case 'AskUserQuestion': return String(input.question || '').slice(0, 100)
    case 'WebSearch': return String(input.query || '').slice(0, 80)
    case 'WebFetch': return String(input.url || '').slice(0, 80)
    case 'Skill': return String(input.skill || '')
    case 'TaskCreate': return String(input.subject || '').slice(0, 60)
    case 'TaskUpdate': return `#${input.taskId || ''} → ${input.status || ''}`
    case 'ToolSearch': return String(input.query || '').slice(0, 60)
    default: return ''
  }
}

/** 用户问题（用于分段 + 导航） */
export interface UserQuestion {
  id: string
  text: string
  ts: string | null
  /** 该问题对应的第一个 step 的索引 */
  stepIndex: number
}

/** 解析结果：steps + 用户问题列表 */
export interface ParsedTimeline {
  steps: TimelineStep[]
  questions: UserQuestion[]
}

/** 清理用户消息中 Claude Code 自动注入的系统 XML 标签，将 command 标签转换为可读文本 */
export function cleanSystemXml(text: string): string {
  // 1. 提取 command 信息，转换为可读片段
  const cmdName = text.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1]?.trim() || ''
  const cmdArgs = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim() || ''
  const cmdStdout = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)?.[1]
    ?.replace(/\x1b\[\d+m/g, '')  // 清理 ANSI 转义序列
    .trim() || ''

  // 组装命令可读文本（如 "/model claude-opus-4-6" 或 "/init"）
  let cmdReadable = ''
  if (cmdName) {
    cmdReadable = cmdArgs ? `${cmdName} ${cmdArgs}` : cmdName
    if (cmdStdout) cmdReadable += `\n→ ${cmdStdout}`
  } else if (cmdStdout) {
    cmdReadable = `→ ${cmdStdout}`
  }

  // 2. 清除系统注入的不可见标签
  const cleaned = text
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/Read the output file to retrieve the result:\s*\S+/g, '')
    // 残余未匹配的 XML 标签（保留 HTML 实体如 &lt;）
    .replace(/<[^>]+>/g, '')
    .trim()

  // 3. 组合：命令可读文本 + 用户原文
  if (cmdReadable && cleaned) return `${cmdReadable}\n${cleaned}`
  return cmdReadable || cleaned
}

export function parseTimelineWithQuestions(messages: TranscriptMessage[]): ParsedTimeline {
  const steps: TimelineStep[] = []
  const questions: UserQuestion[] = []
  let stepId = 0
  let qId = 0

  for (const msg of messages) {
    // 提取用户问题
    if (msg.role === 'user') {
      const textBlock = msg.blocks.find(b => b.type === 'text' && b.text?.trim())
      if (textBlock?.text) {
        const cleaned = cleanSystemXml(textBlock.text)
        // 跳过纯系统消息（清理后无用户文本）
        if (!cleaned) continue
        questions.push({
          id: `q${qId++}`,
          text: textBlock.text.trim(),
          ts: msg.ts,
          stepIndex: steps.length,
        })
      }
      continue
    }

    for (const block of msg.blocks) {
      if (block.type === 'text' && block.text?.trim()) {
        steps.push({
          id: `s${stepId++}`,
          kind: 'text',
          ts: msg.ts,
          text: block.text.trim(),
          category: 'text',
        })
      } else if (block.type === 'tool_use') {
        const name = block.tool_name || 'Tool'
        const input = (block.tool_input || {}) as Record<string, unknown>
        const cat = CATEGORY_MAP[name] || 'other'

        steps.push({
          id: `s${stepId++}`,
          kind: 'tool',
          ts: msg.ts,
          toolName: name,
          toolDetail: getToolDetail(name, input),
          toolInput: input,
          toolResult: block.tool_result,
          toolError: block.tool_error ?? false,
          oldString: cat === 'edit' ? String(input.old_string || '') : undefined,
          newString: cat === 'edit' ? String(input.new_string || '') : undefined,
          category: cat,
        })
      }
    }
  }

  return { steps, questions }
}

/** 向后兼容：只返回 steps */
export function parseTimeline(messages: TranscriptMessage[]): TimelineStep[] {
  return parseTimelineWithQuestions(messages).steps
}

// ── 风险检测 ──────────────────────────────────────────────────────────────
export interface RiskItem {
  stepId: string
  level: 'high' | 'medium'
  label: string
  detail: string
}

const RISK_PATTERNS: Array<{ level: RiskItem['level']; label: string; re: RegExp }> = [
  { level: 'high',   label: 'rm -rf',           re: /\brm\s+.*-[rf]*r[rf]*\b/ },
  { level: 'high',   label: '强制推送',          re: /git\s+push\s.*(-f\b|--force)/ },
  { level: 'high',   label: 'git reset --hard',  re: /git\s+reset\s+--hard/ },
  { level: 'high',   label: '强制删除分支',      re: /git\s+branch\s+-D\b/ },
  { level: 'high',   label: 'DROP TABLE',        re: /\bDROP\s+TABLE\b/i },
  { level: 'medium', label: 'sudo',              re: /\bsudo\s/ },
  { level: 'medium', label: 'chmod 777',         re: /chmod\s+777\b/ },
  { level: 'medium', label: 'kill -9',           re: /\bkill\s+-9\b/ },
  { level: 'medium', label: 'git stash drop',    re: /git\s+stash\s+(drop|clear)/ },
  { level: 'medium', label: '覆盖 db/log 文件',  re: />\s*\S+\.(db|sqlite|log)\b/ },
]

export function detectRisks(steps: TimelineStep[]): RiskItem[] {
  const risks: RiskItem[] = []
  for (const step of steps) {
    if (step.category === 'bash') {
      const cmd = String(step.toolInput?.command || '')
      for (const rule of RISK_PATTERNS) {
        if (rule.re.test(cmd)) {
          risks.push({ stepId: step.id, level: rule.level, label: rule.label, detail: cmd.slice(0, 100) })
          break
        }
      }
    } else if (step.category === 'write') {
      const fp = String(step.toolInput?.file_path || '')
      if (/\.env(\.\w+)?$/.test(fp)) {
        risks.push({ stepId: step.id, level: 'medium', label: '写入 .env', detail: fp })
      }
    }
  }
  return risks
}

// ── 操作意图推断 ──────────────────────────────────────────────────────────
export type IntentLabel = 'explore' | 'modify' | 'execute' | 'search' | 'delegate' | 'analyze' | 'mixed'

export function inferBlockIntent(blockSteps: TimelineStep[]): IntentLabel {
  const tools = blockSteps.filter(s => s.kind === 'tool')
  if (tools.length === 0) return 'analyze'
  const total = tools.length
  const pct = (cat: string) => tools.filter(s => s.category === cat).length / total
  if (pct('agent') >= 0.3)                                             return 'delegate'
  if (pct('search') >= 0.3)                                            return 'search'
  if (pct('bash') >= 0.5)                                              return 'execute'
  if (pct('edit') + pct('write') >= 0.5)                               return 'modify'
  if (pct('read') + pct('grep') + pct('glob') >= 0.6)                  return 'explore'
  if (pct('read') + pct('grep') + pct('glob') >= 0.25
      && pct('edit') + pct('write') >= 0.2)                            return 'modify'
  return 'mixed'
}

// ── Commit 消息生成 ──────────────────────────────────────────────────────
export function generateCommitMessage(steps: TimelineStep[], questions: UserQuestion[]): string {
  const editedFiles = [...new Set(
    steps.filter(s => s.category === 'edit').map(s => String(s.toolInput?.file_path || '').split('/').pop()).filter(Boolean)
  )]
  const newFiles = [...new Set(
    steps.filter(s => s.category === 'write').map(s => String(s.toolInput?.file_path || '').split('/').pop()).filter(Boolean)
  )]
  const hasBash = steps.some(s => s.category === 'bash')

  // 从第一个问题提取意图关键词
  const firstQ = questions[0]?.text ? cleanSystemXml(questions[0].text).slice(0, 60).trim() : ''

  const parts: string[] = []

  // 确定前缀
  let prefix = 'fix'
  if (newFiles.length > 0 && editedFiles.length === 0) prefix = 'feat'
  else if (newFiles.length > 0) prefix = 'feat'
  else if (hasBash && editedFiles.length === 0) prefix = 'chore'

  // 构建描述
  const allChanged = [...newFiles, ...editedFiles]
  if (allChanged.length === 0) {
    parts.push(`${prefix}: ${firstQ || '更新代码'}`)
  } else if (allChanged.length === 1) {
    parts.push(`${prefix}: update ${allChanged[0]}`)
  } else if (allChanged.length <= 3) {
    parts.push(`${prefix}: update ${allChanged.join(', ')}`)
  } else {
    parts.push(`${prefix}: update ${allChanged.slice(0, 2).join(', ')} and ${allChanged.length - 2} more files`)
  }

  // 添加详情
  const details: string[] = []
  if (editedFiles.length > 0) details.push(`- 修改: ${editedFiles.slice(0, 5).join(', ')}`)
  if (newFiles.length > 0) details.push(`- 新建: ${newFiles.slice(0, 5).join(', ')}`)
  if (firstQ) details.push(`\n背景: ${firstQ}`)

  if (details.length > 0) parts.push('', ...details)

  return parts.join('\n')
}

/** 从文件路径猜语言 */
export function guessLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', rs: 'Rust', go: 'Go', css: 'CSS', scss: 'SCSS',
    html: 'HTML', json: 'JSON', yaml: 'YAML', yml: 'YAML', md: 'Markdown',
    sh: 'Shell', bash: 'Shell', sql: 'SQL', toml: 'TOML',
  }
  return map[ext] || ''
}

/** 从文件路径获取语言颜色 */
export function langColor(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#f7df1e',
    py: '#3572a5', rs: '#dea584', go: '#00add8', css: '#563d7c', scss: '#bf4080',
    html: '#e34c26', json: '#40b5a4', yaml: '#cb171e', yml: '#cb171e',
    md: '#083fa1', sh: '#89e051', bash: '#89e051', sql: '#e38c00',
  }
  return map[ext] || '#8b949e'
}

/** 从文件路径获取 hljs 语言标识（小写） */
export function guessHljsLang(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', css: 'css', scss: 'scss',
    html: 'xml', json: 'json', yaml: 'yaml', yml: 'yaml',
    sh: 'bash', bash: 'bash', sql: 'sql', md: 'markdown',
    c: 'c', cpp: 'cpp', java: 'java', kt: 'kotlin',
  }
  return map[ext] || undefined
}

/** 从 Bash 命令/输出猜测输出语言 */
export function guessBashOutputLang(cmd: string, output: string): string | undefined {
  if (/^\s*[\[{]/.test(output) && /[\]}]\s*$/.test(output)) return 'json'
  if (/\.(ts|tsx)\(\d+,\d+\):\s*error/.test(output)) return 'typescript'
  if (/Traceback \(most recent call last\)/.test(output)) return 'python'
  if (/\bpython|pip|pytest\b/.test(cmd)) return 'python'
  if (/\bcargo|rustc\b/.test(cmd)) return 'rust'
  return undefined
}

/** 格式化时间戳为 HH:MM:SS */
export function formatTs(ts: string | null): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch { return '' }
}

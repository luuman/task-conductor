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

/** 清理用户消息中 Claude Code 自动注入的系统 XML 标签，返回纯用户文本 */
export function cleanSystemXml(text: string): string {
  // 提取 command-name 内容保留为可读文本（如 /init → 显示为 /init）
  const cmdName = text.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1]?.trim() || ''

  const cleaned = text
    // 完整 XML 块（含内容）
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    // 清理 "Read the output file..." 提示
    .replace(/Read the output file to retrieve the result:\s*\S+/g, '')
    // 残余未匹配的 XML 标签
    .replace(/<[^>]+>/g, '')
    .trim()

  // 如果清理后为空但有命令名，用命令名代替
  return cleaned || cmdName
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

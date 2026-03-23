/**
 * Chat Report Demo Data — 基于真实会话结构的模拟数据
 * 每个 turn 代表一轮用户提问 + Claude 回答
 */

export interface SourceFile {
  name: string
  path: string
  lang: string
  langColor: string
  lines: number
}

export interface FileChange {
  name: string
  path: string
  lang: string
  langColor: string
  additions: number
  deletions: number
  isNew?: boolean
}

export interface Command {
  cmd: string
  shortCmd: string
  status: 'pass' | 'fail'
  badge: string
  output?: string
}

export interface AgentCall {
  description: string
  summary: string
}

export interface ReportTurn {
  id: string
  question: string
  timestamp: string
  sessionId: string
  cwd: string
  model: string

  /** Claude 的文字回复（Markdown） */
  resultText: string

  /** 代码块（从回复中提取） */
  codeBlocks: Array<{
    lang: string
    filename?: string
    code: string
  }>

  /** 读取的文件 */
  sources: SourceFile[]

  /** 修改的文件 */
  changes: FileChange[]

  /** 执行的命令 */
  commands: Command[]

  /** 子代理 */
  agents: AgentCall[]

  /** 推荐任务 */
  suggestedTasks: string[]

  /** 推荐问题 */
  suggestedQuestions: string[]
}

// ── 模拟数据：基于真实会话 c72aae2c ──

export const DEMO_TURNS: ReportTurn[] = [
  {
    id: 'turn-001',
    question: '帮我分析 ChatRenderer.tsx 的消息渲染逻辑，修复 Bash 输出高亮问题',
    timestamp: '2026-03-22T14:19:07Z',
    sessionId: 'c72aae2c-e37b-43ca-b78e-1e0caf17e155',
    cwd: '/home/sichengli/Documents/code2/task-conductor',
    model: 'claude-opus-4-6',

    resultText: `Alright, here's the analysis and fix for the Bash output highlighting:

**Root Cause:**
- \`guessOutputLang()\` only detected TypeScript compiler errors
- No detection for JSON output, Python tracebacks, or test results
- Fallback was plain text with no coloring at all

**Fix Applied:**
1. Extended \`guessOutputLang()\` to cover JSON, Python, Rust, Go output formats
2. Added \`highlightLog()\` terminal-style coloring as fallback — highlights errors (red), warnings (yellow), success (green), file paths, and numbers
3. Bash command header now gets syntax highlighting via \`useHighlight('bash')\`

All 12 tests pass. The fix covers the most common output formats while the terminal-style fallback ensures nothing is displayed as raw unstyled text.`,

    codeBlocks: [
      {
        lang: 'typescript',
        filename: 'ChatRenderer.tsx',
        code: `function guessOutputLang(text: string, cmd: string): string | null {
  // JSON detection
  if (/^\\s*[\\[{]/.test(text) && /[\\]}]\\s*$/.test(text)) return 'json'
  // TypeScript compiler errors
  if (/\\.(ts|tsx)\\(\\d+,\\d+\\):\\s*error/.test(text)) return 'typescript'
  // Python traceback
  if (/Traceback \\(most recent call last\\)/.test(text)) return 'python'
  // Command-based detection
  if (/\\bpython|pip|pytest\\b/.test(cmd)) return 'python'
  if (/\\bcargo|rustc\\b/.test(cmd)) return 'rust'
  if (/\\bgo (build|test|run)\\b/.test(cmd)) return 'go'
  return null
}`,
      },
      {
        lang: 'typescript',
        filename: 'highlight.ts',
        code: `function highlightLog(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/((?:\\/[\\w.@-]+)+)/g, '<span class="hljs-string">$1</span>')
    .replace(/\\b(error|Error|ERROR|fail|FAIL)\\b/g,
             '<span class="hljs-deletion">$1</span>')
    .replace(/\\b(success|PASS|passed|ok|Done)\\b/g,
             '<span class="hljs-addition">$1</span>')
    .replace(/\\b(\\d+(?:\\.\\d+)?(?:ms|s|m|KB|MB|%)?)/g,
             '<span class="hljs-number">$1</span>')
}`,
      },
    ],

    sources: [
      { name: 'ChatRenderer.tsx', path: 'src/components/ChatRenderer/ChatRenderer.tsx', lang: 'typescript', langColor: '#3178c6', lines: 1432 },
      { name: 'sessions.module.css', path: 'src/features/admin/pages/sessions/sessions.module.css', lang: 'css', langColor: '#563d7c', lines: 1630 },
      { name: 'hooks.py', path: 'backend/app/hooks.py', lang: 'python', langColor: '#3572a5', lines: 51 },
      { name: 'types.ts', path: 'src/lib/api/types.ts', lang: 'typescript', langColor: '#3178c6', lines: 621 },
      { name: 'chat-demo-data.ts', path: 'src/features/__dev__/tabs/chat-demo-data.ts', lang: 'typescript', langColor: '#3178c6', lines: 910 },
    ],

    changes: [
      { name: 'ChatRenderer.tsx', path: 'src/components/ChatRenderer/ChatRenderer.tsx', lang: 'typescript', langColor: '#3178c6', additions: 28, deletions: 5 },
      { name: 'highlight.ts', path: 'src/lib/useHighlight.ts', lang: 'typescript', langColor: '#3178c6', additions: 48, deletions: 0, isNew: true },
      { name: 'sessions.module.css', path: 'src/features/admin/pages/sessions/sessions.module.css', lang: 'css', langColor: '#563d7c', additions: 3, deletions: 1 },
    ],

    commands: [
      { cmd: 'npx tsc --noEmit', shortCmd: 'npx tsc --noEmit', status: 'pass', badge: 'PASS' },
      { cmd: 'cd backend && pytest tests/ -v', shortCmd: 'pytest tests/ -v', status: 'pass', badge: '12 passed' },
    ],

    agents: [
      { description: '探索前端组件结构', summary: '找到 8 个 CSS Module 文件，分析了样式架构：CSS Variables (--tc- 前缀)，深色主题为主' },
    ],

    suggestedTasks: [
      '添加 Rust 输出高亮支持',
      '优化 guessOutputLang 性能',
      '补充 highlightLog 单元测试',
      'Plan monitoring system',
    ],

    suggestedQuestions: [
      'highlightLog 的回退逻辑是否完备？',
      '有没有遗漏的输出格式？',
      '对大文件输出性能影响如何？',
      '需要写更多测试用例吗？',
    ],
  },

  {
    id: 'turn-002',
    question: '整理会话消息中的消息体各种类型样式，需要足够详细的使用 demo 展示',
    timestamp: '2026-03-22T14:45:00Z',
    sessionId: 'c72aae2c-e37b-43ca-b78e-1e0caf17e155',
    cwd: '/home/sichengli/Documents/code2/task-conductor',
    model: 'claude-opus-4-6',

    resultText: `Here's the complete inventory of all message types in the chat rendering pipeline:

**User Messages:**
- \`UserCard\` — right-aligned bubble with Markdown support

**Assistant Text:**
- \`RichTextBlock\` — full Markdown rendering (headings, lists, tables, links, blockquotes)
- \`CollapsibleCode\` — syntax-highlighted code blocks, foldable when > 8 lines
- \`MermaidBlock\` — flowchart / sequence / gantt / state diagrams via mermaid.js
- \`TaskNotificationCard\` — 4 states: completed / running / failed / killed
- \`SystemReminderCard\` — collapsible system context

**Tool Calls (by category):**
- Read-only: \`ReadPillRow\` (Read / Grep / Glob pills with expandable content)
- Write: \`EditInlineCard\` (LCS diff view) / Write badge
- Bash: \`BashStatusLine\` (command + highlighted output + PASS/FAIL)
- Agent: \`AgentResultView\` (purple theme + Markdown result)
- AskUser: \`AskUserQuestionView\` (option buttons + waiting state)
- Other: \`ToolWidget\` → \`OutputBlock\` (generic fallback)

Created a comprehensive HTML demo at \`tauri/public/session-message-types-demo.html\` covering all 13+ types with full metadata panels.`,

    codeBlocks: [
      {
        lang: 'typescript',
        filename: 'chat-demo-data.ts',
        code: `export const DEMO_SECTIONS = [
  { label: '用户文本', index: 0 },
  { label: 'Markdown 全要素', index: 1 },
  { label: '代码块', index: 3 },
  { label: 'Task Notification', index: 5 },
  { label: 'System Reminder', index: 7 },
  { label: 'Read+Grep+Glob', index: 9 },
  { label: 'Edit diff', index: 15 },
  { label: 'Bash TS 错误', index: 21 },
  { label: 'Agent 子代理', index: 35 },
  { label: 'AskUser', index: 37 },
  { label: 'Mermaid 图表', index: 55 },
]`,
      },
    ],

    sources: [
      { name: 'ChatRenderer.tsx', path: 'src/components/ChatRenderer/ChatRenderer.tsx', lang: 'typescript', langColor: '#3178c6', lines: 1432 },
      { name: 'chat-demo-data.ts', path: 'src/features/__dev__/tabs/chat-demo-data.ts', lang: 'typescript', langColor: '#3178c6', lines: 910 },
      { name: 'TranscriptViewer.tsx', path: 'src/components/SessionChat/TranscriptViewer.tsx', lang: 'typescript', langColor: '#3178c6', lines: 183 },
      { name: 'sessions.py', path: 'backend/app/routers/sessions.py', lang: 'python', langColor: '#3572a5', lines: 445 },
      { name: 'hooks.py', path: 'backend/app/hooks.py', lang: 'python', langColor: '#3572a5', lines: 51 },
      { name: 'types.ts', path: 'src/lib/api/types.ts', lang: 'typescript', langColor: '#3178c6', lines: 621 },
    ],

    changes: [
      { name: 'chat-demo-data.ts', path: 'src/features/__dev__/tabs/chat-demo-data.ts', lang: 'typescript', langColor: '#3178c6', additions: 910, deletions: 0, isNew: true },
      { name: 'ChatDemo.tsx', path: 'src/features/__dev__/tabs/ChatDemo.tsx', lang: 'typescript', langColor: '#3178c6', additions: 85, deletions: 0, isNew: true },
      { name: 'session-message-types-demo.html', path: 'tauri/public/session-message-types-demo.html', lang: 'html', langColor: '#e34c26', additions: 1200, deletions: 0, isNew: true },
    ],

    commands: [
      { cmd: 'npx tsc --noEmit 2>&1 | head -20', shortCmd: 'npx tsc --noEmit', status: 'pass', badge: 'PASS' },
    ],

    agents: [],

    suggestedTasks: [
      '逐个优化每种消息类型的渲染样式',
      '添加 Read pill 展开动画',
      '优化 BashStatusLine 输出高亮',
      '实现 Mermaid 图表缩放交互',
    ],

    suggestedQuestions: [
      '哪种消息类型最需要优先改进？',
      '是否需要支持更多 Mermaid 图表类型？',
      'Edit diff 视图需要支持 side-by-side 吗？',
      'Agent 结果是否需要折叠/展开？',
    ],
  },

  {
    id: 'turn-003',
    question: '跑一遍类型检查和测试看看有没有问题',
    timestamp: '2026-03-22T15:10:00Z',
    sessionId: 'c72aae2c-e37b-43ca-b78e-1e0caf17e155',
    cwd: '/home/sichengli/Documents/code2/task-conductor',
    model: 'claude-opus-4-6',

    resultText: `TypeScript type check passed with no errors. All backend tests are green — 12/12 passed in 3.45 seconds.

Everything looks clean. No regressions from the changes.`,

    codeBlocks: [],

    sources: [],

    changes: [],

    commands: [
      { cmd: 'cd tauri && npx tsc --noEmit', shortCmd: 'npx tsc --noEmit', status: 'pass', badge: 'PASS' },
      { cmd: 'cd backend && pytest tests/ -v', shortCmd: 'pytest tests/ -v', status: 'pass', badge: '12 passed' },
      { cmd: 'cd frontend && npx tsc --noEmit', shortCmd: 'npx tsc --noEmit (frontend)', status: 'pass', badge: 'PASS' },
    ],

    agents: [],

    suggestedTasks: [
      '提交代码到 git',
      '创建 PR',
    ],

    suggestedQuestions: [
      '需要跑 lint 检查吗？',
      '要不要跑 e2e 测试？',
    ],
  },
]

/** 左侧会话列表 demo 数据 */
export const DEMO_SESSIONS = [
  { id: 'c72aae2c', label: '修复 Bash 输出高亮问题', project: 'task-conductor', date: '今天', tools: '✏️ 3 · ⌨ 2', status: '✓' as const },
  { id: 'turn-002', label: '整理会话消息类型样式', project: 'task-conductor', date: '今天', tools: '✏️ 3 · 📖 6', status: '✓' as const },
  { id: 'turn-003', label: '跑类型检查和测试', project: 'task-conductor', date: '今天', tools: '⌨ 3', status: '✓' as const },
  { id: '5232f0b2', label: '添加 Mermaid 图表支持', project: 'task-conductor', date: '昨天', tools: '✏️ 2 · ⌨ 1', status: '✓' as const },
  { id: '0ac4c3b9', label: '重构 ThemeProvider', project: 'task-conductor', date: '昨天', tools: '✏️ 4', status: '✓' as const },
  { id: 'd1759d02', label: 'Session 双栏布局实现', project: 'task-conductor', date: '3月20日', tools: '✏️ 8 · ⌨ 5', status: '✓' as const },
]

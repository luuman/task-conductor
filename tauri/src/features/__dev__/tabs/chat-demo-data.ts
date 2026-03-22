/**
 * Chat Demo Data — 覆盖全部消息体类型
 * 每个类型前用 user 消息隔断，确保 turn 分组后每种类型独立可见
 */
import type { TranscriptMessage } from '../../../lib/api/types'

// helper: 生成分隔用的 user 消息
const sep = (label: string, ts: string): TranscriptMessage => ({
  role: 'user', ts,
  blocks: [{ type: 'text', text: label }],
})

export const DEMO_MESSAGES: TranscriptMessage[] = [

  // ═══════════════════════════════════════════════
  // 1. 用户文本消息（UserCard）
  // ═══════════════════════════════════════════════
  {
    role: 'user',
    ts: '2026-03-22T10:00:00Z',
    blocks: [{
      type: 'text',
      text: '帮我分析 `ChatRenderer.tsx` 的消息渲染逻辑，修复 Bash 输出高亮问题。',
    }],
  },

  // ═══════════════════════════════════════════════
  // 2. 助手纯文本 / Markdown（RichTextBlock）
  // ═══════════════════════════════════════════════
  {
    role: 'assistant',
    ts: '2026-03-22T10:00:05Z',
    blocks: [{
      type: 'text',
      text: `## Markdown 全要素展示

### 标题层级

正文段落，包含**加粗**、*斜体*和 \`inline code\` 行内代码。

> 引用块：这是一段重要的设计说明，
> 可以跨多行。

#### 列表

**有序列表：**
1. 第一步：读取文件
2. 第二步：解析内容
3. 第三步：渲染输出

**无序列表：**
- 用户消息 → \`UserCard\`
- 助手文本 → \`RichTextBlock\`
- 工具调用 → 按类型分发

#### 表格

| 组件 | 行数 | 复杂度 | 状态 |
|------|------|--------|------|
| ChatRenderer | 1233 | 高 | ✅ |
| TranscriptViewer | 450 | 中 | ✅ |
| SessionList | 380 | 中 | ⚠️ |

#### 链接

参考 [React Markdown 文档](https://example.com) 和 [highlight.js](https://highlightjs.org)。

---

以上为 Markdown 全要素展示。`,
    }],
  },

  // ═══════════════════════════════════════════════
  // 3-5. 代码块（TS / Python / 无语言 / 行内）
  // ═══════════════════════════════════════════════
  sep('展示代码块渲染', '2026-03-22T10:00:07Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:08Z',
    blocks: [{
      type: 'text',
      text: `\`guessLang()\` 函数：

\`\`\`typescript
function guessLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    py: 'python', rs: 'rust', go: 'go',
    json: 'json', css: 'css', html: 'xml',
  }
  return map[ext] || ''
}
\`\`\`

Python 示例：

\`\`\`python
def compute_diff(old: str, new: str) -> list[DiffLine]:
    """LCS-based diff algorithm."""
    old_lines = old.splitlines()
    new_lines = new.splitlines()
    dp = [[0] * (len(new_lines) + 1) for _ in range(len(old_lines) + 1)]
    for i in range(1, len(old_lines) + 1):
        for j in range(1, len(new_lines) + 1):
            if old_lines[i-1] == new_lines[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
    return backtrack(dp, old_lines, new_lines)
\`\`\`

无语言标注：

\`\`\`
some raw output
  with indentation
    and nested content
      line 4
\`\`\``,
    }],
  },

  // ═══════════════════════════════════════════════
  // 6. Task Notification（4 种状态）
  // ═══════════════════════════════════════════════
  sep('展示 Task Notification', '2026-03-22T10:00:11Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:12Z',
    blocks: [{
      type: 'text',
      text: `<task-notification>
<task-id>task-001</task-id>
<tool-use-id>tu-abc123</tool-use-id>
<output-file>/tmp/output-001.json</output-file>
<status>completed</status>
<summary>代码审查完成，3 个问题已自动修复</summary>
</task-notification>

<task-notification>
<task-id>task-002</task-id>
<tool-use-id>tu-def456</tool-use-id>
<output-file>/tmp/output-002.json</output-file>
<status>running</status>
<summary>正在执行单元测试 (47/120)</summary>
</task-notification>

<task-notification>
<task-id>task-003</task-id>
<tool-use-id>tu-ghi789</tool-use-id>
<output-file>/tmp/output-003.log</output-file>
<status>failed</status>
<summary>部署脚本失败：SSH 连接超时</summary>
</task-notification>

<task-notification>
<task-id>task-004</task-id>
<tool-use-id>tu-jkl012</tool-use-id>
<output-file></output-file>
<status>killed</status>
<summary>用户手动终止数据迁移任务</summary>
</task-notification>`,
    }],
  },

  // ═══════════════════════════════════════════════
  // 7. System Reminder（可折叠）
  // ═══════════════════════════════════════════════
  sep('展示 System Reminder', '2026-03-22T10:00:14Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:15Z',
    blocks: [{
      type: 'text',
      text: `处理中…

<system-reminder>
## 可用工具

当前可用工具列表：
- **Read**: 读取文件
- **Edit**: 精确替换编辑
- **Bash**: 执行 shell 命令
- **Grep**: 搜索文件内容

注意：修改 \`node_modules\` 不会生效。
</system-reminder>

继续执行。`,
    }],
  },

  // ═══════════════════════════════════════════════
  // 8. Read + Grep + Glob（ReadPillRow，多 pill 同行）
  // ═══════════════════════════════════════════════
  sep('展示 Read / Grep / Glob pill 行', '2026-03-22T10:00:18Z'),

  // 连续多个只读工具 → 同一个 turn → ReadPillRow 聚合
  {
    role: 'assistant',
    ts: '2026-03-22T10:00:20Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Read',
      tool_use_id: 'read-001',
      tool_input: { file_path: '/home/user/project/src/components/ChatRenderer.tsx' },
      tool_result: `     1→import { memo, useCallback } from 'react'
     2→import ReactMarkdown from 'react-markdown'
     3→import remarkGfm from 'remark-gfm'
     4→
     5→export function ChatRenderer({ messages }) {
     6→  return (
     7→    <div className="chat">
     8→      {messages.map((msg, i) => (
     9→        <MessageCard key={i} msg={msg} />
    10→      ))}
    11→    </div>
    12→  )
    13→}`,
      tool_error: false,
    }],
  },
  {
    role: 'assistant',
    ts: '2026-03-22T10:00:21Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Read',
      tool_use_id: 'read-002',
      tool_input: { file_path: '/home/user/project/src/styles/sessions.module.css' },
      tool_result: `.bashCard {
  margin: 5px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}`,
      tool_error: false,
    }],
  },
  {
    role: 'assistant',
    ts: '2026-03-22T10:00:22Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Grep',
      tool_use_id: 'grep-001',
      tool_input: { pattern: 'BashStatusLine', path: 'src/components' },
      tool_result: `src/components/ChatRenderer/ChatRenderer.tsx:1099
src/components/ChatRenderer/index.ts:5
src/features/admin/pages/AdminSessions.tsx:23`,
      tool_error: false,
    }],
  },
  {
    role: 'assistant',
    ts: '2026-03-22T10:00:23Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Glob',
      tool_use_id: 'glob-001',
      tool_input: { pattern: 'src/**/*.module.css' },
      tool_result: `src/features/admin/pages/sessions/sessions.module.css
src/components/SessionChat/session-chat.module.css
src/layouts/Sidebar/sidebar.module.css
src/layouts/TopBar/top-bar.module.css
src/layouts/Panel/panel.module.css`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 8d. Read ERROR 状态（pill 行内）
  // ═══════════════════════════════════════════════
  {
    role: 'assistant',
    ts: '2026-03-22T10:00:24Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Read',
      tool_use_id: 'read-err-001',
      tool_input: { file_path: '/nonexistent/path/file.ts' },
      tool_result: 'Error: ENOENT: no such file or directory, open \'/nonexistent/path/file.ts\'',
      tool_error: true,
    }],
  },

  // ═══════════════════════════════════════════════
  // 9a. Edit（有 diff）
  // ═══════════════════════════════════════════════
  sep('展示 Edit diff 视图', '2026-03-22T10:00:28Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:30Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Edit',
      tool_use_id: 'edit-001',
      tool_input: {
        file_path: '/home/user/project/src/components/BashOutput.tsx',
        old_string: `function BashOutput({ command, result }) {
  return (
    <div className={styles.bashWrap}>
      <pre>{result}</pre>
    </div>
  )
}`,
        new_string: `function BashOutput({ command, result, isError }: BashOutputProps) {
  const highlighted = useMemo(() => {
    const lang = guessOutputLang(result, command)
    if (lang) return hljs.highlight(result, { language: lang }).value
    return highlightLog(result)
  }, [result, command])

  return (
    <div className={styles.bashWrap}
         style={isError ? { borderColor: 'rgba(244,63,94,0.3)' } : undefined}>
      <div className={styles.bashHeader}>
        <span className={styles.bashPrompt}>$</span>
        <code className={styles.bashCmd}>{command}</code>
      </div>
      <pre className={\`hljs \${styles.bashOutput}\`}
           dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  )
}`,
      },
      tool_result: 'File updated successfully.',
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 9b. MultiEdit（多处编辑）
  // ═══════════════════════════════════════════════
  sep('展示 MultiEdit', '2026-03-22T10:00:32Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:33Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'MultiEdit',
      tool_use_id: 'multiedit-001',
      tool_input: {
        file_path: '/home/user/project/src/utils/helpers.ts',
        old_string: `export function formatTime(ms: number) {
  return ms + 'ms'
}`,
        new_string: `export function formatTime(ms: number): string {
  if (ms < 1000) return \`\${ms}ms\`
  if (ms < 60000) return \`\${(ms / 1000).toFixed(1)}s\`
  return \`\${Math.floor(ms / 60000)}m \${Math.floor((ms % 60000) / 1000)}s\`
}`,
      },
      tool_result: 'File updated successfully.',
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 9c. Write（无 diff，仅文件名 badge）
  // ═══════════════════════════════════════════════
  sep('展示 Write (仅 badge)', '2026-03-22T10:00:35Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:36Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Write',
      tool_use_id: 'write-001',
      tool_input: {
        file_path: '/home/user/project/src/utils/highlight.ts',
      },
      tool_result: 'File written successfully.',
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10a. Bash — TypeScript 编译错误
  // ═══════════════════════════════════════════════
  sep('展示 Bash TS 编译错误', '2026-03-22T10:00:38Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:40Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-001',
      tool_input: { command: 'cd /home/user/project && npx tsc --noEmit' },
      tool_result: `src/components/ChatRenderer.tsx(45,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/components/ChatRenderer.tsx(89,3): error TS2345: Argument of type 'null' is not assignable.
src/utils/highlight.ts(12,5): error TS7006: Parameter 'text' implicitly has an 'any' type.

Found 3 errors in 2 files.`,
      tool_error: true,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10b. Bash — 静默成功（无输出）
  // ═══════════════════════════════════════════════
  sep('展示 Bash 静默成功', '2026-03-22T10:00:42Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:43Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-002',
      tool_input: { command: 'mkdir -p src/utils && touch src/utils/index.ts' },
      tool_result: '',
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10c. Bash — JSON 输出
  // ═══════════════════════════════════════════════
  sep('展示 Bash JSON 输出', '2026-03-22T10:00:44Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:45Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-003',
      tool_input: { command: 'cat package.json | head -10' },
      tool_result: `{
  "name": "task-conductor",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10d. Bash — Python traceback
  // ═══════════════════════════════════════════════
  sep('展示 Bash Python traceback', '2026-03-22T10:00:47Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:48Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-004',
      tool_input: { command: 'python -c "import nonexistent"' },
      tool_result: `Traceback (most recent call last):
  File "<string>", line 1, in <module>
ModuleNotFoundError: No module named 'nonexistent'`,
      tool_error: true,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10e. Bash — 测试通过
  // ═══════════════════════════════════════════════
  sep('展示 Bash 测试通过', '2026-03-22T10:00:49Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:50Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-005',
      tool_input: { command: 'cd backend && pytest tests/ -v' },
      tool_result: `============================= test session starts ==============================
collected 12 items

tests/test_pool.py::test_run_success PASSED                              [  8%]
tests/test_pool.py::test_run_timeout PASSED                              [ 16%]
tests/test_pool.py::test_kill_process PASSED                             [ 25%]
tests/test_hooks.py::test_parse_event PASSED                             [ 33%]
tests/test_hooks.py::test_serialize PASSED                               [ 41%]
tests/test_pipeline.py::test_analysis_stage PASSED                       [ 50%]
tests/test_pipeline.py::test_prd_stage PASSED                            [ 58%]
tests/test_pipeline.py::test_plan_stage PASSED                           [ 66%]
tests/test_pipeline.py::test_critic_loop PASSED                          [ 75%]
tests/test_api.py::test_create_project PASSED                            [ 83%]
tests/test_api.py::test_create_task PASSED                               [ 91%]
tests/test_api.py::test_approve_task PASSED                              [100%]

============================== 12 passed in 3.45s ==============================`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10f. Bash — git log（终端风格着色）
  // ═══════════════════════════════════════════════
  sep('展示 Bash git log', '2026-03-22T10:00:51Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:52Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-006',
      tool_input: { command: 'git log --oneline -5' },
      tool_result: `0f00996 auto: update tauri/src/components/SessionChat/QuestionNav.tsx
1f5caac auto: update tauri/src/components/SessionChat/QuestionNav.tsx
c9b07ad auto: update tauri/src/components/SessionChat/TranscriptViewer.tsx
aa500a1 auto: update tauri/src/components/SessionChat/TranscriptViewer.tsx
110cb62 auto: update tauri/src/components/SessionChat/TranscriptViewer.tsx`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 10g. Bash — 长命令 + 混合输出
  // ═══════════════════════════════════════════════
  sep('展示 Bash 长命令 + 混合输出', '2026-03-22T10:00:53Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:00:54Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-007',
      tool_input: { command: 'cd /home/user/project && npm run build 2>&1 | tail -20' },
      tool_result: `vite v7.0.0 building for production...
transforming (142) src/features/admin/pages/AdminSessions.tsx
✓ 248 modules transformed.
dist/index.html                    0.42 kB │ gzip:  0.27 kB
dist/assets/index-CdFn3.css      18.73 kB │ gzip:  4.21 kB
dist/assets/vendor-BxQ2k.js     156.82 kB │ gzip: 51.03 kB
dist/assets/index-D4mKz.js       89.45 kB │ gzip: 28.67 kB
✓ built in 3.24s

warning: Some chunks are larger than 500 kB after minification.
Done in 4.12s.`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 11. Agent 工具
  // ═══════════════════════════════════════════════
  sep('展示 Agent 子代理', '2026-03-22T10:00:58Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:00Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Agent',
      tool_use_id: 'agent-001',
      tool_input: {
        description: '探索前端组件结构',
        prompt: '搜索所有 CSS Module 文件并分析样式架构',
      },
      tool_result: `## 探索结果

找到 **8 个 CSS Module 文件**：

1. \`sessions.module.css\` — 会话页主样式（1630 行）
2. \`session-chat.module.css\` — 聊天布局
3. \`sidebar.module.css\` — 侧边栏
4. \`top-bar.module.css\` — 顶栏

### 样式架构

- CSS Variables（\`--tc-\` 前缀）
- 字体：Geist Mono + 系统字体
- 深色主题为主（VS Code Dark+）`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 12a. AskUserQuestion（有回答）
  // ═══════════════════════════════════════════════
  sep('展示 AskUserQuestion 有回答', '2026-03-22T10:01:03Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:05Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'AskUserQuestion',
      tool_use_id: 'ask-001',
      tool_input: {
        question: 'Diff 视图使用 side-by-side（左右对比）还是 unified（上下合并）布局？\n当前使用 unified 样式。',
      },
      tool_result: '用 side-by-side 吧，看起来更清晰',
    }],
  },

  // ═══════════════════════════════════════════════
  // 12b. AskUserQuestion（等待回答）
  // ═══════════════════════════════════════════════
  sep('展示 AskUserQuestion 无回答', '2026-03-22T10:01:07Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:08Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'AskUserQuestion',
      tool_use_id: 'ask-002',
      tool_input: {
        question: '需要为暗色/亮色主题分别定制配色吗？还是只专注暗色？',
      },
      tool_result: null,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13a. WebSearch（通用 ToolWidget）
  // ═══════════════════════════════════════════════
  sep('展示 WebSearch', '2026-03-22T10:01:09Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:10Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'WebSearch',
      tool_use_id: 'ws-001',
      tool_input: { query: 'react-virtuoso custom renderer performance' },
      tool_result: `Found 5 results:

1. react-virtuoso - npm
   The most powerful virtual list component for React...

2. Performance tips — virtuoso.dev
   Use memo() on item components, avoid inline styles...

3. Custom ScrollSeekPlaceholder
   Show placeholders during fast scroll...`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13b. WebFetch（通用 ToolWidget）
  // ═══════════════════════════════════════════════
  sep('展示 WebFetch', '2026-03-22T10:01:12Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:13Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'WebFetch',
      tool_use_id: 'wf-001',
      tool_input: { url: 'https://api.example.com/docs' },
      tool_result: `# API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /sessions | List sessions |
| GET | /sessions/:id | Get session |
| POST | /hooks/claude | Receive hook |`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13c. Skill 工具
  // ═══════════════════════════════════════════════
  sep('展示 Skill 工具', '2026-03-22T10:01:14Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:15Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Skill',
      tool_use_id: 'skill-001',
      tool_input: { skill: 'brainstorming' },
      tool_result: 'Skill brainstorming loaded successfully.',
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13d. TaskCreate 工具
  // ═══════════════════════════════════════════════
  sep('展示 TaskCreate', '2026-03-22T10:01:16Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:17Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'TaskCreate',
      tool_use_id: 'tc-001',
      tool_input: { subject: '修复 Bash 输出高亮', description: '重构 guessOutputLang 逻辑' },
      tool_result: 'Task #1 created successfully: 修复 Bash 输出高亮',
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13e. 未知工具（fallback OutputBlock）
  // ═══════════════════════════════════════════════
  sep('展示未知工具 fallback', '2026-03-22T10:01:18Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:19Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'CustomPlugin',
      tool_use_id: 'custom-001',
      tool_input: { action: 'analyze', target: 'performance' },
      tool_result: `Analysis complete:
- Render time: 12.3ms average
- Re-renders: 3 unnecessary (memoize recommended)
- Bundle impact: +2.1KB gzipped`,
      tool_error: false,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13f. 工具 ERROR 状态（独立展示）
  // ═══════════════════════════════════════════════
  sep('展示工具 ERROR 状态', '2026-03-22T10:01:20Z'),

  {
    role: 'assistant',
    ts: '2026-03-22T10:01:21Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Bash',
      tool_use_id: 'bash-err-001',
      tool_input: { command: 'rm -rf /protected/system/path' },
      tool_result: 'rm: cannot remove \'/protected/system/path\': Permission denied',
      tool_error: true,
    }],
  },

  // ═══════════════════════════════════════════════
  // 13g. Edit ERROR（编辑失败）
  // ═══════════════════════════════════════════════
  {
    role: 'assistant',
    ts: '2026-03-22T10:01:22Z',
    blocks: [{
      type: 'tool_use',
      tool_name: 'Edit',
      tool_use_id: 'edit-err-001',
      tool_input: {
        file_path: '/home/user/project/src/App.tsx',
        old_string: 'function OldComponent() {}',
        new_string: 'function NewComponent() {}',
      },
      tool_result: 'Error: old_string not found in file. The file may have been modified.',
      tool_error: true,
    }],
  },

  // ═══════════════════════════════════════════════
  // 结束
  // ═══════════════════════════════════════════════
  {
    role: 'user',
    ts: '2026-03-22T10:01:25Z',
    blocks: [{
      type: 'text',
      text: '全部类型都能正确渲染了！',
    }],
  },
]

// 导航索引（按实际消息位置）
export const DEMO_SECTIONS = [
  { label: '1. 用户文本', index: 0 },
  { label: '2. Markdown 全要素', index: 1 },
  { label: '3-5. 代码块', index: 3 },
  { label: '6. Task Notification ×4', index: 5 },
  { label: '7. System Reminder', index: 7 },
  { label: '8. Read+Grep+Glob pill', index: 9 },
  { label: '8d. Read ERROR', index: 13 },
  { label: '9a. Edit (diff)', index: 15 },
  { label: '9b. MultiEdit', index: 17 },
  { label: '9c. Write (badge)', index: 19 },
  { label: '10a. Bash TS error', index: 21 },
  { label: '10b. Bash 静默', index: 23 },
  { label: '10c. Bash JSON', index: 25 },
  { label: '10d. Bash Python', index: 27 },
  { label: '10e. Bash 测试通过', index: 29 },
  { label: '10f. Bash git log', index: 31 },
  { label: '10g. Bash build', index: 33 },
  { label: '11. Agent', index: 35 },
  { label: '12a. AskUser 有答', index: 37 },
  { label: '12b. AskUser 无答', index: 39 },
  { label: '13a. WebSearch', index: 41 },
  { label: '13b. WebFetch', index: 43 },
  { label: '13c. Skill', index: 45 },
  { label: '13d. TaskCreate', index: 47 },
  { label: '13e. Unknown tool', index: 49 },
  { label: '13f. Bash ERROR', index: 51 },
  { label: '13g. Edit ERROR', index: 52 },
]

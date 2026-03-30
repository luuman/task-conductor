import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClaudeConfigResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'
import mdStyles from '../../../styles/markdown.module.css'

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  '范围': { bg: '#6366f115', color: '#818cf8' },
  'DB':   { bg: '#0ea5e915', color: '#38bdf8' },
  '前端': { bg: '#10b98115', color: '#34d399' },
  'UI':   { bg: '#ec489915', color: '#f472b6' },
  '行为': { bg: '#f59e0b15', color: '#fbbf24' },
  '语言': { bg: '#8b5cf615', color: '#a78bfa' },
  '限制': { bg: '#ef444415', color: '#f87171' },
}

// 内联 markdown 渲染（去掉外层 <p> 包装）
const INLINE_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className={mdStyles.mdStrong}>{children}</strong>,
  em:     ({ children }: { children?: React.ReactNode }) => <em className={mdStyles.mdEm}>{children}</em>,
  code:   ({ children }: { children?: React.ReactNode }) => <code className={mdStyles.mdInlineCode}>{children}</code>,
  a:      ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={mdStyles.mdLink}>{children}</a>
  ),
}

function RuleChips({ rules, label }: { rules: Array<{ text: string; category: string }>; label: string }) {
  if (!rules.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', marginBottom: 6 }}>{label}</div>
      <div className={styles.ruleChipsWaterfall}>
        {rules.map((rule, i) => {
          const c = CATEGORY_COLORS[rule.category] ?? { bg: '#6b728015', color: '#9ca3af' }
          return (
            <div
              key={i}
              className={styles.ruleChip}
              style={{ '--rule-accent': c.color } as React.CSSProperties}
            >
              <span className={styles.ruleChipCategory} style={{ color: c.color }}>
                {rule.category}
              </span>
              <span className={styles.ruleChipText}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={INLINE_COMPONENTS as never}>
                  {rule.text}
                </ReactMarkdown>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ClaudeMdPanelProps {
  data: ClaudeConfigResponse | undefined
  isLoading: boolean
}

export function ClaudeMdPanel({ data, isLoading }: ClaudeMdPanelProps) {
  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  }
  if (!data) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>无 CLAUDE.md 文件</div>
  }

  const totalRules =
    (data.project_root?.rules.length ?? 0) +
    (data.project_dot?.rules.length ?? 0) +
    (data.global?.rules.length ?? 0)

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tc-foreground-secondary)', marginBottom: 12 }}>
        共 {totalRules} 条规则
      </div>
      {data.project_root && (
        <RuleChips rules={data.project_root.rules} label={`项目根目录 CLAUDE.md（${(data.project_root.size / 1024).toFixed(1)} KB）`} />
      )}
      {data.project_dot && (
        <RuleChips rules={data.project_dot.rules} label={`.claude/CLAUDE.md（${(data.project_dot.size / 1024).toFixed(1)} KB）`} />
      )}
      {data.global && (
        <RuleChips rules={data.global.rules} label={`全局 ~/.claude/CLAUDE.md（${(data.global.size / 1024).toFixed(1)} KB）`} />
      )}
    </div>
  )
}

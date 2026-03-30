import type { ClaudeConfigResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  '范围': { bg: '#6366f115', color: '#818cf8' },
  'DB':   { bg: '#0ea5e915', color: '#38bdf8' },
  '前端': { bg: '#10b98115', color: '#34d399' },
  'UI':   { bg: '#ec489915', color: '#f472b6' },
  '行为': { bg: '#f59e0b15', color: '#fbbf24' },
  '语言': { bg: '#8b5cf615', color: '#a78bfa' },
  '限制': { bg: '#ef444415', color: '#f87171' },
}

function RuleChips({ rules, label }: { rules: Array<{ text: string; category: string }>; label: string }) {
  if (!rules.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {rules.map((rule, i) => {
          const c = CATEGORY_COLORS[rule.category] ?? { bg: '#6b728015', color: '#9ca3af' }
          return (
            <span key={i} className={styles.ruleChip} title={rule.text}>
              <span
                className={styles.ruleChipCategory}
                style={{ background: c.bg, color: c.color }}
              >
                {rule.category}
              </span>
              <span className={styles.ruleChipText}>{rule.text}</span>
            </span>
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

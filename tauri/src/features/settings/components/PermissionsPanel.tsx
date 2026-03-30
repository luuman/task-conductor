import type { PermissionsResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  global:  { bg: '#4a80cc20', color: '#4a80cc' },
  project: { bg: '#3aaa6020', color: '#3aaa60' },
  local:   { bg: '#f59e0b20', color: '#f59e0b' },
}

const SOURCE_LABELS: Record<string, string> = {
  global:  '全局',
  project: '项目',
  local:   '本地',
}

interface PermissionsPanelProps {
  data: PermissionsResponse | undefined
  isLoading: boolean
}

export function PermissionsPanel({ data, isLoading }: PermissionsPanelProps) {
  if (isLoading) return <div className={styles.emptyHint}>加载中...</div>

  const allows = data?.allow ?? []
  const denies = data?.deny ?? []

  if (!allows.length && !denies.length) {
    return <div className={styles.emptyHint}>无权限配置</div>
  }

  const renderList = (rules: typeof allows, borderColor: string, bgColor: string) => (
    <div className={styles.permRuleList}>
      {rules.map((r, i) => {
        const sc = SOURCE_COLORS[r.source] ?? SOURCE_COLORS.local
        return (
          <span
            key={i}
            className={styles.permRuleChip}
            style={{
              border: `1px solid ${borderColor}`,
              background: bgColor,
            }}
          >
            <span>{r.rule}</span>
            <span
              className={styles.permSourceBadge}
              style={{ background: sc.bg, color: sc.color }}
            >
              {SOURCE_LABELS[r.source] ?? r.source}
            </span>
          </span>
        )
      })}
    </div>
  )

  return (
    <div className={styles.permList}>
      {allows.length > 0 && (
        <div className={styles.permGroup}>
          <div className={styles.permGroupLabel} style={{ color: '#10b981' }}>✓ 允许</div>
          {renderList(allows, '#10b98140', '#10b98110')}
        </div>
      )}
      {denies.length > 0 && (
        <div className={styles.permGroup}>
          <div className={styles.permGroupLabel} style={{ color: '#ef4444' }}>✗ 拒绝</div>
          {renderList(denies, '#ef444440', '#ef444410')}
        </div>
      )}
    </div>
  )
}

import type { PermissionsResponse } from '../../../lib/api/types'

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
  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>

  const allows = data?.allow ?? []
  const denies = data?.deny ?? []

  if (!allows.length && !denies.length) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>无权限配置</div>
  }

  const renderList = (rules: typeof allows, color: string) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {rules.map((r, i) => {
        const sc = SOURCE_COLORS[r.source] ?? SOURCE_COLORS.local
        return (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            border: `1px solid ${color}40`, background: `${color}10`,
            fontSize: 11, fontFamily: 'monospace',
          }}>
            <span>{r.rule}</span>
            <span style={{
              fontSize: 9, padding: '1px 4px', borderRadius: 3,
              background: sc.bg, color: sc.color, fontFamily: 'sans-serif',
            }}>
              {SOURCE_LABELS[r.source] ?? r.source}
            </span>
          </span>
        )
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {allows.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, marginBottom: 6 }}>✓ 允许</div>
          {renderList(allows, '#10b981')}
        </div>
      )}
      {denies.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>✗ 拒绝</div>
          {renderList(denies, '#ef4444')}
        </div>
      )}
    </div>
  )
}

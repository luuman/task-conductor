import type { McpServersResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

interface McpPanelProps {
  data: McpServersResponse | undefined
  isLoading: boolean
}

export function McpPanel({ data, isLoading }: McpPanelProps) {
  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  if (!data?.servers.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)', padding: '8px 0' }}>
        未配置 MCP 服务器（项目根目录无 .mcp.json）
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.servers.map((server) => (
        <div key={server.name} style={{
          padding: '10px 12px', borderRadius: 8, border: '1px solid var(--tc-border)',
          background: 'var(--tc-content-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: server.status === 'ok' ? 'var(--tc-success)' : 'var(--tc-error)',
              boxShadow: server.status === 'ok' ? '0 0 4px var(--tc-success)' : undefined,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--tc-foreground)' }}>
              {server.name}
            </span>
          </div>
          {server.tools.length > 0 && (
            <div className={styles.chipRow}>
              {server.tools.map((tool) => (
                <span key={tool} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  background: 'var(--tc-accent-bg)',
                  color: 'var(--tc-accent-on-bg, var(--tc-foreground))',
                  fontFamily: 'monospace',
                }}>
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

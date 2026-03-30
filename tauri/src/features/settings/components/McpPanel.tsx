import type { McpServersResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

interface McpPanelProps {
  data: McpServersResponse | undefined
  isLoading: boolean
}

export function McpPanel({ data, isLoading }: McpPanelProps) {
  if (isLoading) return <div className={styles.emptyHint}>加载中...</div>
  if (!data?.servers.length) {
    return (
      <div className={styles.emptyHint} style={{ padding: '8px 0' }}>
        未配置 MCP 服务器（项目根目录无 .mcp.json）
      </div>
    )
  }

  return (
    <div className={styles.mcpList}>
      {data.servers.map((server) => (
        <div key={server.name} className={styles.mcpServerCard}>
          <div className={styles.mcpServerHeader}>
            <span
              className={
                server.status === 'ok' ? styles.mcpStatusDotOk : styles.mcpStatusDotError
              }
            />
            <span className={styles.mcpServerName}>{server.name}</span>
          </div>
          {server.tools.length > 0 && (
            <div className={styles.chipRow}>
              {server.tools.map((tool) => (
                <span key={tool} className={styles.mcpToolChip}>
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

import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, McpServer } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'var(--tc-success)',
  needs_auth: 'var(--tc-warning)',
  error: 'var(--tc-error)',
  unknown: 'var(--tc-foreground-secondary)',
}

export function SecMcp({ showToast }: SectionProps) {
  const [servers, setServers] = useState<McpServer[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formTransport, setFormTransport] = useState('http')
  const [formScope, setFormScope] = useState('user')
  const [adding, setAdding] = useState(false)

  const fetchServers = useCallback(async () => {
    try {
      const data = await api.claudeConfig.getMcpServers()
      setServers(data)
    } catch {
      showToast('Failed to load MCP servers')
    }
  }, [showToast])

  useEffect(() => { fetchServers() }, [fetchServers])

  const handleDelete = useCallback(async (name: string) => {
    try {
      const result = await api.claudeConfig.deleteMcpServer(name)
      setServers(result.servers)
      showToast(`Deleted ${name}`)
    } catch {
      showToast('Failed to delete server')
    }
  }, [showToast])

  const handleAdd = useCallback(async () => {
    if (!formName.trim()) return
    setAdding(true)
    try {
      const result = await api.claudeConfig.addMcpServer({
        name: formName.trim(),
        url: formUrl.trim() || undefined,
        transport: formTransport,
        scope: formScope,
      })
      setServers(result.servers)
      showToast(`Added ${formName}`)
      setFormName('')
      setFormUrl('')
      setFormTransport('http')
      setFormScope('user')
      setShowForm(false)
    } catch {
      showToast('Failed to add server')
    } finally {
      setAdding(false)
    }
  }, [formName, formUrl, formTransport, formScope, showToast])

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader
        icon="🔌"
        title="MCP 服务器"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.btnGhost} onClick={fetchServers} type="button">
              Refresh
            </button>
            <button
              className={styles.btnPrimary}
              onClick={() => setShowForm((v) => !v)}
              type="button"
            >
              {showForm ? 'Cancel' : 'Add'}
            </button>
          </div>
        }
      />

      {/* Add form */}
      {showForm && (
        <div className={styles.card} style={{ marginBottom: 12 }}>
          <div className={styles.cardBody}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Name *</label>
              <input
                className={styles.formInput}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="server-name"
                style={{ flex: 1 }}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>URL</label>
              <input
                className={styles.formInput}
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="http://localhost:3000"
                style={{ flex: 1 }}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Transport</label>
              <select
                className={styles.formSelect}
                value={formTransport}
                onChange={(e) => setFormTransport(e.target.value)}
              >
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="stdio">Stdio</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Scope</label>
              <select
                className={styles.formSelect}
                value={formScope}
                onChange={(e) => setFormScope(e.target.value)}
              >
                <option value="user">user</option>
                <option value="project">project</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className={styles.btnPrimary}
                onClick={handleAdd}
                disabled={adding || !formName.trim()}
                type="button"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server list */}
      {servers.length === 0 ? (
        <div className={styles.sectionPlaceholder}>No MCP servers configured</div>
      ) : (
        <div className={styles.cardGrid}>
          {servers.map((s) => (
            <div key={s.name} className={styles.card}>
              <div className={styles.cardBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: STATUS_COLORS[s.status] ?? STATUS_COLORS.unknown,
                      flexShrink: 0,
                    }}
                  />
                  <span className={styles.listName}>{s.name}</span>
                  <span className={styles.tagBlue}>{s.transport}</span>
                  <span className={styles.tagGray}>{s.scope}</span>
                </div>
                {(s.url || s.command) && (
                  <div
                    className={styles.listMeta}
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: 8,
                    }}
                  >
                    {s.url ?? s.command}
                  </div>
                )}
                <button
                  className={styles.btnDanger}
                  onClick={() => handleDelete(s.name)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

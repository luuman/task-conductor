import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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

const TRANSPORT_OPTIONS = ['http', 'sse', 'stdio']
const SCOPE_OPTIONS = ['user', 'project']

export function SecMcp({ showToast }: SectionProps) {
  const { t } = useTranslation()
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
      showToast(t('claudeConfig.mcp.loadFailed'))
    }
  }, [showToast, t])

  useEffect(() => { fetchServers() }, [fetchServers])

  const handleDelete = useCallback(async (name: string) => {
    try {
      const result = await api.claudeConfig.deleteMcpServer(name)
      setServers(result.servers)
      showToast(t('claudeConfig.mcp.deleted', { name }))
    } catch {
      showToast(t('claudeConfig.mcp.deleteFailed'))
    }
  }, [showToast, t])

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
      showToast(t('claudeConfig.mcp.added', { name: formName }))
      setFormName('')
      setFormUrl('')
      setFormTransport('http')
      setFormScope('user')
      setShowForm(false)
    } catch {
      showToast(t('claudeConfig.mcp.addFailed'))
    } finally {
      setAdding(false)
    }
  }, [formName, formUrl, formTransport, formScope, showToast, t])

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader
        icon="\uD83D\uDD0C"
        title={t('claudeConfig.mcp.title')}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.btnGhost} onClick={fetchServers} type="button">
              {t('claudeConfig.mcp.refresh')}
            </button>
            <button
              className={styles.btnPrimary}
              onClick={() => setShowForm((v) => !v)}
              type="button"
            >
              {showForm ? t('claudeConfig.mcp.cancel') : t('claudeConfig.mcp.add')}
            </button>
          </div>
        }
      />

      {/* Add form */}
      {showForm && (
        <div className={styles.card} style={{ marginBottom: 12 }}>
          <div className={styles.cardBody}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('claudeConfig.mcp.name')} *</label>
              <input
                className={styles.formInput}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="server-name"
                style={{ flex: 1 }}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('claudeConfig.mcp.url')}</label>
              <input
                className={styles.formInput}
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="http://localhost:3000"
                style={{ flex: 1 }}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('claudeConfig.mcp.transport')}</label>
              <div className={styles.btnGroup}>
                {TRANSPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    className={`${styles.btnGroupItem} ${formTransport === opt ? styles.btnGroupItemActive : ''}`}
                    onClick={() => setFormTransport(opt)}
                    type="button"
                  >
                    {opt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t('claudeConfig.mcp.scope')}</label>
              <div className={styles.pillGroup}>
                {SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    className={formScope === opt ? styles.pillActive : styles.pill}
                    onClick={() => setFormScope(opt)}
                    type="button"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className={styles.btnPrimary}
                onClick={handleAdd}
                disabled={adding || !formName.trim()}
                type="button"
              >
                {adding ? t('claudeConfig.mcp.adding') : t('claudeConfig.mcp.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server list */}
      {servers.length === 0 ? (
        <div className={styles.sectionPlaceholder}>{t('claudeConfig.mcp.noServers')}</div>
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
                  {t('claudeConfig.mcp.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SecMcp

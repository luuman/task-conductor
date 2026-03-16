import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { api } from '../../../lib/api'
import type { ClaudeOverview, ClaudeConfig } from '../../../lib/api/types'
import styles from '../admin.module.css'

const HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop',
  'SubagentStart', 'SubagentStop', 'SessionStart', 'SessionEnd',
  'UserPromptSubmit', 'Notification',
]

const SETTING_KEYS: Array<{ key: string; i18n: string; type: 'string' | 'boolean' | 'select'; options?: string[] }> = [
  { key: 'model', i18n: 'model', type: 'select', options: ['', 'opus', 'sonnet', 'haiku'] },
  { key: 'effortLevel', i18n: 'effort', type: 'select', options: ['', 'low', 'medium', 'high'] },
  { key: 'language', i18n: 'language', type: 'string' },
  { key: 'outputStyle', i18n: 'output_style', type: 'string' },
  { key: 'alwaysThinkingEnabled', i18n: 'always_thinking', type: 'boolean' },
  { key: 'includeCoAuthoredBy', i18n: 'co_author', type: 'boolean' },
  { key: 'respectGitignore', i18n: 'gitignore', type: 'boolean' },
]

export default function AdminClaudeConfig() {
  const { t } = useTranslation()
  const [overview, setOverview] = useState<ClaudeOverview | null>(null)
  const [config, setConfig] = useState<ClaudeConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    Promise.all([
      api.getClaudeOverview().catch(() => null),
      api.getClaudeConfig().catch(() => null),
    ]).then(([o, c]) => {
      if (o) setOverview(o)
      if (c) setConfig(c)
      if (!o && !c) setError('Failed to load Claude config')
    })
  }, [])

  const loading = overview === null && config === null && error === null

  const updateKey = useCallback(async (key: string, value: unknown) => {
    try {
      await api.updateClaudeConfigKey(key, value)
      showToast(t('settings.toast.saved'))
      const c = await api.getClaudeConfig().catch(() => null)
      if (c) setConfig(c)
    } catch {
      showToast(t('settings.toast.saveFailed'))
    }
  }, [showToast, t])

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {toast && <div className={styles.toast}>{toast}</div>}

        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.claude_config.title')}</h1>
          <p className={styles.headerHint}>{t('admin.claude_config.hint')}</p>
        </div>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13 }}>{error}</p>}

        {/* KPI 统计 */}
        <div className={styles.kpiGrid}>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.kpiCard}>
                  <Skeleton variant="text" width="60%" height={12} />
                  <Skeleton variant="text" width="40%" height={24} />
                </div>
              ))
            : <>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.version')}</span>
                  <span className={styles.kpiValue} style={{ fontSize: 16 }}>{overview?.cli_version ?? '—'}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.stat_messages')}</span>
                  <span className={styles.kpiValue}>{overview?.total_messages?.toLocaleString() ?? 0}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.stat_tools')}</span>
                  <span className={styles.kpiValue}>{overview?.total_tool_calls?.toLocaleString() ?? 0}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.stat_sessions')}</span>
                  <span className={styles.kpiValue}>{overview?.total_sessions?.toLocaleString() ?? 0}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.stat_days')}</span>
                  <span className={styles.kpiValue}>{overview?.active_days ?? 0}</span>
                </div>
              </>
          }
        </div>

        {/* 卡片网格 */}
        <div className={styles.cardGrid}>

          {/* 基本设置 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.claude_config.basic_settings')}</div>
              <div className={styles.sectionHint}>settings.json</div>
            </div>
            <div className={styles.sectionBody}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={styles.formRow}>
                      <Skeleton variant="text" width="30%" height={12} />
                      <Skeleton variant="rect" width={100} height={28} borderRadius={6} />
                    </div>
                  ))
                : SETTING_KEYS.map(def => {
                    const val = config?.other?.[def.key] ?? config?.raw?.[def.key] ?? ''
                    return (
                      <div key={def.key} className={styles.formRow}>
                        <span className={styles.perfLabel}>{t(`admin.claude_config.setting_${def.i18n}`)}</span>
                        {def.type === 'boolean' ? (
                          <button
                            className={val ? styles.boolOn : styles.boolOff}
                            onClick={() => updateKey(def.key, !val)}
                          >
                            {val ? 'ON' : 'OFF'}
                          </button>
                        ) : def.type === 'select' ? (
                          <select
                            className={styles.selectInput}
                            value={String(val)}
                            onChange={e => updateKey(def.key, e.target.value || undefined)}
                          >
                            {def.options?.map(opt => (
                              <option key={opt} value={opt}>{opt || t('admin.claude_config.default')}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={styles.perfValue}>{String(val) || '—'}</span>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          </div>

          {/* Hook 事件 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.claude_config.hooks')}</div>
              <div className={styles.sectionHint}>{t('admin.claude_config.hooks_hint')}</div>
            </div>
            <div className={styles.sectionBody}>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={styles.formRow}>
                      <Skeleton variant="text" width="40%" height={12} />
                      <Skeleton variant="rect" width={30} height={18} borderRadius={9} />
                    </div>
                  ))
                : HOOK_EVENTS.map(event => {
                    const rules = config?.hooks?.[event] ?? []
                    const count = rules.reduce((sum, r) => sum + r.hooks.length, 0)
                    return (
                      <div key={event} className={styles.formRow}>
                        <span className={styles.hookLabel}>{event}</span>
                        <span className={count > 0 ? styles.hookBadgeActive : styles.hookBadge}>
                          {count}
                        </span>
                      </div>
                    )
                  })
              }
            </div>
          </div>

          {/* MCP 服务器 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.claude_config.mcp_servers')}</div>
              <div className={styles.sectionHint}>
                {overview ? `${overview.mcp_servers.length} ${t('admin.claude_config.configured')}` : ''}
              </div>
            </div>
            <div>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={styles.listItem}>
                      <Skeleton variant="text" width="50%" height={12} />
                      <Skeleton variant="rect" width={50} height={18} borderRadius={9} />
                    </div>
                  ))
                : overview && overview.mcp_servers.length > 0
                  ? overview.mcp_servers.map(s => (
                      <div key={s.name} className={styles.listItem}>
                        <div className={styles.listItemContent}>
                          <span className={styles.mcpName}>{s.name}</span>
                          <span className={styles.sessionMeta}>{s.transport} · {s.scope}</span>
                        </div>
                        <span className={s.status === 'running' ? styles.hookBadgeActive : styles.hookBadge}>
                          {s.status}
                        </span>
                      </div>
                    ))
                  : <div className={styles.listItem}>
                      <span className={styles.emptyHint}>{t('admin.claude_config.no_mcp')}</span>
                    </div>
              }
            </div>
          </div>

          {/* Skills */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.claude_config.skills_title')}</div>
              <div className={styles.sectionHint}>
                {overview ? `${overview.skills.length} ${t('admin.claude_config.discovered')}` : ''}
              </div>
            </div>
            <div>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={styles.listItem}>
                      <Skeleton variant="text" width="60%" height={12} />
                    </div>
                  ))
                : overview && overview.skills.length > 0
                  ? overview.skills.map(s => (
                      <div key={s.name} className={styles.listItem}>
                        <span className={styles.skillIcon}>✦</span>
                        <div className={styles.listItemContent}>
                          <span className={styles.mcpName}>{s.name}</span>
                          <span className={styles.sessionMeta}>{s.path}</span>
                        </div>
                      </div>
                    ))
                  : <div className={styles.listItem}>
                      <span className={styles.emptyHint}>{t('admin.claude_config.no_skills')}</span>
                    </div>
              }
            </div>
          </div>

          {/* 项目 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.claude_config.projects_title')}</div>
              <div className={styles.sectionHint}>
                {overview ? `${overview.projects.length} ${t('admin.claude_config.registered')}` : ''}
              </div>
            </div>
            <div>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={styles.listItem}>
                      <Skeleton variant="text" width="50%" height={12} />
                      <Skeleton variant="text" width={60} height={10} />
                    </div>
                  ))
                : overview && overview.projects.length > 0
                  ? overview.projects.map(p => (
                      <div key={p.dir_name} className={styles.listItem}>
                        <span className={styles.projectAvatar}>
                          {p.dir_name.charAt(0).toUpperCase()}
                        </span>
                        <div className={styles.listItemContent}>
                          <span className={styles.mcpName}>{p.dir_name}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {p.has_claude_md && <span className={styles.projectTag}>CLAUDE.md</span>}
                            {p.has_memory && <span className={styles.projectTag}>Memory</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  : <div className={styles.listItem}>
                      <span className={styles.emptyHint}>{t('admin.claude_config.no_projects')}</span>
                    </div>
              }
            </div>
          </div>

          {/* 插件 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.claude_config.plugins_title')}</div>
              <div className={styles.sectionHint}>
                {overview ? `${overview.installed_plugins.length} ${t('admin.claude_config.installed')}` : ''}
              </div>
            </div>
            <div>
              {loading
                ? Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={styles.listItem}>
                      <Skeleton variant="text" width="60%" height={12} />
                    </div>
                  ))
                : overview && overview.installed_plugins.length > 0
                  ? overview.installed_plugins.map(p => (
                      <div key={p.plugin_id} className={styles.listItem}>
                        <div className={styles.listItemContent}>
                          <span className={styles.mcpName}>{p.name}</span>
                          <span className={styles.sessionMeta}>{p.publisher} · v{p.version}</span>
                        </div>
                        <span className={styles.projectTag}>{p.scope}</span>
                      </div>
                    ))
                  : <div className={styles.listItem}>
                      <span className={styles.emptyHint}>{t('admin.claude_config.no_plugins')}</span>
                    </div>
              }
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import type { ClaudeConfig, ClaudeOverview } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

const ENV_VARS = [
  { key: 'ANTHROPIC_API_KEY', desc: 'API Key', masked: true },
  { key: 'ANTHROPIC_AUTH_TOKEN', desc: 'Auth Token', masked: true },
  { key: 'ANTHROPIC_BASE_URL', desc: 'API Base URL', masked: false },
  { key: 'ANTHROPIC_MODEL', desc: 'Default Model', masked: false },
  { key: 'HTTPS_PROXY', desc: 'HTTPS Proxy', masked: false },
  { key: 'HTTP_PROXY', desc: 'HTTP Proxy', masked: false },
  { key: 'NO_PROXY', desc: 'No Proxy', masked: false },
  { key: 'CLAUDE_CONFIG_DIR', desc: 'Config Dir', masked: false },
  { key: 'CLAUDE_CACHE_DIR', desc: 'Cache Dir', masked: false },
  { key: 'CLAUDE_LOG_LEVEL', desc: 'Log Level', masked: false },
  { key: 'CLAUDE_NO_COLOR', desc: 'No Color', masked: false },
  { key: 'CLAUDE_EDITOR', desc: 'Editor', masked: false },
  { key: 'DEBUG', desc: 'Debug', masked: false },
] as const

interface SecEnvVarsProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecEnvVars(_props: SecEnvVarsProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader
        icon="&#x1F30D;"
        title={t('claudeConfig.env.title')}
        description={t('claudeConfig.env.note')}
      />

      <div className={styles.cardGrid}>
        {ENV_VARS.map((v) => (
          <div key={v.key} className={styles.card}>
            <div className={styles.cardBody}>
              <div
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--tc-foreground)',
                  marginBottom: 4,
                }}
              >
                {v.key}
              </div>
              <div className={styles.formLabel}>{v.desc}</div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: v.masked ? 'var(--tc-foreground-secondary)' : 'var(--tc-foreground)',
                  fontFamily: "'Geist Mono', monospace",
                }}
              >
                {v.masked ? t('claudeConfig.env.masked') : '-'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SecEnvVars

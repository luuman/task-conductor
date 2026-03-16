import type { ClaudeConfig, ClaudeOverview } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

const ENV_VARS = [
  { key: 'ANTHROPIC_API_KEY', desc: 'API 密钥', masked: true },
  { key: 'ANTHROPIC_AUTH_TOKEN', desc: '认证令牌', masked: true },
  { key: 'ANTHROPIC_BASE_URL', desc: 'API 基础地址', masked: false },
  { key: 'ANTHROPIC_MODEL', desc: '默认模型', masked: false },
  { key: 'HTTPS_PROXY', desc: 'HTTPS 代理', masked: false },
  { key: 'HTTP_PROXY', desc: 'HTTP 代理', masked: false },
  { key: 'NO_PROXY', desc: '代理排除', masked: false },
  { key: 'CLAUDE_CONFIG_DIR', desc: '配置目录', masked: false },
  { key: 'CLAUDE_CACHE_DIR', desc: '缓存目录', masked: false },
  { key: 'CLAUDE_LOG_LEVEL', desc: '日志级别', masked: false },
  { key: 'CLAUDE_NO_COLOR', desc: '禁用颜色', masked: false },
  { key: 'CLAUDE_EDITOR', desc: '编辑器', masked: false },
  { key: 'DEBUG', desc: '调试模式', masked: false },
] as const

interface SecEnvVarsProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecEnvVars(_props: SecEnvVarsProps) {
  return (
    <div className={styles.sectionWrap}>
      <SectionHeader
        icon="🌍"
        title="环境变量"
        description="These are client-side environment variables. Values shown here are for reference only."
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
                {v.masked ? '••••••' : '-'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

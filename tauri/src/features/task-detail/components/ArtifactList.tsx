import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StageArtifact } from '../../../lib/api/types'
import styles from './ArtifactList.module.css'

interface ArtifactListProps {
  artifacts: StageArtifact[]
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className={styles.confBar}>
      <div className={styles.confFill} style={{ width: `${pct}%`, background: color }} />
      <span className={styles.confLabel}>{pct}%</span>
    </div>
  )
}

export function ArtifactList({ artifacts }: ArtifactListProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (artifacts.length === 0) {
    return <div className={styles.empty}>{t('task_detail.no_artifacts', '\u6682\u65E0\u9636\u6BB5\u4EA7\u7269')}</div>
  }

  return (
    <div className={styles.list}>
      {artifacts.map((a) => {
        const isOpen = expanded.has(a.id)
        let assumptions: string[] = []
        let criticNotes: string[] = []
        try { if (a.assumptions) assumptions = JSON.parse(a.assumptions) } catch { /* ignore */ }
        try { if (a.critic_notes) criticNotes = JSON.parse(a.critic_notes) } catch { /* ignore */ }

        return (
          <div key={a.id} className={styles.item}>
            <div className={styles.itemHeader} onClick={() => toggle(a.id)}>
              <div className={styles.itemLeft}>
                <span className={styles.stageBadge}>{a.stage}</span>
                <span className={styles.typeBadge}>{a.artifact_type}</span>
                {a.confidence != null && <ConfidenceBar value={a.confidence} />}
                {a.retry_count > 0 && (
                  <span className={styles.retryBadge}>\u00D7{a.retry_count}</span>
                )}
              </div>
              <span className={styles.chevron}>{isOpen ? '\u25BE' : '\u25B8'}</span>
            </div>
            {isOpen && (
              <div className={styles.itemBody}>
                <pre className={styles.content}>{formatContent(a.content)}</pre>
                {assumptions.length > 0 && (
                  <div className={styles.meta}>
                    <strong>{t('task_detail.assumptions', '\u5047\u8BBE')}:</strong>
                    <ul>{assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {criticNotes.length > 0 && (
                  <div className={styles.meta}>
                    <strong>{t('task_detail.critic_notes', 'Critic \u8BC4\u5BA1')}:</strong>
                    <ul>{criticNotes.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {a.error_log && (
                  <div className={styles.errorLog}>
                    <strong>{t('task_detail.error_log', '\u9519\u8BEF\u65E5\u5FD7')}:</strong>
                    <pre>{a.error_log}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatContent(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

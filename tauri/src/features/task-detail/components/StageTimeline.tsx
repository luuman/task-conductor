import { useTranslation } from 'react-i18next'
import styles from './StageTimeline.module.css'

const STAGES = ['input', 'analysis', 'prd', 'ui', 'plan', 'dev', 'test', 'deploy', 'monitor', 'done']
const APPROVAL_STAGES = new Set(['analysis', 'prd', 'ui', 'plan', 'test', 'deploy'])

interface StageTimelineProps {
  currentStage: string
  status: string
}

export function StageTimeline({ currentStage, status }: StageTimelineProps) {
  const { t } = useTranslation()
  const currentIdx = STAGES.indexOf(currentStage)

  return (
    <div className={styles.timeline}>
      {STAGES.map((stage, i) => {
        let state: 'done' | 'current' | 'future' = 'future'
        if (i < currentIdx) state = 'done'
        else if (i === currentIdx) state = 'current'

        return (
          <div key={stage} className={`${styles.step} ${styles[state]}`}>
            <div className={styles.dot}>
              {state === 'done' ? '\u2713' : i === currentIdx && status === 'running' ? (
                <span className={styles.pulse} />
              ) : null}
            </div>
            <span className={styles.label}>{t(`stages.${stage}`)}</span>
            {APPROVAL_STAGES.has(stage) && <span className={styles.approval}>{t('stages.approval_tag', '审')}</span>}
            {i < STAGES.length - 1 && <div className={`${styles.line} ${i < currentIdx ? styles.lineDone : ''}`} />}
          </div>
        )
      })}
    </div>
  )
}

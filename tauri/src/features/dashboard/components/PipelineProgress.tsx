import { useTranslation } from 'react-i18next'
import type { Task } from '../../../lib/api/types'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from './PipelineProgress.module.css'

const STAGES = ['input', 'analysis', 'prd', 'ui', 'plan', 'dev', 'test', 'deploy', 'done']

interface Props {
  tasks: Task[]
  loading: boolean
}

export function PipelineProgress({ tasks, loading }: Props) {
  if (loading) {
    return (
      <div className={styles.section}>
        <div className={styles.header}>
          <span className={styles.title}>流水线进度</span>
        </div>
        <div className={styles.body}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rect" width="100%" height={32} borderRadius={6} />
          ))}
        </div>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className={styles.section}>
        <div className={styles.header}>
          <span className={styles.title}>流水线进度</span>
        </div>
        <div className={styles.body}>
          <p className={styles.empty}>暂无任务</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>流水线进度</span>
        <span className={styles.stageLabels}>
          {STAGES.map((s) => (
            <span key={s} className={styles.stageLabel}>{s}</span>
          ))}
        </span>
      </div>
      <div className={styles.body}>
        {tasks.map((task) => {
          const currentIdx = STAGES.indexOf(task.stage)
          return (
            <div key={task.id} className={styles.row}>
              <span className={styles.taskName} title={task.title}>
                {task.title}
              </span>
              <div className={styles.stages}>
                {STAGES.map((stage, idx) => {
                  let state: 'done' | 'current' | 'pending' = 'pending'
                  if (idx < currentIdx) state = 'done'
                  else if (idx === currentIdx) state = task.status === 'completed' || task.status === 'done' ? 'done' : 'current'
                  return (
                    <div key={stage} className={styles.stageCell}>
                      <span className={`${styles.dot} ${styles[state]}`} title={stage} />
                      {idx < STAGES.length - 1 && (
                        <span className={`${styles.line} ${state === 'done' ? styles.lineDone : ''}`} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

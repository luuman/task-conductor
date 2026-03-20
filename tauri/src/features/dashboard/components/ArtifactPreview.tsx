import { useTranslation } from 'react-i18next'
import type { Task } from '../../../lib/api/types'
import styles from './ArtifactPreview.module.css'

interface Props {
  tasks: Task[]
}

export function ArtifactPreview({ tasks }: Props) {
  // Show most recently active tasks with meaningful stages
  const active = tasks
    .filter((t) => t.stage !== 'input' && t.stage !== 'done')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>阶段产物</span>
      </div>
      <div className={styles.body}>
        {active.length === 0 ? (
          <p className={styles.empty}>暂无活跃阶段</p>
        ) : (
          active.map((t) => (
            <div key={t.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.taskName}>{t.title}</span>
                <span className={styles.stage}>{t.stage}</span>
              </div>
              {t.description && (
                <p className={styles.snippet}>
                  {t.description.length > 200 ? t.description.slice(0, 200) + '...' : t.description}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

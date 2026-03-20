import { useTranslation } from 'react-i18next'
import styles from './TaskFilters.module.css'

const STAGES = ['all', 'input', 'analysis', 'prd', 'ui', 'plan', 'dev', 'test', 'deploy', 'monitor', 'done'] as const
const STATUSES = ['all', 'pending', 'running', 'waiting_review', 'approved', 'done', 'failed', 'rejected'] as const

interface TaskFiltersProps {
  stage: string
  status: string
  search: string
  onStageChange: (v: string) => void
  onStatusChange: (v: string) => void
  onSearchChange: (v: string) => void
}

export function TaskFilters({ stage, status, search, onStageChange, onStatusChange, onSearchChange }: TaskFiltersProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.filters}>
      <select className={styles.select} value={stage} onChange={(e) => onStageChange(e.target.value)}>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s === 'all' ? t('task_manager.filter_all_stages', '所有阶段') : t(`stages.${s}`)}
          </option>
        ))}
      </select>
      <select className={styles.select} value={status} onChange={(e) => onStatusChange(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === 'all' ? t('task_manager.filter_all_statuses', '所有状态') : t(`statuses.${s}`)}
          </option>
        ))}
      </select>
      <input
        className={styles.search}
        type="text"
        placeholder={t('task_manager.search_placeholder', '搜索任务...')}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  )
}

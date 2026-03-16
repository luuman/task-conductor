import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { useGitStore } from '../../../lib/store/git'
import styles from './branches-tab.module.css'

const STAGE_ICONS: Record<string, string> = {
  input: '\u25CB',
  analysis: '\u25D4',
  prd: '\u25D4',
  plan: '\u25D4',
  ui: '\u25D4',
  dev: '\u25D1',
  test: '\u25D1',
  deploy: '\u25D1',
  monitor: '\u25D5',
  done: '\u25CF',
}

export function RequirementList() {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const selectedTaskId = useGitStore((s) => s.selectedTaskId)
  const setSelectedTask = useGitStore((s) => s.setSelectedTask)

  const { data: tasks } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.getTasks(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 10_000,
  })

  // Filter tasks that have a branch_name (handle gracefully if not present)
  const branchTasks = (tasks ?? []).filter((task) => {
    const t = task as Record<string, unknown>
    return !!t.branch_name
  })

  if (branchTasks.length === 0) {
    return (
      <div className={styles.empty}>
        {t('git.requirements')} - {t('git.noChanges')}
      </div>
    )
  }

  return (
    <div className={styles.requirementList}>
      <div className={styles.sectionTitle}>{t('git.requirements')}</div>
      {branchTasks.map((task) => {
        const branchName = (task as Record<string, unknown>).branch_name as string
        const isActive = selectedTaskId === task.id
        return (
          <button
            key={task.id}
            className={`${styles.reqItem} ${isActive ? styles.reqItemActive : ''}`}
            onClick={() => setSelectedTask(task.id, branchName)}
          >
            <span className={styles.stageIcon}>
              {STAGE_ICONS[task.current_stage] ?? '\u25CB'}
            </span>
            <span className={styles.reqInfo}>
              <span className={styles.reqName}>{task.title}</span>
              <span className={styles.reqMeta}>
                <span className={styles.branchTag}>{branchName}</span>
                <span className={styles.stageLabel}>{task.current_stage}</span>
              </span>
            </span>
            {isActive && <span className={styles.virtualBadge} title={t('git.virtualHint')}>&#128065;</span>}
          </button>
        )
      })}
    </div>
  )
}

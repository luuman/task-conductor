import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { PipelineCard } from './PipelineCard'
import type { PreviewService } from '../../lib/api/types'
import styles from './pipeline.module.css'

const COLUMNS = [
  { key: 'developing',     i18nKey: 'pipeline.col_developing' },
  { key: 'pending_review', i18nKey: 'pipeline.col_review' },
  { key: 'ready_to_merge', i18nKey: 'pipeline.col_ready' },
] as const

export default function PipelinePage() {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const [expandedId, setExpandedId] = useState<Record<string, number | null>>({
    developing: null, pending_review: null, ready_to_merge: null,
  })

  const { data: tasks = [], refetch } = useQuery({
    queryKey: ['pipeline', projectId],
    queryFn: () => api.getPipelineTasks(Number(projectId!)),
    enabled: !!projectId,
    refetchInterval: 5_000,
  })

  const { data: previews = [] } = useQuery({
    queryKey: ['previews'],
    queryFn: () => api.listPreviews(),
    refetchInterval: 3_000,
  })

  const { data: tcConfig } = useQuery({
    queryKey: ['tc-config'],
    queryFn: () => api.getTcConfig(),
    staleTime: 60_000,
  })
  const defaultBranch: string = (tcConfig as Record<string, any>)?.pipeline?.default_merge_branch ?? 'main'

  const previewMap = new Map<number, PreviewService>(
    previews.map((p) => [p.task_id, p])
  )

  function handleExpand(colKey: string, taskId: number) {
    setExpandedId((prev) => ({
      ...prev,
      [colKey]: prev[colKey] === taskId ? null : taskId,
    }))
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span className={styles.title}>{t('pipeline.title')}</span>
        <button className={styles.newBtn}>{t('pipeline.newTask')}</button>
      </div>

      <div className={styles.board}>
        {COLUMNS.map(({ key, i18nKey }) => {
          const colTasks = tasks.filter((t) => t.status === key)
          return (
            <div key={key} className={styles.col}>
              <div className={styles.colHeader}>
                <span className={styles.colLabel}>{t(i18nKey)}</span>
                <span className={styles.colCount}>{colTasks.length}</span>
              </div>
              <div className={styles.colBody}>
                {colTasks.length === 0 && <div className={styles.empty}>—</div>}
                {colTasks.map((task) => (
                  <PipelineCard
                    key={task.id}
                    task={task}
                    preview={previewMap.get(task.id)}
                    defaultBranch={defaultBranch}
                    expanded={expandedId[key] === task.id}
                    onExpand={() => handleExpand(key, task.id)}
                    onMerged={() => refetch()}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

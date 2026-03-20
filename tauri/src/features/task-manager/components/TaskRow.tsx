import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Task } from '../../../lib/api/types'
import { Button } from '../../../ui/button'
import styles from './TaskRow.module.css'

const STAGE_COLORS: Record<string, string> = {
  input: '#6b7280',
  analysis: '#8b5cf6',
  prd: '#3b82f6',
  ui: '#ec4899',
  plan: '#f59e0b',
  dev: '#10b981',
  test: '#06b6d4',
  deploy: '#f97316',
  monitor: '#6366f1',
  done: '#22c55e',
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  running: '#3b82f6',
  waiting_review: '#f59e0b',
  approved: '#10b981',
  done: '#22c55e',
  failed: '#ef4444',
  rejected: '#ef4444',
}

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.just_now')
  if (mins < 60) return t('time.mins_ago', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('time.hours_ago', { n: hours })
  const days = Math.floor(hours / 24)
  return t('time.days_ago', { n: days })
}

interface TaskRowProps {
  task: Task
  onApprove: (taskId: number, action: 'approve' | 'reject') => void
  onAdvance: (taskId: number) => void
}

export function TaskRow({ task, onApprove, onAdvance }: TaskRowProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const deps = task.depends_on ? JSON.parse(task.depends_on) as number[] : []

  return (
    <tr className={styles.row}>
      <td className={styles.titleCell}>
        <div className={styles.title}>{task.title}</div>
        {task.description && (
          <div className={styles.desc}>{task.description}</div>
        )}
      </td>
      <td>
        <span
          className={styles.badge}
          style={{ background: `${STAGE_COLORS[task.stage] ?? '#6b7280'}20`, color: STAGE_COLORS[task.stage] ?? '#6b7280' }}
        >
          {t(`stages.${task.stage}`)}
        </span>
      </td>
      <td>
        <span
          className={`${styles.badge} ${task.status === 'running' ? styles.pulse : ''}`}
          style={{ background: `${STATUS_COLORS[task.status] ?? '#6b7280'}20`, color: STATUS_COLORS[task.status] ?? '#6b7280' }}
        >
          {task.status === 'running' && <span className={styles.dot} />}
          {t(`statuses.${task.status}`)}
        </span>
      </td>
      <td>
        {deps.length > 0 && (
          <span className={styles.depBadge}>{deps.length} {t('task_manager.deps', '依赖')}</span>
        )}
      </td>
      <td className={styles.time}>
        {timeAgo(task.started_at ?? task.created_at, t)}
      </td>
      <td className={styles.actions}>
        {task.status === 'waiting_review' && (
          <>
            <Button size="sm" onClick={() => onApprove(task.id, 'approve')}>
              {t('task_manager.approve', '批准')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onApprove(task.id, 'reject')}>
              {t('task_manager.reject', '拒绝')}
            </Button>
          </>
        )}
        {task.status === 'approved' && (
          <Button size="sm" onClick={() => onAdvance(task.id)}>
            {t('task_manager.advance', '推进')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => navigate(`/task/${task.id}`)}>
          {t('task_manager.view', '查看')}
        </Button>
      </td>
    </tr>
  )
}

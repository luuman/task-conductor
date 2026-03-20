import { useTranslation } from 'react-i18next'
import type { Task } from '../../../lib/api/types'
import { TaskRow } from './TaskRow'
import styles from './TaskTable.module.css'

interface TaskTableProps {
  tasks: Task[]
  onApprove: (taskId: number, action: 'approve' | 'reject') => void
  onAdvance: (taskId: number) => void
}

export function TaskTable({ tasks, onApprove, onAdvance }: TaskTableProps) {
  const { t } = useTranslation()

  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>{t('task_manager.no_tasks', '暂无任务')}</div>
        <div className={styles.emptyHint}>{t('task_manager.no_tasks_hint', '点击「新建任务」开始')}</div>
      </div>
    )
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('task_manager.col_title', '标题')}</th>
            <th>{t('task_manager.col_stage', '阶段')}</th>
            <th>{t('task_manager.col_status', '状态')}</th>
            <th>{t('task_manager.col_deps', '依赖')}</th>
            <th>{t('task_manager.col_time', '时间')}</th>
            <th>{t('task_manager.col_actions', '操作')}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onApprove={onApprove} onAdvance={onAdvance} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

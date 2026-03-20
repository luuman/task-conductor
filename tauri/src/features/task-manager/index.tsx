import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskManagerData } from './hooks/useTaskManagerData'
import { TaskTable } from './components/TaskTable'
import { TaskFilters } from './components/TaskFilters'
import { CreateTaskModal } from './components/CreateTaskModal'
import { Button } from '../../ui/button'
import styles from './task-manager.module.css'

export default function TaskManagerPage() {
  const { t } = useTranslation()
  const { activeProjectId, tasks, loading, createTask, approveTask, advanceTask } = useTaskManagerData()
  const [modalOpen, setModalOpen] = useState(false)
  const [stage, setStage] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (stage !== 'all' && task.stage !== stage) return false
      if (status !== 'all' && task.status !== status) return false
      if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [tasks, stage, status, search])

  if (!activeProjectId) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{t('task_manager.no_project', '请选择一个项目')}</h2>
          <p className={styles.emptyHint}>{t('task_manager.no_project_hint', '从侧边栏选择一个项目开始')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('task_manager.title', '任务管理')}</h1>
        <Button onClick={() => setModalOpen(true)}>
          + {t('task_manager.new_task', '新建任务')}
        </Button>
      </div>

      <div className={styles.toolbar}>
        <TaskFilters
          stage={stage}
          status={status}
          search={search}
          onStageChange={setStage}
          onStatusChange={setStatus}
          onSearchChange={setSearch}
        />
      </div>

      <div className={styles.section}>
        {loading ? (
          <div className={styles.empty}>
            <p>{t('common.loading')}</p>
          </div>
        ) : (
          <TaskTable
            tasks={filtered}
            onApprove={(taskId, action) => approveTask.mutate({ taskId, action })}
            onAdvance={(taskId) => advanceTask.mutate(taskId)}
          />
        )}
      </div>

      <CreateTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(data) => {
          createTask.mutate(data, { onSuccess: () => setModalOpen(false) })
        }}
        loading={createTask.isPending}
      />
    </div>
  )
}

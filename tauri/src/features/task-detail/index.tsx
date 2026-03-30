import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTaskDetailData } from './hooks/useTaskDetailData'
import { StageTimeline } from './components/StageTimeline'
import { ArtifactList } from './components/ArtifactList'
import { DocumentSection } from './components/DocumentSection'
import { Button } from '../../ui/button'
import { useChatStore } from '../../lib/store/chat'
import styles from './task-detail.module.css'

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  running: '#3b82f6',
  waiting_review: '#f59e0b',
  approved: '#10b981',
  done: '#22c55e',
  failed: '#ef4444',
  rejected: '#ef4444',
}

function formatTime(s: string | null): string {
  if (!s) return '-'
  return new Date(s).toLocaleString()
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const taskId = Number(id)
  const { task, artifacts, loading, approveTask, startTask, advanceTask } = useTaskDetailData(taskId)
  const setPageContext = useChatStore(s => s.setPageContext)

  // 告知 AI 助手当前所在任务
  useEffect(() => {
    if (!task) return
    setPageContext({ page: 'task-detail', taskId: task.id, taskTitle: task.title })
    return () => setPageContext({ page: 'dashboard' })
  }, [task?.id, task?.title, setPageContext])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{t('task_detail.not_found', '\u4EFB\u52A1\u4E0D\u5B58\u5728')}</h2>
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[task.status] ?? '#6b7280'

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate('/task-manager')}>
        {'\u2190'} {t('common.back')}
      </button>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{task.title}</h1>
          {task.description && <p className={styles.description}>{task.description}</p>}
        </div>
        <div className={styles.headerRight}>
          {task.stage === 'input' && task.status === 'pending' && !!task.requirements && (
            <Button
              onClick={() => startTask.mutate()}
              disabled={startTask.isPending}
            >
              {startTask.isPending ? '启动中…' : '🚀 启动流水线'}
            </Button>
          )}
          {task.status === 'waiting_review' && (
            <>
              <Button onClick={() => approveTask.mutate({ action: 'approve' })}>
                {t('task_manager.approve', '\u6279\u51C6')}
              </Button>
              <Button variant="ghost" onClick={() => approveTask.mutate({ action: 'reject' })}>
                {t('task_manager.reject', '\u62D2\u7EDD')}
              </Button>
            </>
          )}
          {task.status === 'approved' && (
            <Button onClick={() => advanceTask.mutate()}>
              {t('task_manager.advance', '\u63A8\u8FDB')}
            </Button>
          )}
          <span
            className={styles.badge}
            style={{ background: `${statusColor}20`, color: statusColor }}
          >
            {t(`statuses.${task.status}`)}
          </span>
        </div>
      </div>

      {/* 文档区域（所有阶段均显示） */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>任务文档</span>
        </div>
        <div className={styles.sectionBody} style={{ height: 480 }}>
          <DocumentSection taskId={task.id} taskTitle={task.title} />
        </div>
      </div>

      {/* Pipeline Stage Timeline */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>{t('task_detail.pipeline', '\u6D41\u6C34\u7EBF\u8FDB\u5EA6')}</span>
        </div>
        <div className={styles.sectionBody}>
          <StageTimeline currentStage={task.stage} status={task.status} />
        </div>
      </div>

      {/* Meta Info */}
      <div className={styles.metaGrid}>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>{t('task_detail.stage', '\u5F53\u524D\u9636\u6BB5')}</div>
          <div className={styles.metaValue}>{t(`stages.${task.stage}`)}</div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>{t('task_detail.created', '\u521B\u5EFA\u65F6\u95F4')}</div>
          <div className={styles.metaValue}>{formatTime(task.created_at)}</div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>{t('task_detail.started', '\u5F00\u59CB\u65F6\u95F4')}</div>
          <div className={styles.metaValue}>{formatTime(task.started_at)}</div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>{t('task_detail.finished', '\u5B8C\u6210\u65F6\u95F4')}</div>
          <div className={styles.metaValue}>{formatTime(task.finished_at)}</div>
        </div>
        {task.branch_name && (
          <div className={styles.metaCard}>
            <div className={styles.metaLabel}>{t('task_detail.branch', '\u5206\u652F')}</div>
            <div className={styles.metaValue}>{task.branch_name}</div>
          </div>
        )}
        {task.worktree_path && (
          <div className={styles.metaCard}>
            <div className={styles.metaLabel}>{t('task_detail.worktree', 'Worktree')}</div>
            <div className={styles.metaValue}>{task.worktree_path}</div>
          </div>
        )}
      </div>

      {/* Artifacts */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            {t('task_detail.artifacts', '\u9636\u6BB5\u4EA7\u7269')} ({artifacts.length})
          </span>
        </div>
        <div className={styles.sectionBody}>
          <ArtifactList artifacts={artifacts} />
        </div>
      </div>
    </div>
  )
}

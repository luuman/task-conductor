import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTaskDetailData } from './hooks/useTaskDetailData'
import { StageTimeline } from './components/StageTimeline'
import { ArtifactList } from './components/ArtifactList'
import { RequirementWorkspace } from './components/RequirementWorkspace'
import { RequirementFields } from '../../lib/api/types'
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
  const { task, artifacts, loading, approveTask, startTask, advanceTask, updateRequirements } = useTaskDetailData(taskId)
  const setPageContext = useChatStore(s => s.setPageContext)
  const openAssistant = useChatStore(s => s.toggle)
  const chatIsOpen = useChatStore(s => s.isOpen)
  const setInputDraft = useChatStore(s => s.setInputDraft)

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

      {/* Input Stage: Requirement Workspace */}
      {task.stage === 'input' && task.status === 'pending' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>需求完善工作台</span>
          </div>
          <div className={styles.sectionBody}>
            <RequirementWorkspace
              taskTitle={task.title}
              requirementsRaw={task.requirements ?? null}
              onSave={(fields: RequirementFields) => updateRequirements.mutate(fields)}
              onRequestReview={() => {
                const req = task.requirements ? JSON.parse(task.requirements) : {}
                const summary = [
                  req.background && `背景：${req.background}`,
                  req.target_users && `目标用户：${req.target_users}`,
                  req.core_features?.length && `核心功能：\n${(req.core_features as string[]).map((f: string) => `- ${f}`).join('\n')}`,
                  req.acceptance_criteria?.length && `验收标准：\n${(req.acceptance_criteria as string[]).map((c: string) => `- ${c}`).join('\n')}`,
                  req.tech_constraints && `技术约束：${req.tech_constraints}`,
                ].filter(Boolean).join('\n\n')
                const msg = `我已完成「${task.title}」的需求填写，请帮我审核以下需求是否完整、是否有遗漏或矛盾：\n\n${summary}\n\n请逐项检查，如有问题请直接指出。`
                useChatStore.getState().setInitialMessage?.(msg)
                if (!chatIsOpen) openAssistant()
              }}
              isSaving={updateRequirements.isPending}
            />
          </div>
        </div>
      )}

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

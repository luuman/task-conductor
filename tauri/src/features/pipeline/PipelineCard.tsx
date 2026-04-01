import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { PreviewPanel } from './PreviewPanel'
import type { PipelineTask, PreviewService } from '../../lib/api/types'
import styles from './card.module.css'

const STATUS_ACCENT: Record<string, string> = {
  developing:     '#2563eb',
  pending_review: '#eab308',
  ready_to_merge: '#4ade80',
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  developing:     { bg: '#172554', color: '#93c5fd', label: 'AI开发中' },
  pending_review: { bg: '#422006', color: '#fbbf24', label: '待审批' },
  ready_to_merge: { bg: '#14532d', color: '#86efac', label: '待合并' },
}

function getProgressSegs(status: string): Array<'done' | 'active' | 'pending'> {
  switch (status) {
    case 'developing':     return ['done', 'active', 'pending', 'pending']
    case 'pending_review': return ['done', 'done', 'active', 'pending']
    case 'ready_to_merge': return ['done', 'done', 'done', 'active']
    default:               return ['pending', 'pending', 'pending', 'pending']
  }
}

interface Props {
  task: PipelineTask
  preview: PreviewService | undefined
  defaultBranch: string
  expanded: boolean
  onExpand: () => void
  onMerged: () => void
}

export function PipelineCard({ task, preview, defaultBranch, expanded, onExpand, onMerged }: Props) {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const [previewSvc, setPreviewSvc] = useState<PreviewService | undefined>(preview)
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const queryClient = useQueryClient()

  const accent = STATUS_ACCENT[task.status] ?? '#3f3f46'
  const badge = STATUS_BADGE[task.status]
  const segs = getProgressSegs(task.status)

  const approveMutation = useMutation({
    mutationFn: () => api.updateTask(task.id, { status: 'ready_to_merge' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] }),
  })

  const mergeMutation = useMutation({
    mutationFn: (branch: string) => api.gitMerge(Number(projectId), task.id, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] })
      onMerged()
    },
  })

  if (!expanded) {
    return (
      <div
        className={styles.card}
        style={{ '--card-accent': accent } as React.CSSProperties}
        onClick={onExpand}
      >
        <div className={styles.collapsed}>
          <div className={styles.collapsedTitle}>#{task.id} {task.title}</div>
          <div className={styles.collapsedBranch}>{task.branch_name ?? '—'}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={styles.card}
      style={{ '--card-accent': accent } as React.CSSProperties}
      onClick={onExpand}
    >
      <div className={styles.expanded} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>#{task.id} {task.title}</div>
            <div className={styles.branch}>{task.branch_name ?? '—'}</div>
          </div>
          {badge && (
            <span className={styles.badge} style={{ background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
          )}
        </div>

        <div className={styles.progress}>
          {segs.map((seg, i) => (
            <div
              key={i}
              className={styles.progressSeg}
              data-done={seg === 'done' ? 'true' : undefined}
              data-active={seg === 'active' ? 'true' : undefined}
            />
          ))}
        </div>

        {(task.test_pass !== undefined || task.test_fail !== undefined) && (
          <div className={styles.testRow}>
            {task.test_pass !== undefined && <span className={styles.testPass}>✓ {task.test_pass} {t('pipeline.test_pass')}</span>}
            {task.test_fail !== undefined && <span className={styles.testFail}> ✗ {task.test_fail} {t('pipeline.test_fail')}</span>}
            {task.status === 'developing' && <span> {t('pipeline.test_running')}</span>}
          </div>
        )}

        <PreviewPanel taskId={task.id} worktreePath={task.worktree_path} preview={previewSvc} onStarted={setPreviewSvc} />

        <div className={styles.actions}>
          <button className={styles.btnGhost}>{t('pipeline.card_log')}</button>
          <button className={styles.btnGhost}>{t('pipeline.card_diff')}</button>

          {task.status === 'pending_review' && (
            <button
              className={`${styles.btnPrimary} ${styles.btnPrimaryAlone}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              ✓ {t('pipeline.card_approve')}
            </button>
          )}

          {task.status === 'ready_to_merge' && (
            <div className={styles.mergeGroup}>
              <button
                className={styles.btnPrimary}
                onClick={() => mergeMutation.mutate(defaultBranch)}
                disabled={mergeMutation.isPending}
              >
                {t('pipeline.card_mergeInto')} {defaultBranch}
              </button>
              <button className={styles.btnDropdown} onClick={() => setShowBranchMenu(v => !v)}>▾</button>
            </div>
          )}
        </div>

        {showBranchMenu && (
          <div style={{ marginTop: 4, background: 'var(--tc-bg-primary)', border: '1px solid var(--tc-border)', borderRadius: 4, padding: 4 }}>
            {['main', 'develop', 'staging'].filter(b => b !== task.branch_name).map(b => (
              <div
                key={b}
                style={{ padding: '3px 8px', fontSize: 10, cursor: 'pointer', color: 'var(--tc-text-primary)' }}
                onClick={() => { setShowBranchMenu(false); mergeMutation.mutate(b) }}
              >
                {b}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

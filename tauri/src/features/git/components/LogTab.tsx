import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { useGitLog, useGitStashList } from '../hooks/useGitLog'
import styles from './log-tab.module.css'

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

interface LogTabProps {
  onSelectCommit: (hash: string) => void
  selectedCommit: string | null
}

export function LogTab({ onSelectCommit, selectedCommit }: LogTabProps) {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const queryClient = useQueryClient()
  const { data: commits, isLoading } = useGitLog(100)
  const { data: stashes } = useGitStashList()
  const [stashMsg, setStashMsg] = useState('')

  const stashSaveMutation = useMutation({
    mutationFn: (msg?: string) => api.gitStashSave(Number(projectId!), msg),
    onSuccess: () => {
      setStashMsg('')
      queryClient.invalidateQueries({ queryKey: ['git-stash-list', projectId] })
      queryClient.invalidateQueries({ queryKey: ['git-status', projectId] })
    },
  })

  const stashApplyMutation = useMutation({
    mutationFn: (index: number) => api.gitStashApply(Number(projectId!), index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-stash-list', projectId] })
      queryClient.invalidateQueries({ queryKey: ['git-status', projectId] })
    },
  })

  const stashDropMutation = useMutation({
    mutationFn: (index: number) => api.gitStashDrop(Number(projectId!), index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-stash-list', projectId] })
    },
  })

  return (
    <div className={styles.container}>
      {/* Commit list */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('git.log')}</div>
        {isLoading && <div className={styles.empty}>{t('common.loading')}</div>}
        {!isLoading && (!commits || commits.length === 0) && (
          <div className={styles.empty}>{t('git.noCommits')}</div>
        )}
        <div className={styles.commitList}>
          {(commits ?? []).map((c) => (
            <button
              key={c.hash}
              className={`${styles.commitRow} ${selectedCommit === c.hash ? styles.commitRowActive : ''}`}
              onClick={() => onSelectCommit(c.hash)}
            >
              <span className={styles.commitHash}>{c.hash.slice(0, 7)}</span>
              <span className={styles.commitInfo}>
                <span className={styles.commitMsg}>{c.message}</span>
                <span className={styles.commitMeta}>
                  <span>{c.author}</span>
                  <span>{relativeTime(c.date)}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Stash section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('git.stash')}</div>
        <div className={styles.stashSave}>
          <input
            className={styles.stashInput}
            placeholder={t('git.commitPlaceholder')}
            value={stashMsg}
            onChange={(e) => setStashMsg(e.target.value)}
          />
          <button
            className={styles.stashSaveBtn}
            onClick={() => stashSaveMutation.mutate(stashMsg || undefined)}
            disabled={stashSaveMutation.isPending}
          >
            {t('git.stash')}
          </button>
        </div>
        {(stashes ?? []).map((s, idx) => (
          <div key={s.ref} className={styles.stashRow}>
            <span className={styles.stashRef}>{s.ref}</span>
            <span className={styles.stashMessage}>{s.message}</span>
            <span className={styles.stashActions}>
              <button
                className={styles.stashActionBtn}
                onClick={() => stashApplyMutation.mutate(idx)}
                disabled={stashApplyMutation.isPending}
              >
                {t('git.stashApply')}
              </button>
              <button
                className={styles.stashActionBtnDanger}
                onClick={() => stashDropMutation.mutate(idx)}
                disabled={stashDropMutation.isPending}
              >
                {t('git.stashDrop')}
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { useGitStore } from '../../../lib/store/git'
import { useGitStatus } from '../hooks/useGitStatus'
import styles from './changes-tab.module.css'

export function ChangesTab() {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const setSelectedFile = useGitStore((s) => s.setSelectedFile)
  const selectedFile = useGitStore((s) => s.selectedFile)
  const queryClient = useQueryClient()
  const { data: status, isLoading } = useGitStatus()
  const [commitMsg, setCommitMsg] = useState('')

  const invalidateGit = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['git-status', projectId] })
    queryClient.invalidateQueries({ queryKey: ['git-log', projectId] })
    queryClient.invalidateQueries({ queryKey: ['git-diff', projectId] })
  }, [queryClient, projectId])

  const stageMutation = useMutation({
    mutationFn: (files?: string[]) => api.gitStage(Number(projectId!), files),
    onSuccess: invalidateGit,
  })

  const unstageMutation = useMutation({
    mutationFn: (files?: string[]) => api.gitUnstage(Number(projectId!), files),
    onSuccess: invalidateGit,
  })

  const discardMutation = useMutation({
    mutationFn: (files: string[]) => api.gitDiscard(Number(projectId!), files),
    onSuccess: invalidateGit,
  })

  const commitMutation = useMutation({
    mutationFn: (message: string) => api.gitCommit(Number(projectId!), message),
    onSuccess: () => {
      setCommitMsg('')
      invalidateGit()
    },
  })

  const pushMutation = useMutation({
    mutationFn: () => api.gitPush(Number(projectId!)),
    onSuccess: invalidateGit,
  })

  const pullMutation = useMutation({
    mutationFn: () => api.gitPull(Number(projectId!)),
    onSuccess: invalidateGit,
  })

  const fetchMutation = useMutation({
    mutationFn: () => api.gitFetch(Number(projectId!)),
    onSuccess: invalidateGit,
  })

  if (isLoading) {
    return <div className={styles.loading}>{t('common.loading')}</div>
  }

  if (!status) return null

  const hasStaged = status.staged.length > 0
  const hasUnstaged = status.unstaged.length > 0
  const hasUntracked = status.untracked.length > 0
  const hasAny = hasStaged || hasUnstaged || hasUntracked

  return (
    <div className={styles.container}>
      {/* Branch info */}
      <div className={styles.branchBar}>
        <span className={styles.branchIcon}>&#9416;</span>
        <span className={styles.branchName}>{status.branch}</span>
      </div>

      {/* Staged */}
      {hasStaged && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{t('git.staged')}</span>
            <button
              className={styles.actionBtn}
              onClick={() => unstageMutation.mutate(undefined)}
              disabled={unstageMutation.isPending}
            >
              {t('git.unstageAll')}
            </button>
          </div>
          {status.staged.map((f) => (
            <button
              key={f.path}
              className={`${styles.fileRow} ${selectedFile === f.path ? styles.fileRowActive : ''}`}
              onClick={() => setSelectedFile(f.path)}
            >
              <span className={`${styles.badge} ${styles[`badge${f.status}`]}`}>{f.status}</span>
              <span className={styles.filePath}>{f.path}</span>
              <span
                className={styles.miniBtn}
                onClick={(e) => { e.stopPropagation(); unstageMutation.mutate([f.path]) }}
                title={t('git.unstageAll')}
              >
                &minus;
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Unstaged */}
      {hasUnstaged && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{t('git.unstaged')}</span>
            <button
              className={styles.actionBtn}
              onClick={() => stageMutation.mutate(undefined)}
              disabled={stageMutation.isPending}
            >
              {t('git.stageAll')}
            </button>
          </div>
          {status.unstaged.map((f) => (
            <button
              key={f.path}
              className={`${styles.fileRow} ${selectedFile === f.path ? styles.fileRowActive : ''}`}
              onClick={() => setSelectedFile(f.path)}
            >
              <span className={`${styles.badge} ${styles[`badge${f.status}`]}`}>{f.status}</span>
              <span className={styles.filePath}>{f.path}</span>
              <span className={styles.miniActions}>
                <span
                  className={styles.miniBtn}
                  onClick={(e) => { e.stopPropagation(); stageMutation.mutate([f.path]) }}
                  title={t('git.stageAll')}
                >
                  +
                </span>
                <span
                  className={styles.miniBtnDanger}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(t('git.discardConfirm'))) discardMutation.mutate([f.path])
                  }}
                  title={t('git.discard')}
                >
                  &#x2715;
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Untracked */}
      {hasUntracked && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{t('git.untracked')}</span>
          </div>
          {status.untracked.map((f) => (
            <button
              key={f.path}
              className={`${styles.fileRow} ${selectedFile === f.path ? styles.fileRowActive : ''}`}
              onClick={() => setSelectedFile(f.path)}
            >
              <span className={`${styles.badge} ${styles.badgeU}`}>U</span>
              <span className={styles.filePath}>{f.path}</span>
              <span
                className={styles.miniBtn}
                onClick={(e) => { e.stopPropagation(); stageMutation.mutate([f.path]) }}
                title={t('git.stageAll')}
              >
                +
              </span>
            </button>
          ))}
        </div>
      )}

      {!hasAny && (
        <div className={styles.empty}>{t('git.noChanges')}</div>
      )}

      {/* Commit area */}
      <div className={styles.commitArea}>
        <textarea
          className={styles.commitInput}
          placeholder={t('git.commitPlaceholder')}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          rows={3}
        />
        <button
          className={styles.commitBtn}
          disabled={!commitMsg.trim() || !hasStaged || commitMutation.isPending}
          onClick={() => commitMutation.mutate(commitMsg)}
        >
          {t('git.commit')}
        </button>
      </div>

      {/* Push / Pull / Fetch */}
      <div className={styles.syncBar}>
        <button className={styles.syncBtn} onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}>
          {t('git.push')}
        </button>
        <button className={styles.syncBtn} onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending}>
          {t('git.pull')}
        </button>
        <button className={styles.syncBtn} onClick={() => fetchMutation.mutate()} disabled={fetchMutation.isPending}>
          {t('git.fetch')}
        </button>
      </div>
    </div>
  )
}

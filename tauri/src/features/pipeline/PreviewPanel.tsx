import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { api } from '../../lib/api'
import { isTauri } from '../../lib/tauri'
import type { PreviewService } from '../../lib/api/types'
import styles from './preview.module.css'

interface Props {
  taskId: number
  worktreePath: string | null
  preview: PreviewService | undefined
  onStarted: (svc: PreviewService) => void
}

export function PreviewPanel({ taskId, worktreePath, preview, onStarted }: Props) {
  const { t } = useTranslation()
  const proxyUrl = preview ? `/proxy/${taskId}/` : null
  const hasWorktree = !!worktreePath

  const startMutation = useMutation({
    mutationFn: () => api.startPreview(taskId),
    onSuccess: onStarted,
  })

  function handleOpenWindow() {
    if (!proxyUrl) return
    const fullUrl = `${window.location.origin}${proxyUrl}`
    if (isTauri()) {
      invoke('open_preview_window', { url: fullUrl }).catch(console.error)
    } else {
      window.open(fullUrl, '_blank')
    }
  }

  if (!preview) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          {hasWorktree ? (
            <button
              className={styles.startBtn}
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? '启动中...' : `▶ ${t('pipeline.card_startPreview')}`}
            </button>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--tc-text-muted)' }}>
              {t('pipeline.preview_placeholder')}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.url}>localhost:{preview.port}</span>
        <button className={styles.openBtn} onClick={handleOpenWindow} title={t('pipeline.card_openWindow')}>
          ⤢
        </button>
      </div>
      <iframe
        className={styles.frame}
        src={proxyUrl!}
        title={`preview-${taskId}`}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  )
}

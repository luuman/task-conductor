import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { PreviewService } from '../../../lib/api/types'

export function ServicesPanel() {
  const qc = useQueryClient()

  const { data: previews = [] } = useQuery({
    queryKey: ['previews'],
    queryFn: () => api.listPreviews(),
    refetchInterval: 3_000,
  })

  const stopOne = useMutation({
    mutationFn: (taskId: number) => api.stopPreview(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['previews'] }),
  })

  const stopAll = useMutation({
    mutationFn: () => api.stopAllPreviews(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['previews'] }),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>运行中的预览服务</span>
        {previews.length > 0 && (
          <button
            onClick={() => stopAll.mutate()}
            disabled={stopAll.isPending}
            style={{ fontSize: 11, color: 'var(--tc-text-danger, #f87171)', background: 'none', border: '1px solid var(--tc-border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
          >
            全部关闭
          </button>
        )}
      </div>

      {previews.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--tc-text-muted)', padding: '8px 0' }}>
          暂无运行中的服务
        </div>
      )}

      {previews.map((svc: PreviewService) => (
        <div
          key={svc.task_id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--tc-bg-secondary)', borderRadius: 4, marginBottom: 4, border: '1px solid var(--tc-border)' }}
        >
          <span style={{ width: 6, height: 6, background: '#4ade80', borderRadius: '50%', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 11 }}>任务 #{svc.task_id}</span>
          <span style={{ fontSize: 10, color: 'var(--tc-text-muted)', fontFamily: 'monospace' }}>
            localhost:{svc.port}
          </span>
          <button
            onClick={() => stopOne.mutate(svc.task_id)}
            style={{ fontSize: 10, color: 'var(--tc-text-danger, #f87171)', background: 'none', border: '1px solid var(--tc-border)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}
          >
            关闭
          </button>
        </div>
      ))}
    </div>
  )
}

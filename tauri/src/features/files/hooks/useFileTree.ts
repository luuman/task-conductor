import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useFileTree() {
  const projectId = useAppStore((s) => s.activeProjectId)
  return useQuery({
    queryKey: ['files', projectId],
    queryFn: () => api.getProjectFiles(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

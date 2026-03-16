import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useGitStatus() {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () => api.gitStatus(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 0,
  })
}

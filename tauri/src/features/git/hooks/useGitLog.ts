import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useGitLog(limit = 100) {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['git-log', projectId, limit],
    queryFn: () => api.gitLog(Number(projectId!), limit),
    enabled: !!projectId,
    staleTime: 5_000,
  })
}

export function useGitStashList() {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['git-stash-list', projectId],
    queryFn: () => api.gitStashList(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 5_000,
  })
}

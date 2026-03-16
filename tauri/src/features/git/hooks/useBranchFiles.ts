import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useBranchFiles(branch: string | null) {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['git-branch-files', projectId, branch],
    queryFn: () => api.gitBranchFiles(Number(projectId!), branch!),
    enabled: !!projectId && !!branch,
    staleTime: 5_000,
  })
}

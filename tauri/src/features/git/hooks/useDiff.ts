import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

/**
 * Fetch diff content for the right panel.
 * - For virtual branch browsing: fetches original (main) and modified (branch) content
 * - For working directory: fetches unified diff
 */
export function useBranchDiff(branch: string | null, file: string | null) {
  const projectId = useAppStore((s) => s.activeProjectId)

  const original = useQuery({
    queryKey: ['git-show', projectId, 'main', file],
    queryFn: () => api.gitShow(Number(projectId!), 'main', file!),
    enabled: !!projectId && !!branch && !!file,
    staleTime: 10_000,
  })

  const modified = useQuery({
    queryKey: ['git-show', projectId, branch, file],
    queryFn: () => api.gitShow(Number(projectId!), branch!, file!),
    enabled: !!projectId && !!branch && !!file,
    staleTime: 10_000,
  })

  return {
    original: original.data?.content ?? '',
    modified: modified.data?.content ?? '',
    isLoading: original.isLoading || modified.isLoading,
    isError: original.isError || modified.isError,
  }
}

export function useWorkingDiff(file: string | null, opts?: { staged?: boolean; commit?: string }) {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['git-diff', projectId, file, opts?.staged, opts?.commit],
    queryFn: () => api.gitDiff(Number(projectId!), { file: file ?? undefined, staged: opts?.staged, commit: opts?.commit }),
    enabled: !!projectId && !!file,
    staleTime: 0,
  })
}

export function useCommitDiff(commit: string | null) {
  const projectId = useAppStore((s) => s.activeProjectId)

  return useQuery({
    queryKey: ['git-diff-commit', projectId, commit],
    queryFn: () => api.gitDiff(Number(projectId!), { commit: commit! }),
    enabled: !!projectId && !!commit,
    staleTime: 30_000,
  })
}

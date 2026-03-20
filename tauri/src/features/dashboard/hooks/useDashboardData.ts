import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useDashboardData() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projectId = activeProjectId ? Number(activeProjectId) : null

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    staleTime: 30_000,
  })

  const tasks = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.getTasks(projectId!),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.getSessions(),
    refetchInterval: 30_000,
  })

  const knowledge = useQuery({
    queryKey: ['knowledge', projectId],
    queryFn: () => api.getProjectKnowledge(projectId!),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const fileTree = useQuery({
    queryKey: ['file-tree', projectId],
    queryFn: () => api.getFileTree(projectId!, 3),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.getMetrics(),
    staleTime: 30_000,
  })

  const project = projects.data?.find((p) => String(p.id) === activeProjectId) ?? null

  const loading = !activeProjectId ? false : tasks.isLoading

  return {
    activeProjectId,
    projectId,
    project,
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    sessions: sessions.data ?? [],
    knowledge: knowledge.data ?? [],
    fileTree: fileTree.data ?? null,
    metrics: metrics.data ?? null,
    loading,
  }
}

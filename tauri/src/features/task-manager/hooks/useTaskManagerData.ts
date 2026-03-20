import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'

export function useTaskManagerData() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projectId = activeProjectId ? Number(activeProjectId) : null
  const queryClient = useQueryClient()

  const tasks = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.getTasks(projectId!),
    enabled: !!projectId,
    refetchInterval: 10_000,
  })

  const createTask = useMutation({
    mutationFn: (data: { title: string; description?: string }) =>
      api.createTask(projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
    },
  })

  const approveTask = useMutation({
    mutationFn: (args: { taskId: number; action: 'approve' | 'reject'; reason?: string }) =>
      api.approveTask(args.taskId, { action: args.action, reason: args.reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
    },
  })

  const advanceTask = useMutation({
    mutationFn: (taskId: number) => api.advanceTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
    },
  })

  return {
    activeProjectId,
    projectId,
    tasks: tasks.data ?? [],
    loading: tasks.isLoading,
    createTask,
    approveTask,
    advanceTask,
  }
}

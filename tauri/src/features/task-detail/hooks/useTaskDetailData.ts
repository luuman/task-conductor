import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { RequirementFields } from '../../../lib/api/types'

export function useTaskDetailData(taskId: number) {
  const queryClient = useQueryClient()

  const task = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(taskId),
    refetchInterval: 10_000,
  })

  const artifacts = useQuery({
    queryKey: ['task-artifacts', taskId],
    queryFn: () => api.getTaskArtifacts(taskId),
    refetchInterval: 15_000,
  })

  const approveTask = useMutation({
    mutationFn: (args: { action: 'approve' | 'reject'; reason?: string }) =>
      api.approveTask(taskId, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const startTask = useMutation({
    mutationFn: () => api.startTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const advanceTask = useMutation({
    mutationFn: () => api.advanceTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task-artifacts', taskId] })
    },
  })

  const updateRequirements = useMutation({
    mutationFn: (fields: RequirementFields) => api.updateRequirements(taskId, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  return {
    task: task.data ?? null,
    artifacts: artifacts.data ?? [],
    loading: task.isLoading,
    approveTask,
    startTask,
    advanceTask,
    updateRequirements,
  }
}

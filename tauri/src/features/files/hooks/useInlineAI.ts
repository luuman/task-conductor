import { useMutation } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { InlineEditRequest } from '../../../lib/api/types'

export function useInlineAI() {
  return useMutation({
    mutationFn: (req: InlineEditRequest) => api.aiInlineEdit(req),
  })
}

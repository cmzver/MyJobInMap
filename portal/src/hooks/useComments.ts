import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { commentsApi } from '@/api/comments'

// Query keys
export const commentKeys = {
  all: ['comments'] as const,
  lists: () => [...commentKeys.all, 'list'] as const,
  list: (taskId: number) => [...commentKeys.lists(), taskId] as const,
}

// Get comments for a task
export function useComments(taskId: number) {
  return useQuery({
    queryKey: commentKeys.list(taskId),
    queryFn: () => commentsApi.getComments(taskId),
    enabled: !!taskId,
  })
}

// Add comment mutation
export function useAddComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, text }: { taskId: number; text: string }) =>
      commentsApi.addComment(taskId, { text }),
    onSuccess: (_, { taskId }) => {
      // Invalidate comments list to refetch
      queryClient.invalidateQueries({ queryKey: commentKeys.list(taskId) })
    },
  })
}

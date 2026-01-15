import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import type { Task, TaskFilters } from '@/types/task'

// Query keys
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters?: TaskFilters) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: number) => [...taskKeys.details(), id] as const,
}

// Get paginated tasks list
export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => tasksApi.getTasks(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Get single task
export function useTask(id: number) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksApi.getTask(id),
    enabled: !!id,
  })
}

// Create task mutation
export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: tasksApi.createTask,
    onSuccess: () => {
      // Invalidate tasks list to refetch
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

// Update task mutation
export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof tasksApi.updateTask>[1] }) =>
      tasksApi.updateTask(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate specific task and lists
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

// Update task status mutation with optimistic update
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      tasksApi.updateTaskStatus(id, status),
    
    // Optimistic update
    onMutate: async ({ id, status }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) })
      
      // Snapshot previous value
      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(id))
      
      // Optimistically update the cache
      if (previousTask) {
        queryClient.setQueryData<Task>(taskKeys.detail(id), {
          ...previousTask,
          status: status as Task['status'],
          updated_at: new Date().toISOString(),
        })
      }
      
      return { previousTask }
    },
    
    // Rollback on error
    onError: (_err, { id }, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(id), context.previousTask)
      }
    },
    
    // Always refetch after error or success
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

// Delete task mutation with optimistic update
export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: tasksApi.deleteTask,
    
    // Optimistic update - remove from cache immediately
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.lists() })
      
      // Remove the task detail from cache
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) })
      
      return { id }
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

// Assign task to user mutation
export function useAssignTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, assignedUserId }: { id: number; assignedUserId: number | null }) =>
      tasksApi.assignTask(id, assignedUserId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

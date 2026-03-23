import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import type { PaginatedResponse, Task, TaskFilters } from '@/types/task'

// Query keys
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters?: TaskFilters) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: number) => [...taskKeys.details(), id] as const,
}

export const myTaskKeys = {
  all: ['my-tasks'] as const,
  list: (userId?: number | null) => [...myTaskKeys.all, userId ?? null] as const,
}

function syncTaskInPaginatedLists(queryClient: QueryClient, task: Task) {
  queryClient.setQueriesData<PaginatedResponse<Task>>({ queryKey: taskKeys.lists() }, (current) => {
    if (!current) return current

    const hasTask = current.items.some((item) => item.id === task.id)
    if (!hasTask) return current

    return {
      ...current,
      items: current.items.map((item) => (item.id === task.id ? task : item)),
    }
  })
}

function syncTaskInMyTaskLists(queryClient: QueryClient, task: Task) {
  const cachedLists = queryClient.getQueriesData<Task[]>({ queryKey: myTaskKeys.all })

  cachedLists.forEach(([queryKey, cachedTasks]) => {
    if (!cachedTasks) return

    const [, rawUserId] = queryKey as ReturnType<typeof myTaskKeys.list>
    const userId = typeof rawUserId === 'number' ? rawUserId : null
    const shouldBeVisible = userId != null && task.assigned_user_id === userId
    const existingIndex = cachedTasks.findIndex((item) => item.id === task.id)

    if (shouldBeVisible) {
      const nextTasks =
        existingIndex >= 0
          ? cachedTasks.map((item) => (item.id === task.id ? task : item))
          : [task, ...cachedTasks]

      queryClient.setQueryData(queryKey, nextTasks)
      return
    }

    if (existingIndex >= 0) {
      queryClient.setQueryData(
        queryKey,
        cachedTasks.filter((item) => item.id !== task.id),
      )
    }
  })
}

function removeTaskFromMyTaskLists(queryClient: QueryClient, taskId: number) {
  queryClient.setQueriesData<Task[]>({ queryKey: myTaskKeys.all }, (current) => {
    if (!current) return current
    return current.filter((item) => item.id !== taskId)
  })
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
    onSuccess: (task) => {
      syncTaskInMyTaskLists(queryClient, task)
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
    },
  })
}

// Update task mutation
export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof tasksApi.updateTask>[1] }) =>
      tasksApi.updateTask(id, data),
    onSuccess: (task, { id }) => {
      queryClient.setQueryData(taskKeys.detail(id), task)
      syncTaskInPaginatedLists(queryClient, task)
      syncTaskInMyTaskLists(queryClient, task)
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
    },
  })
}

// Update task status mutation with optimistic update
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status, comment }: { id: number; status: string; comment?: string }) =>
      tasksApi.updateTaskStatus(id, status, comment),
    
    // Optimistic update
    onMutate: async ({ id, status }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: myTaskKeys.all })
      
      // Snapshot previous value
      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(id))
      const previousMyTasks = queryClient.getQueriesData<Task[]>({ queryKey: myTaskKeys.all })
      
      // Optimistically update the cache
      if (previousTask) {
        queryClient.setQueryData<Task>(taskKeys.detail(id), {
          ...previousTask,
          status: status as Task['status'],
          updated_at: new Date().toISOString(),
        })
      }

      queryClient.setQueriesData<Task[]>({ queryKey: myTaskKeys.all }, (current) => {
        if (!current) return current

        return current.map((task) =>
          task.id === id
            ? {
                ...task,
                status: status as Task['status'],
                updated_at: new Date().toISOString(),
              }
            : task,
        )
      })
      
      return { previousTask, previousMyTasks }
    },
    
    // Rollback on error
    onError: (_err, { id }, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(id), context.previousTask)
      }
      context?.previousMyTasks?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
    },

    onSuccess: (task, { id }) => {
      queryClient.setQueryData(taskKeys.detail(id), task)
      syncTaskInPaginatedLists(queryClient, task)
      syncTaskInMyTaskLists(queryClient, task)
    },
    
    // Always refetch after error or success
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
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
      await queryClient.cancelQueries({ queryKey: myTaskKeys.all })
      
      // Remove the task detail from cache
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) })
      removeTaskFromMyTaskLists(queryClient, id)
      
      return { id }
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
    },
  })
}

// Assign task to user mutation
export function useAssignTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, assignedUserId }: { id: number; assignedUserId: number | null }) =>
      tasksApi.assignTask(id, assignedUserId),
    onSuccess: (task, { id }) => {
      queryClient.setQueryData(taskKeys.detail(id), task)
      syncTaskInPaginatedLists(queryClient, task)
      syncTaskInMyTaskLists(queryClient, task)
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
    },
  })
}

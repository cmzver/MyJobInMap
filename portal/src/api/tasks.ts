import apiClient from './client'
import type { Task, TaskDetail, PaginatedResponse, TaskFilters, RepeatKind } from '@/types/task'
import type { TaskDispatchRow } from '@/components/tasks/taskDispatchOverviewModel'
import type { components } from '@/types/api.generated'

// Request payloads are derived from the backend OpenAPI schema (single source
// of truth) — regenerate with `npm run gen:api` after changing server schemas.
export type CreateTaskData = components['schemas']['TaskCreate']
export type UpdateTaskData = components['schemas']['TaskUpdate']
export type RelatedTasks = components['schemas']['RelatedTasksResponse']
export type RelatedTask = components['schemas']['RelatedTask']

/** История места заявки (task_id) либо подсказка для ещё не созданной (address). */
export type RelatedTasksQuery =
  | { task_id: number }
  | { address: string; system_id?: number | null; system_type?: string | null }

/** Больше заявок за запрос сервер не отдаёт (`size` ≤ 100) — больший размер даёт 422. */
export const MAX_TASKS_PAGE_SIZE = 100

/** Все заявки по фильтрам: страницы по {@link MAX_TASKS_PAGE_SIZE}, остальные параллельно. */
export async function fetchAllTaskPages(filters: URLSearchParams): Promise<Task[]> {
  const pageQuery = (page: number) => {
    const params = new URLSearchParams(filters)
    params.set('size', String(MAX_TASKS_PAGE_SIZE))
    params.set('page', String(page))
    return params
  }
  const first = await apiClient.get<PaginatedResponse<Task>>(`/tasks?${pageQuery(1)}`)
  const totalPages = first.data.pages ?? 1
  if (totalPages <= 1) return first.data.items
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiClient.get<PaginatedResponse<Task>>(`/tasks?${pageQuery(index + 2)}`),
    ),
  )
  return first.data.items.concat(...rest.map((response) => response.data.items))
}

export function taskFilterParams(filters?: TaskFilters): URLSearchParams {
    const params = new URLSearchParams()

    const statuses = filters?.statuses?.length ? filters.statuses : filters?.status ? [filters.status] : []
    const priorities = filters?.priorities?.length ? filters.priorities : filters?.priority ? [filters.priority] : []
    const assigneeIds = filters?.assignee_ids?.length
      ? filters.assignee_ids
      : typeof filters?.assignee_id === 'number'
        ? [filters.assignee_id]
        : []

    statuses.forEach((status) => params.append('status', status))
    priorities.forEach((priority) => params.append('priority', priority))
    assigneeIds.forEach((assigneeId) => params.append('assignee_id', String(assigneeId)))
    if (filters?.unassigned) params.set('unassigned', 'true')
    if (filters?.address_id) params.append('address_id', String(filters.address_id))
    filters?.repeat_kinds?.forEach((kind) => params.append('repeat_kind', kind))
    if (filters?.due) params.append('due', filters.due)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.sort) params.append('sort', filters.sort)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.size) params.append('size', String(filters.size))

    return params
}

export const tasksApi = {
  async getDispatch(filters?: TaskFilters): Promise<{ rows: TaskDispatchRow[]; total: number }> {
    const params = taskFilterParams(filters)
    params.delete('page')
    params.delete('size')
    const { data } = await apiClient.get('/tasks/dispatch', { params })
    return data
  },
  // Get paginated list of tasks
  async getTasks(filters?: TaskFilters): Promise<PaginatedResponse<Task>> {
    const params = taskFilterParams(filters)

    const { data } = await apiClient.get<PaginatedResponse<Task>>(
      `/tasks?${params.toString()}`
    )
    return data
  },

  async getRelated(query: RelatedTasksQuery): Promise<RelatedTasks> {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== null && value !== undefined && value !== ''),
    )
    const { data } = await apiClient.get<RelatedTasks>('/tasks/related', { params })
    return data
  },

  /** Отметить заявку повтором или дублем другой; null — снять отметку. */
  async markRepeat(
    id: number,
    originalTaskId: number | null,
    kind: RepeatKind = 'duplicate',
  ): Promise<TaskDetail> {
    const { data } = await apiClient.put<TaskDetail>(`/tasks/${id}/repeat-of`, {
      original_task_id: originalTaskId,
      kind,
    })
    return data
  },

  // Get single task by ID (detail endpoint returns the richer TaskResponse)
  async getTask(id: number): Promise<TaskDetail> {
    const { data } = await apiClient.get<TaskDetail>(`/tasks/${id}`)
    return data
  },

  // Create new task
  async createTask(taskData: CreateTaskData): Promise<Task> {
    const { data } = await apiClient.post<Task>('/tasks', taskData)
    return data
  },

  // Update existing task (via admin API)
  async updateTask(id: number, taskData: UpdateTaskData): Promise<Task> {
    const { data } = await apiClient.patch<Task>(`/admin/tasks/${id}`, taskData)
    return data
  },

  // Update task status
  async updateTaskStatus(id: number, status: string, comment = ''): Promise<Task> {
    const { data } = await apiClient.patch<Task>(`/tasks/${id}/status`, { status, comment })
    return data
  },

  /** Решено удалённо: назначить на себя при необходимости и закрыть одной операцией. */
  async resolveRemotely(id: number, comment: string): Promise<Task> {
    const { data } = await apiClient.post<Task>(`/tasks/${id}/resolve-remotely`, { comment })
    return data
  },

  // Delete task
  async deleteTask(id: number): Promise<void> {
    await apiClient.delete(`/tasks/${id}`)
  },

  // Assign task to user
  async assignTask(id: number, assignedUserId: number | null): Promise<Task> {
    const { data } = await apiClient.patch<Task>(`/tasks/${id}/assign`, {
      assigned_user_id: assignedUserId,
    })
    return data
  },
}

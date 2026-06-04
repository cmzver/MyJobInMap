import apiClient from './client'
import type { Task, PaginatedResponse, TaskFilters } from '@/types/task'
import type { components } from '@/types/api.generated'

// Request payloads are derived from the backend OpenAPI schema (single source
// of truth) — regenerate with `npm run gen:api` after changing server schemas.
export type CreateTaskData = components['schemas']['TaskCreate']
export type UpdateTaskData = components['schemas']['TaskUpdate']

export const tasksApi = {
  // Get paginated list of tasks
  async getTasks(filters?: TaskFilters): Promise<PaginatedResponse<Task>> {
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
    if (filters?.address_id) params.append('address_id', String(filters.address_id))
    if (filters?.search) params.append('search', filters.search)
    if (filters?.sort) params.append('sort', filters.sort)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.size) params.append('size', String(filters.size))

    const { data } = await apiClient.get<PaginatedResponse<Task>>(
      `/tasks?${params.toString()}`
    )
    return data
  },

  // Get single task by ID
  async getTask(id: number): Promise<Task> {
    const { data } = await apiClient.get<Task>(`/tasks/${id}`)
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

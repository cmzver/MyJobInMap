import apiClient from './client'
import type { Task, PaginatedResponse, TaskFilters } from '@/types/task'

export interface CreateTaskData {
  title: string
  description: string
  address: string
  customer_name?: string | null
  customer_phone?: string | null
  priority?: number | string
  assigned_user_id?: number | null
  is_paid?: boolean
  payment_amount?: number | null
  planned_date?: string | null
}

export interface UpdateTaskData {
  title?: string
  description?: string
  address?: string
  customer_name?: string | null
  customer_phone?: string | null
  priority?: number | string
  assigned_user_id?: number | null
  is_paid?: boolean
  payment_amount?: number | null
  planned_date?: string | null
}

export const tasksApi = {
  // Get paginated list of tasks
  async getTasks(filters?: TaskFilters): Promise<PaginatedResponse<Task>> {
    const params = new URLSearchParams()
    
    if (filters?.status) params.append('status', filters.status)
    if (filters?.priority) params.append('priority', filters.priority)
    if (filters?.assignee_id) params.append('assignee_id', String(filters.assignee_id))
    if (filters?.search) params.append('search', filters.search)
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
    const { data } = await apiClient.put<Task>(`/admin/tasks/${id}`, taskData)
    return data
  },

  // Update task status
  async updateTaskStatus(id: number, status: string): Promise<Task> {
    const { data } = await apiClient.put<Task>(`/tasks/${id}/status`, { status })
    return data
  },

  // Delete task
  async deleteTask(id: number): Promise<void> {
    await apiClient.delete(`/tasks/${id}`)
  },

  // Assign task to user
  async assignTask(id: number, assignedUserId: number | null): Promise<Task> {
    const { data } = await apiClient.put<Task>(`/tasks/${id}/assign`, {
      assigned_user_id: assignedUserId,
    })
    return data
  },
}

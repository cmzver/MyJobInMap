export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type TaskPriority = 'EMERGENCY' | 'URGENT' | 'CURRENT' | 'PLANNED'

export interface Task {
  id: number
  task_number: string | null
  title: string
  description: string
  raw_address: string
  customer_name: string | null
  customer_phone: string | null
  lat: number | null
  lon: number | null
  status: TaskStatus
  priority: TaskPriority
  is_paid: boolean
  amount: number | null
  payment_amount: number | null
  planned_date: string | null
  assigned_user_id: number | null
  assigned_user_name: string | null
  // Система и тип неисправности
  system_id: number | null
  system_type: string | null
  defect_type: string | null
  created_at: string
  updated_at: string
}

export interface Comment {
  id: number
  task_id: number
  author: string
  author_id: number | null
  text: string
  old_status: string | null
  new_status: string | null
  old_assignee: string | null
  new_assignee: string | null
  created_at: string
}

export interface TaskPhoto {
  id: number
  task_id: number
  filename: string
  original_name: string | null
  photo_type: 'before' | 'after' | 'completion'
  url: string
  created_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface TaskFilters {
  status?: TaskStatus
  priority?: TaskPriority
  assignee_id?: number
  search?: string
  date_from?: string
  date_to?: string
  page?: number
  size?: number
}

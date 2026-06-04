import type { components } from './api.generated'

// Domain enums and the task model are derived from the backend OpenAPI schema
// (single source of truth) — regenerate with `npm run gen:api`.
export type TaskStatus = components['schemas']['TaskStatus']
export type TaskPriority = components['schemas']['TaskPriority']
export type TaskSort = 'created_at_desc' | 'created_at_asc'

// List/map/card shape (carries comments_count). The detail endpoint returns the
// richer TaskDetail (with the full comments history).
export type Task = components['schemas']['TaskListResponse']
export type TaskDetail = components['schemas']['TaskResponse']

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
  statuses?: TaskStatus[]
  priority?: TaskPriority
  priorities?: TaskPriority[]
  assignee_id?: number
  assignee_ids?: number[]
  search?: string
  address_id?: number
  sort?: TaskSort
  date_from?: string
  date_to?: string
  page?: number
  size?: number
}

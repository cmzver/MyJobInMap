import type { TaskPriority, TaskSort, TaskStatus } from '@/types/task'

export interface TaskListUrlFilters {
  search?: string
  statuses?: readonly TaskStatus[]
  priorities?: readonly TaskPriority[]
  assigneeIds?: readonly number[]
  addressId?: number
  addressTitle?: string
  sort?: TaskSort
  groupBy?: 'status' | 'assignee' | 'priority' | ''
}

const appendUnique = (
  params: URLSearchParams,
  key: string,
  values: readonly (string | number)[] | undefined,
) => {
  if (!values) return
  new Set(values).forEach((value) => params.append(key, String(value)))
}

export function buildTaskListUrl(
  filters: TaskListUrlFilters = {},
  pathname = '/tasks',
): string {
  const params = new URLSearchParams()
  const search = filters.search?.trim()

  if (search) params.set('search', search)
  appendUnique(params, 'status', filters.statuses)
  appendUnique(params, 'priority', filters.priorities)
  appendUnique(
    params,
    'assignee',
    filters.assigneeIds?.filter((id) => Number.isInteger(id) && id > 0),
  )

  if (filters.addressId && filters.addressId > 0) {
    params.set('address_id', String(filters.addressId))
    if (filters.addressTitle?.trim()) {
      params.set('address_title', filters.addressTitle.trim())
    }
  }
  if (filters.sort && filters.sort !== 'created_at_desc') params.set('sort', filters.sort)
  if (filters.groupBy) params.set('group', filters.groupBy)

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

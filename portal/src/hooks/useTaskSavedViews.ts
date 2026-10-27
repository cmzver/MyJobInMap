import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TaskPriority, TaskSort, TaskStatus } from '@/types/task'

const STORAGE_KEY = 'tasks-saved-views-v1'
const VALID_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const VALID_PRIORITIES: TaskPriority[] = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED']
const VALID_SORTS: TaskSort[] = ['created_at_desc', 'created_at_asc']
const VALID_GROUPS = ['', 'status', 'assignee', 'priority']

export interface TaskSavedViewSettings {
  search: string
  statuses: TaskStatus[]
  priorities: TaskPriority[]
  assignees: string[]
  addressId: string
  addressTitle: string
  sort: TaskSort
  groupBy: string
}

export interface TaskSavedView {
  id: string
  name: string
  settings: TaskSavedViewSettings
}

const normalizeSettings = (value: unknown): TaskSavedViewSettings | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TaskSavedViewSettings>
  const search = typeof candidate.search === 'string' ? candidate.search.slice(0, 200) : ''
  const statuses = Array.isArray(candidate.statuses)
    ? candidate.statuses.filter((item): item is TaskStatus => VALID_STATUSES.includes(item as TaskStatus))
    : []
  const priorities = Array.isArray(candidate.priorities)
    ? candidate.priorities.filter((item): item is TaskPriority => VALID_PRIORITIES.includes(item as TaskPriority))
    : []
  const assignees = Array.isArray(candidate.assignees)
    ? candidate.assignees.filter((item): item is string => typeof item === 'string' && /^\d+$/.test(item))
    : []
  const addressId = typeof candidate.addressId === 'string' && /^\d+$/.test(candidate.addressId)
    ? candidate.addressId
    : ''
  const addressTitle = typeof candidate.addressTitle === 'string' ? candidate.addressTitle.slice(0, 200) : ''
  const sort = VALID_SORTS.includes(candidate.sort as TaskSort)
    ? candidate.sort as TaskSort
    : 'created_at_desc'
  const groupBy = VALID_GROUPS.includes(candidate.groupBy ?? '') ? candidate.groupBy ?? '' : ''

  return {
    search,
    statuses: Array.from(new Set(statuses)),
    priorities: Array.from(new Set(priorities)),
    assignees: Array.from(new Set(assignees)),
    addressId,
    addressTitle,
    sort,
    groupBy,
  }
}

export const parseTaskSavedViews = (rawValue: string | null): TaskSavedView[] => {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item): TaskSavedView[] => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Partial<TaskSavedView>
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
      const settings = normalizeSettings(candidate.settings)
      if (!candidate.id || typeof candidate.id !== 'string' || !name || !settings) return []
      return [{ id: candidate.id, name: name.slice(0, 40), settings }]
    })
  } catch {
    return []
  }
}

const sorted = (values: readonly string[]) => [...values].sort()

export const areTaskViewSettingsEqual = (
  left: TaskSavedViewSettings,
  right: TaskSavedViewSettings,
) => (
  left.search === right.search &&
  JSON.stringify(sorted(left.statuses)) === JSON.stringify(sorted(right.statuses)) &&
  JSON.stringify(sorted(left.priorities)) === JSON.stringify(sorted(right.priorities)) &&
  JSON.stringify(sorted(left.assignees)) === JSON.stringify(sorted(right.assignees)) &&
  left.addressId === right.addressId &&
  left.addressTitle === right.addressTitle &&
  left.sort === right.sort &&
  left.groupBy === right.groupBy
)

const loadViews = (storageKey: string) => {
  if (typeof window === 'undefined') return []
  return parseTaskSavedViews(window.localStorage.getItem(storageKey))
}

const createViewId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useTaskSavedViews(scope = 'default') {
  const storageKey = useMemo(() => `${STORAGE_KEY}:${scope}`, [scope])
  const [views, setViews] = useState<TaskSavedView[]>(() => loadViews(storageKey))

  useEffect(() => {
    setViews(loadViews(storageKey))
  }, [storageKey])

  const persist = useCallback((nextViews: TaskSavedView[]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(nextViews))
    setViews(nextViews)
  }, [storageKey])

  const saveView = useCallback((name: string, settings: TaskSavedViewSettings) => {
    const nextView: TaskSavedView = {
      id: createViewId(),
      name: name.trim().slice(0, 40),
      settings,
    }
    persist([...views, nextView])
    return nextView
  }, [persist, views])

  const deleteView = useCallback((id: string) => {
    persist(views.filter((view) => view.id !== id))
  }, [persist, views])

  return { views, saveView, deleteView }
}

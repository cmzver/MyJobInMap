import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import type { TaskPriority, TaskSort, TaskStatus } from '@/types/task'

const STORAGE_KEY = 'tasks-saved-views-v1'
const VALID_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const VALID_PRIORITIES: TaskPriority[] = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED']
const VALID_SORTS: TaskSort[] = ['created_at_desc', 'created_at_asc', 'due_at_asc']
const VALID_GROUPS = ['', 'status', 'assignee', 'priority']
const VALID_DISPLAY_MODES: TaskDisplayMode[] = ['list', 'dispatch']

export type TaskDisplayMode = 'list' | 'dispatch'

export interface TaskSavedViewSettings {
  search: string
  statuses: TaskStatus[]
  priorities: TaskPriority[]
  assignees: string[]
  addressId: string
  addressTitle: string
  sort: TaskSort
  groupBy: string
  displayMode: TaskDisplayMode
  repeat?: '' | 'duplicate' | 'return'
  due?: '' | 'overdue' | 'soon'
}

export interface TaskSavedView {
  id: string
  name: string
  settings: TaskSavedViewSettings
  shared?: boolean
  can_edit?: boolean
}

const normalizeSettings = (value: unknown): TaskSavedViewSettings | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TaskSavedViewSettings>
  const search = typeof candidate.search === 'string' ? candidate.search.slice(0, 200) : ''
  const statuses = Array.isArray(candidate.statuses)
    ? candidate.statuses.filter((item): item is TaskStatus =>
        VALID_STATUSES.includes(item as TaskStatus)
      )
    : []
  const priorities = Array.isArray(candidate.priorities)
    ? candidate.priorities.filter((item): item is TaskPriority =>
        VALID_PRIORITIES.includes(item as TaskPriority)
      )
    : []
  const assignees = Array.isArray(candidate.assignees)
    ? candidate.assignees.filter(
        (item): item is string => typeof item === 'string' && (item === 'unassigned' || /^\d+$/.test(item))
      )
    : []
  const addressId =
    typeof candidate.addressId === 'string' && /^\d+$/.test(candidate.addressId)
      ? candidate.addressId
      : ''
  const addressTitle =
    typeof candidate.addressTitle === 'string' ? candidate.addressTitle.slice(0, 200) : ''
  const sort = VALID_SORTS.includes(candidate.sort as TaskSort)
    ? (candidate.sort as TaskSort)
    : 'created_at_desc'
  const groupBy = VALID_GROUPS.includes(candidate.groupBy ?? '') ? (candidate.groupBy ?? '') : ''
  const displayMode = VALID_DISPLAY_MODES.includes(candidate.displayMode as TaskDisplayMode)
    ? (candidate.displayMode as TaskDisplayMode)
    : 'list'

  return {
    search,
    statuses: Array.from(new Set(statuses)),
    priorities: Array.from(new Set(priorities)),
    assignees: Array.from(new Set(assignees)),
    addressId,
    addressTitle,
    sort,
    groupBy,
    displayMode,
    ...(candidate.repeat !== undefined && { repeat: ['duplicate', 'return'].includes(candidate.repeat) ? candidate.repeat : '' }),
    ...(candidate.due !== undefined && { due: ['overdue', 'soon'].includes(candidate.due) ? candidate.due : '' }),
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
  right: TaskSavedViewSettings
) =>
  left.search === right.search &&
  JSON.stringify(sorted(left.statuses)) === JSON.stringify(sorted(right.statuses)) &&
  JSON.stringify(sorted(left.priorities)) === JSON.stringify(sorted(right.priorities)) &&
  JSON.stringify(sorted(left.assignees)) === JSON.stringify(sorted(right.assignees)) &&
  left.addressId === right.addressId &&
  left.addressTitle === right.addressTitle &&
  left.sort === right.sort &&
  left.groupBy === right.groupBy &&
  left.displayMode === right.displayMode &&
  (left.repeat ?? '') === (right.repeat ?? '') &&
  (left.due ?? '') === (right.due ?? '')

const loadViews = (storageKey: string) => {
  if (typeof window === 'undefined') return []
  return parseTaskSavedViews(window.localStorage.getItem(storageKey))
}

export function useTaskSavedViews(scope = 'default') {
  const storageKey = `${STORAGE_KEY}:${scope}`
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const key = ['task-views', scope]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(user),
    queryFn: async () => {
      const importedKey = `${storageKey}:imported`
      if (!window.localStorage.getItem(importedKey)) {
        for (const view of loadViews(storageKey)) {
          await apiClient.post('/task-views', {
            name: view.name, settings: view.settings, source_id: view.id,
          })
        }
        window.localStorage.setItem(importedKey, 'true')
      }
      const { data } = await apiClient.get<TaskSavedView[]>('/task-views')
      return data
    },
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const saveView = useCallback(async (name: string, settings: TaskSavedViewSettings, shared = false) => {
    const { data } = await apiClient.post<TaskSavedView>('/task-views', { name, settings, shared })
    await queryClient.invalidateQueries({ queryKey: ['task-views', scope] })
    return data
  }, [queryClient, scope])
  const deleteView = async (id: string) => {
    await apiClient.delete(`/task-views/${id}`)
    await refresh()
  }
  const shareView = async (view: TaskSavedView) => {
    await apiClient.put(`/task-views/${view.id}`, { ...view, shared: !view.shared })
    await refresh()
  }
  return { views: query.data ?? loadViews(storageKey), saveView, deleteView, shareView,
    isLoading: query.isPending, error: query.error }
}

import type { Task, TaskStatus } from '@/types/task'
import { normalizePriority } from '@/config/taskConstants'

export const dispatchStatuses: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']

export interface TaskDispatchRow {
  key: string
  assigneeName: string
  counts: Record<TaskStatus, number>
  active: number
  urgent: number
  total: number
}

const emptyStatusCounts = (): Record<TaskStatus, number> => ({
  NEW: 0,
  IN_PROGRESS: 0,
  DONE: 0,
  CANCELLED: 0,
})

export function buildTaskDispatchOverview(tasks: readonly Task[]): TaskDispatchRow[] {
  const rows = new Map<string, TaskDispatchRow>()

  for (const task of tasks) {
    const key = task.assigned_user_id ? String(task.assigned_user_id) : 'unassigned'
    const row = rows.get(key) ?? {
      key,
      assigneeName: task.assigned_user_name || 'Не назначен',
      counts: emptyStatusCounts(),
      active: 0,
      urgent: 0,
      total: 0,
    }

    row.counts[task.status] += 1
    row.total += 1

    const isActive = task.status === 'NEW' || task.status === 'IN_PROGRESS'
    if (isActive) {
      row.active += 1
      const priority = normalizePriority(task.priority)
      if (priority === 'URGENT' || priority === 'EMERGENCY') {
        row.urgent += 1
      }
    }

    rows.set(key, row)
  }

  return Array.from(rows.values()).sort((left, right) => {
    if (left.key === 'unassigned') return -1
    if (right.key === 'unassigned') return 1
    if (left.active !== right.active) return right.active - left.active
    return left.assigneeName.localeCompare(right.assigneeName, 'ru')
  })
}

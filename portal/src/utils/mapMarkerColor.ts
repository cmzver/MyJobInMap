import { STATUS_HEX, normalizePriority } from '@/config/taskConstants'
import type { TaskPriority, TaskStatus } from '@/types/task'

/** Красный маркера аварийной заявки (как в Android). */
export const EMERGENCY_MARKER_HEX = '#DC2626'

/** Чем важнее статус для диспетчера, тем выше: новые → в работе → закрытые. */
const STATUS_RANK: Record<TaskStatus, number> = {
  NEW: 4,
  IN_PROGRESS: 3,
  DONE: 2,
  CANCELLED: 1,
}

const OPEN_STATUSES = new Set<string>(['NEW', 'IN_PROGRESS'])

interface MarkerTask {
  status: TaskStatus | string
  priority?: TaskPriority | number | string | null
}

/** Доминирующий статус группы заявок в одной точке карты. */
export function getDominantStatus(tasks: readonly MarkerTask[]): TaskStatus {
  let best: TaskStatus = 'CANCELLED'
  let bestRank = 0
  for (const task of tasks) {
    const rank = STATUS_RANK[task.status as TaskStatus] ?? 0
    if (rank > bestRank) {
      bestRank = rank
      best = task.status as TaskStatus
    }
  }
  return best
}

/** Есть ли в группе открытая (новая или в работе) аварийная заявка. */
export function hasOpenEmergency(tasks: readonly MarkerTask[]): boolean {
  return tasks.some((task) => OPEN_STATUSES.has(task.status) && normalizePriority(task.priority) === 'EMERGENCY')
}

/**
 * Цвет маркера — по СТАТУСУ, как в Android: доминирующий статус группы,
 * а открытая аварийная заявка перекрашивает точку в красный.
 */
export function getMarkerColor(tasks: readonly MarkerTask[]): string {
  if (hasOpenEmergency(tasks)) return EMERGENCY_MARKER_HEX
  return STATUS_HEX[getDominantStatus(tasks)]
}

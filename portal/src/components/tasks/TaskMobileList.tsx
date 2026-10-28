import { Fragment } from 'react'
import { Calendar, ChevronDown, Clock, MapPin, User, UserPlus } from 'lucide-react'

import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import TaskNotificationBubble from '@/components/tasks/TaskNotificationBubble'
import type { TaskListGroup } from '@/components/tasks/taskListTypes'
import { formatDateTime, getSla } from '@/utils/dateFormat'

interface TaskMobileListProps {
  groups: TaskListGroup[]
  groupBy: string
  collapsedGroups: Set<string>
  selectedIds: Set<number>
  unreadByTaskId: Record<number, number>
  onToggleGroup: (key: string) => void
  onToggleSelection: (taskId: number) => void
  onOpenTask: (taskId: number) => void
}

export default function TaskMobileList({
  groups,
  groupBy,
  collapsedGroups,
  selectedIds,
  unreadByTaskId,
  onToggleGroup,
  onToggleSelection,
  onOpenTask,
}: TaskMobileListProps) {
  return (
    <div className="space-y-3 lg:hidden">
      {groups.map((group) => {
        const isCollapsed = Boolean(groupBy) && collapsedGroups.has(group.key)
        return (
          <Fragment key={group.key}>
            {groupBy && (
              <button
                type="button"
                onClick={() => onToggleGroup(group.key)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40"
              >
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                />
                <span className="font-medium text-gray-700 dark:text-gray-300">{group.label}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({group.items.length})
                </span>
              </button>
            )}
            {!isCollapsed &&
              group.items.map((task) => {
                const sla = getSla(task.planned_date, task.status)
                const unreadCount = unreadByTaskId[task.id] ?? 0
                const hasUnread = unreadCount > 0
                return (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task.id)}
                    className={`cursor-pointer rounded-lg border p-3 shadow-sm transition-colors ${
                      hasUnread
                        ? 'border-primary-200 bg-primary-50/50 dark:border-primary-900/40 dark:bg-primary-900/10'
                        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => onToggleSelection(task.id)}
                        className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        aria-label={`Выбрать заявку ${task.task_number || `#${task.id}`}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                            {task.task_number || `#${task.id}`}
                            {hasUnread && <TaskNotificationBubble count={unreadCount} />}
                          </span>
                          <span className="flex flex-shrink-0 items-center gap-1.5">
                            <PriorityBadge priority={task.priority} />
                            <StatusBadge status={task.status} />
                          </span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm font-medium text-gray-900 dark:text-white">
                          {(task.defect_type || task.title || '').replace(/^\[\d+\]\s*/, '') ||
                            'Без описания'}
                        </div>
                        {task.raw_address && (
                          <div className="mt-1 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            <span className="line-clamp-2">{task.raw_address}</span>
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3.5 w-3.5 flex-shrink-0" />
                            {task.assigned_user_name || 'Не назначен'}
                          </span>
                          {task.created_by_name && (
                            <span className="inline-flex items-center gap-1">
                              <UserPlus className="h-3.5 w-3.5 flex-shrink-0" />
                              {task.created_by_name}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            {formatDateTime(task.created_at)}
                          </span>
                          {sla.label && (
                            <span className={`inline-flex items-center gap-1 ${sla.tone}`}>
                              <Clock className="h-3.5 w-3.5" />
                              {sla.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </Fragment>
        )
      })}
    </div>
  )
}

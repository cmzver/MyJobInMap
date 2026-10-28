import { Fragment, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { Calendar, ChevronDown, Clock, MapPin, SlidersHorizontal, User } from 'lucide-react'

import Button from '@/components/Button'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import TaskNotificationBubble from '@/components/tasks/TaskNotificationBubble'
import type { TaskListGroup } from '@/components/tasks/taskListTypes'
import {
  getTaskTableColumnWidthCssVar,
  toggleableTaskTableColumns,
  type TaskTableColumnKey,
  type ToggleableTaskTableColumnKey,
} from '@/components/tasks/taskTableConfig'
import type { Task } from '@/types/task'
import { formatDateTime, getSla } from '@/utils/dateFormat'

interface TaskListTableProps {
  groups: TaskListGroup[]
  groupBy: string
  collapsedGroups: Set<string>
  selectedIds: Set<number>
  unreadByTaskId: Record<number, number>
  visibleColumns: Record<ToggleableTaskTableColumnKey, boolean>
  effectiveColumnWidths: Record<TaskTableColumnKey, number>
  visibleColumnCount: number
  visibleDataColumnCount: number
  isResizableEnabled: boolean
  isCompactView: boolean
  tableWidth: number
  allSelectedOnPage: boolean
  isColumnMenuOpen: boolean
  tableRef: RefObject<HTMLTableElement>
  columnMenuRef: RefObject<HTMLDivElement>
  onMeasureContainer: (node: HTMLDivElement | null) => void
  onColumnMenuToggle: () => void
  onColumnVisibilityToggle: (key: ToggleableTaskTableColumnKey) => void
  onResetVisibleColumns: () => void
  onResizeStart: (key: TaskTableColumnKey, event: ReactMouseEvent) => void
  onToggleSelectAll: () => void
  onToggleSelection: (taskId: number) => void
  onToggleGroup: (key: string) => void
  onOpenTask: (taskId: number) => void
}

const columnLabels: Record<ToggleableTaskTableColumnKey, string> = {
  number: '№',
  title: 'Заявка',
  address: 'Адрес',
  status: 'Статус',
  priority: 'Приоритет',
  assignee: 'Исполнитель',
  creator: 'Кем заведена',
  date: 'Дата',
  sla: 'Срок',
}

function renderTaskCell(task: Task, key: ToggleableTaskTableColumnKey, unreadCount: number) {
  const sla = getSla(task.planned_date, task.status)
  const hasUnread = unreadCount > 0

  switch (key) {
    case 'number':
      return (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm text-gray-900 dark:text-gray-100">
            {task.task_number || `#${task.id}`}
          </span>
          {hasUnread && <TaskNotificationBubble count={unreadCount} />}
        </div>
      )
    case 'title':
      return (
        <>
          <div className="min-w-0 line-clamp-1 text-sm font-medium text-gray-900 dark:text-white">
            {task.defect_type || task.title || 'Без описания'}
          </div>
          {(task.defect_type ? task.title : task.description) && (
            <div className="mt-0.5 min-w-0 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
              {task.defect_type ? task.title : task.description}
            </div>
          )}
        </>
      )
    case 'address':
      return (
        <div className="flex min-w-0 items-start gap-1.5">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="min-w-0 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
            {task.raw_address || '-'}
          </span>
        </div>
      )
    case 'status':
      return (
        <div className="tasks-badge-cell max-w-full overflow-hidden">
          <StatusBadge status={task.status} className="max-w-full truncate" />
        </div>
      )
    case 'priority':
      return (
        <div className="tasks-badge-cell max-w-full overflow-hidden">
          <PriorityBadge priority={task.priority} className="max-w-full truncate" />
        </div>
      )
    case 'assignee':
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <User className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="min-w-0 truncate text-sm text-gray-600 dark:text-gray-300">
            {task.assigned_user_name || '-'}
          </span>
        </div>
      )
    case 'creator':
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <User className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="min-w-0 truncate text-sm text-gray-600 dark:text-gray-300">
            {task.created_by_name || '-'}
          </span>
        </div>
      )
    case 'date':
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <Calendar className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="min-w-0 truncate text-sm text-gray-500 dark:text-gray-400">
            {formatDateTime(task.created_at)}
          </span>
        </div>
      )
    case 'sla':
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <Clock className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className={`min-w-0 truncate text-sm ${sla.tone}`}>{sla.label}</span>
        </div>
      )
    default:
      return null
  }
}

export default function TaskListTable({
  groups,
  groupBy,
  collapsedGroups,
  selectedIds,
  unreadByTaskId,
  visibleColumns,
  effectiveColumnWidths,
  visibleColumnCount,
  visibleDataColumnCount,
  isResizableEnabled,
  isCompactView,
  tableWidth,
  allSelectedOnPage,
  isColumnMenuOpen,
  tableRef,
  columnMenuRef,
  onMeasureContainer,
  onColumnMenuToggle,
  onColumnVisibilityToggle,
  onResetVisibleColumns,
  onResizeStart,
  onToggleSelectAll,
  onToggleSelection,
  onToggleGroup,
  onOpenTask,
}: TaskListTableProps) {
  const cellPadding = isCompactView ? 'px-4 py-2' : 'px-4 py-3'
  const visibleDataColumns = toggleableTaskTableColumns.filter(({ key }) => visibleColumns[key])
  const visibleColumnOrder: TaskTableColumnKey[] = [
    'select',
    ...visibleDataColumns.map(({ key }) => key),
  ]

  const renderResizeHandle = (key: TaskTableColumnKey) => {
    if (!isResizableEnabled || visibleColumnOrder[visibleColumnOrder.length - 1] === key) {
      return null
    }
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(event) => onResizeStart(key, event)}
        className="group absolute right-0 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center"
      >
        <span className="h-[calc(100%-0.875rem)] w-px rounded-full bg-gray-200 transition-colors group-hover:bg-primary-400 dark:bg-gray-600 dark:group-hover:bg-primary-400" />
      </div>
    )
  }

  return (
    <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800 lg:block">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Колонки: {visibleDataColumnCount}/{toggleableTaskTableColumns.length}
        </div>
        <div ref={columnMenuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onColumnMenuToggle}
            className="h-8 px-2.5"
            aria-expanded={isColumnMenuOpen}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Колонки
          </Button>
          {isColumnMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Видимость колонок
                </span>
                <button
                  type="button"
                  onClick={onResetVisibleColumns}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  Сбросить
                </button>
              </div>
              <div className="space-y-1">
                {toggleableTaskTableColumns.map((column) => {
                  const isLastVisibleColumn =
                    visibleColumns[column.key] && visibleDataColumnCount === 1
                  return (
                    <label
                      key={column.key}
                      className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition ${
                        isLastVisibleColumn
                          ? 'text-gray-400 dark:text-gray-500'
                          : 'cursor-pointer text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <span>{column.label}</span>
                      <input
                        type="checkbox"
                        checked={visibleColumns[column.key]}
                        onChange={() => onColumnVisibilityToggle(column.key)}
                        disabled={isLastVisibleColumn}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <div ref={onMeasureContainer} className="overflow-x-auto">
        <table
          ref={tableRef}
          className={`divide-y divide-gray-200 dark:divide-gray-700 ${isResizableEnabled ? 'table-fixed' : 'min-w-full'}`}
          style={isResizableEnabled ? { width: `${tableWidth}px` } : undefined}
        >
          {isResizableEnabled && (
            <colgroup>
              {visibleColumnOrder.map((key) => (
                <col
                  key={key}
                  style={{
                    width: `var(${getTaskTableColumnWidthCssVar(key)}, ${effectiveColumnWidths[key]}px)`,
                  }}
                />
              ))}
            </colgroup>
          )}
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th
                className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}
              >
                <input
                  type="checkbox"
                  checked={allSelectedOnPage}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  aria-label="Выбрать все на странице"
                />
                {renderResizeHandle('select')}
              </th>
              {visibleDataColumns.map(({ key }) => (
                <th
                  key={key}
                  className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}
                >
                  {columnLabels[key]}
                  {renderResizeHandle(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {groups.map((group) => {
              const isCollapsed = Boolean(groupBy) && collapsedGroups.has(group.key)
              return (
                <Fragment key={group.key}>
                  {groupBy && (
                    <tr className="bg-gray-50 dark:bg-gray-900/40">
                      <td colSpan={visibleColumnCount} className={cellPadding}>
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                          onClick={() => onToggleGroup(group.key)}
                          aria-expanded={!isCollapsed}
                        >
                          <ChevronDown
                            className={`h-4 w-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                          />
                          <span className="font-medium">{group.label}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({group.items.length})
                          </span>
                        </button>
                      </td>
                    </tr>
                  )}
                  {!isCollapsed &&
                    group.items.map((task) => {
                      const unreadCount = unreadByTaskId[task.id] ?? 0
                      const hasUnread = unreadCount > 0
                      return (
                        <tr
                          key={task.id}
                          onClick={() => onOpenTask(task.id)}
                          className={`cursor-pointer transition-colors ${
                            hasUnread
                              ? 'bg-primary-50/40 hover:bg-primary-50/70 dark:bg-primary-900/10 dark:hover:bg-primary-900/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <td
                            className={`${cellPadding} whitespace-nowrap`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(task.id)}
                              onChange={() => onToggleSelection(task.id)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              aria-label={`Выбрать заявку ${task.task_number || `#${task.id}`}`}
                            />
                          </td>
                          {visibleDataColumns.map(({ key }) => (
                            <td
                              key={key}
                              className={`${cellPadding} overflow-hidden ${key === 'number' ? 'whitespace-nowrap' : ''}`}
                            >
                              {renderTaskCell(task, key, unreadCount)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

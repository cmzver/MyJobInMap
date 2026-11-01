import { Fragment, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

import Button from '@/components/Button'
import PriorityBadge from '@/components/PriorityBadge'
import RepeatBadge from '@/components/tasks/RepeatBadge'
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
import { formatDateOnly, formatDateTime, getSla } from '@/utils/dateFormat'

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
  const sla = getSla(task.due_at ?? task.planned_date, task.status)
  const hasUnread = unreadCount > 0

  switch (key) {
    case 'number':
      return (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs text-gray-900 dark:text-gray-100">
            {task.task_number || `#${task.id}`}
          </span>
          {hasUnread && <TaskNotificationBubble count={unreadCount} />}
        </div>
      )
    case 'title': {
      const headline = task.defect_type || task.title || 'Без описания'
      const detail = task.defect_type ? task.title : task.description
      return (
        <div className="flex min-w-0 items-center gap-2" title={detail ? `${headline} — ${detail}` : headline}>
          <RepeatBadge repeat={task.repeat_of} className="shrink-0" />
          <span className="min-w-0 truncate">
            <span className="font-medium text-gray-900 dark:text-white">{headline}</span>
            {detail && <span className="text-gray-500 dark:text-gray-400"> · {detail}</span>}
          </span>
        </div>
      )
    }
    case 'address':
      return (
        <span className="block min-w-0 truncate text-gray-600 dark:text-gray-300" title={task.raw_address || undefined}>
          {task.raw_address || '-'}
        </span>
      )
    case 'status':
      return (
        <div className="max-w-full overflow-hidden">
          <StatusBadge status={task.status} className="max-w-full truncate" />
        </div>
      )
    case 'priority':
      return (
        <div className="max-w-full overflow-hidden">
          <PriorityBadge priority={task.priority} className="max-w-full truncate" />
        </div>
      )
    case 'assignee':
      return (
        <span className="block min-w-0 truncate text-gray-600 dark:text-gray-300">
          {task.assigned_user_name || '-'}
        </span>
      )
    case 'creator':
      return (
        <span className="block min-w-0 truncate text-gray-600 dark:text-gray-300">
          {task.created_by_name || '-'}
        </span>
      )
    case 'date':
      return (
        <span className="block min-w-0 truncate whitespace-nowrap text-gray-500 dark:text-gray-400" title={formatDateTime(task.created_at)}>
          {formatDateOnly(task.created_at)}
        </span>
      )
    case 'sla':
      return (
        <span className={`block min-w-0 truncate ${sla.tone}`}>{sla.label}</span>
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
  const cellPadding = isCompactView ? 'py-1.5' : ''
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
        className="group absolute bottom-1.5 right-0 top-1.5 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center"
      >
        <span className="h-full w-px bg-transparent transition-colors group-hover:bg-primary-400" />
      </div>
    )
  }

  return (
    <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white transition-colors dark:border-gray-700 dark:bg-gray-800 lg:block">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-1 dark:border-gray-700">
        <div className="eyebrow">
          Колонки {visibleDataColumnCount}/{toggleableTaskTableColumns.length}
        </div>
        <div ref={columnMenuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onColumnMenuToggle}
            className="h-7 px-2"
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
      <div ref={onMeasureContainer} className="tasks-table-scroll overflow-x-auto">
        <table
          ref={tableRef}
          className={`data-table ${isResizableEnabled ? 'table-fixed' : 'min-w-full'}`}
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
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="relative w-10 overflow-hidden">
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
                <th key={key} className="relative overflow-hidden">
                  <span className="block truncate pr-2" title={columnLabels[key]}>
                    {columnLabels[key]}
                  </span>
                  {renderResizeHandle(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                          className={`cursor-pointer ${
                            hasUnread
                              ? 'bg-primary-50/40 hover:bg-primary-50/70 dark:bg-primary-900/10 dark:hover:bg-primary-900/20'
                              : ''
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

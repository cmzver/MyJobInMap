import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { showApiError } from '@/utils/apiError'
import { Plus, RefreshCw, AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUnreadTaskNotifications } from '@/hooks/useNotifications'
import { useTasks } from '@/hooks/useTasks'
import { usePortalInterfaceSettings } from '@/hooks/useSettings'
import { useUsers } from '@/hooks/useUsers'
import { tasksApi } from '@/api/tasks'
import type { TaskStatus, TaskPriority, TaskFilters, Task, TaskSort } from '@/types/task'
import {
  normalizePriority,
  getPriorityLabel as getPriorityLabelFn,
  getStatusLabel as getStatusLabelFn,
  getStatusCommentCopy,
  isStatusTransitionAllowed,
} from '@/config/taskConstants'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import { SkeletonTaskList } from '@/components/Skeleton'
import Pagination from '@/components/Pagination'
import EmptyState from '@/components/EmptyState'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import TaskFiltersPanel, { type ActiveTaskFilter } from '@/components/tasks/TaskFiltersPanel'
import TaskBulkActions from '@/components/tasks/TaskBulkActions'
import TaskListTable from '@/components/tasks/TaskListTable'
import TaskMobileList from '@/components/tasks/TaskMobileList'
import type { TaskListGroup } from '@/components/tasks/taskListTypes'
import {
  defaultVisibleTaskTableColumns as defaultVisibleColumns,
  getTaskTableColumnWidthCssVar as getColumnWidthCssVar,
  getVisibleTaskTableColumnOrder as getVisibleColumnOrder,
  toggleableTaskTableColumns as toggleableColumns,
  type TaskTableColumnKey as ColumnKey,
  type ToggleableTaskTableColumnKey as ToggleableColumnKey,
} from '@/components/tasks/taskTableConfig'
import { useAuthStore } from '@/store/authStore'
import { isAssignableRole } from '@/types/user'
import {
  areTaskViewSettingsEqual,
  useTaskSavedViews,
  type TaskSavedView,
  type TaskSavedViewSettings,
} from '@/hooks/useTaskSavedViews'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const SEARCH_DEBOUNCE_MS = 700
const COLUMN_STORAGE_KEY = 'tasks-table-column-widths'
const COLUMN_VISIBILITY_STORAGE_KEY = 'tasks-table-visible-columns'

const defaultColumnWidths: Record<ColumnKey, number> = {
  select: 44,
  number: 90,
  title: 240,
  address: 260,
  status: 130,
  priority: 130,
  assignee: 160,
  date: 150,
  sla: 140,
}

const columnMinWidths: Record<ColumnKey, number> = {
  select: 28,
  number: 54,
  title: 88,
  address: 96,
  status: 72,
  priority: 72,
  assignee: 88,
  date: 84,
  sla: 72,
}

const columnMaxWidths: Record<ColumnKey, number> = {
  select: 80,
  number: 320,
  title: 900,
  address: 900,
  status: 360,
  priority: 360,
  assignee: 520,
  date: 360,
  sla: 320,
}

const clampColumnWidth = (key: ColumnKey, width: number) =>
  Math.min(columnMaxWidths[key], Math.max(columnMinWidths[key], width))

const distributeColumnWidths = (
  widths: Record<ColumnKey, number>,
  visibleColumnOrder: ColumnKey[],
  delta: number,
  mode: 'shrink' | 'grow'
) => {
  if (delta <= 0) return widths

  const adjustableColumns = visibleColumnOrder.map((key) => {
    const currentWidth = widths[key]
    const limit = mode === 'shrink' ? columnMinWidths[key] : columnMaxWidths[key]
    const adjustable = Math.max(0, mode === 'shrink' ? currentWidth - limit : limit - currentWidth)
    return {
      key,
      currentWidth,
      adjustable,
    }
  })

  const totalAdjustable = adjustableColumns.reduce((total, column) => total + column.adjustable, 0)
  if (totalAdjustable <= 0) return widths

  // Weight the share each column gives up / takes on by its current width, so every
  // column changes by roughly the same percentage. Capped by each column's room
  // (adjustable), with the largest-remainder pass below mopping up the leftover px.
  const totalRoomWeight = adjustableColumns.reduce(
    (total, column) => (column.adjustable > 0 ? total + column.currentWidth : total),
    0
  )

  const normalized = adjustableColumns.map((column) => {
    const weight =
      column.adjustable > 0 && totalRoomWeight > 0 ? column.currentWidth / totalRoomWeight : 0
    const rawChange = delta * weight
    const change = Math.min(column.adjustable, Math.floor(rawChange))
    return {
      key: column.key,
      currentWidth: column.currentWidth,
      adjustable: column.adjustable,
      change,
      fraction: rawChange - change,
    }
  })

  let applied = normalized.reduce((total, column) => total + column.change, 0)
  let remainder = Math.min(delta - applied, totalAdjustable - applied)

  if (remainder > 0) {
    const sortedByFraction = [...normalized]
      .filter((column) => column.adjustable > column.change)
      .sort((left, right) => right.fraction - left.fraction)

    while (remainder > 0 && sortedByFraction.length > 0) {
      let changedInPass = false

      for (const candidate of sortedByFraction) {
        if (remainder <= 0) break
        const column = normalized.find((entry) => entry.key === candidate.key)
        if (!column || column.change >= column.adjustable) continue
        column.change += 1
        applied += 1
        remainder -= 1
        changedInPass = true
      }

      if (!changedInPass) break
    }
  }

  const next = { ...widths }
  normalized.forEach((column) => {
    const width =
      mode === 'shrink' ? column.currentWidth - column.change : column.currentWidth + column.change
    next[column.key] = clampColumnWidth(column.key, width)
  })

  return next
}

const fitColumnWidthsToContainer = (
  widths: Record<ColumnKey, number>,
  visibleColumnOrder: ColumnKey[],
  containerWidth: number
) => {
  const targetWidth = Math.floor(containerWidth)
  if (targetWidth <= 0) return widths

  const currentTotal = visibleColumnOrder.reduce((total, key) => total + widths[key], 0)
  const minTotal = visibleColumnOrder.reduce((total, key) => total + columnMinWidths[key], 0)
  const maxTotal = visibleColumnOrder.reduce((total, key) => total + columnMaxWidths[key], 0)
  const boundedTarget = Math.min(maxTotal, Math.max(targetWidth, minTotal))

  if (currentTotal === boundedTarget) return widths

  return currentTotal > boundedTarget
    ? distributeColumnWidths(widths, visibleColumnOrder, currentTotal - boundedTarget, 'shrink')
    : distributeColumnWidths(widths, visibleColumnOrder, boundedTarget - currentTotal, 'grow')
}

const sanitizeColumnWidths = (widths?: Partial<Record<ColumnKey, number>>) => {
  const next = { ...defaultColumnWidths }

  Object.keys(next).forEach((key) => {
    const typedKey = key as ColumnKey
    const value = widths?.[typedKey]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      next[typedKey] = clampColumnWidth(typedKey, value)
    }
  })

  const totalWidth = (Object.keys(next) as ColumnKey[]).reduce((total, key) => total + next[key], 0)
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const maxReasonableTotal = Math.max(viewportWidth * 2.5, 2400)

  if (totalWidth > maxReasonableTotal) {
    return { ...defaultColumnWidths }
  }

  return next
}

const loadColumnWidths = (): Record<ColumnKey, number> => {
  if (typeof window === 'undefined') return defaultColumnWidths

  try {
    const stored = localStorage.getItem(COLUMN_STORAGE_KEY)
    if (!stored) return defaultColumnWidths
    const parsed = JSON.parse(stored) as Partial<Record<ColumnKey, number>>
    return sanitizeColumnWidths(parsed)
  } catch {
    return defaultColumnWidths
  }
}

const loadVisibleColumns = (): Record<ToggleableColumnKey, boolean> => {
  if (typeof window === 'undefined') return defaultVisibleColumns

  try {
    const stored = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY)
    if (!stored) return defaultVisibleColumns
    const parsed = JSON.parse(stored) as Partial<Record<ToggleableColumnKey, boolean>>
    const next = { ...defaultVisibleColumns }

    Object.keys(next).forEach((key) => {
      const typedKey = key as ToggleableColumnKey
      if (typeof parsed[typedKey] === 'boolean') {
        next[typedKey] = parsed[typedKey]
      }
    })

    return next
  } catch {
    return defaultVisibleColumns
  }
}

const TASK_STATUS_VALUES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const TASK_PRIORITY_VALUES: TaskPriority[] = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED']

const sanitizeTaskStatuses = (values: string[]): TaskStatus[] =>
  Array.from(
    new Set(
      values.filter((value): value is TaskStatus =>
        TASK_STATUS_VALUES.includes(value as TaskStatus)
      )
    )
  )

const sanitizeTaskPriorities = (values: string[]): TaskPriority[] =>
  Array.from(
    new Set(
      values.filter((value): value is TaskPriority =>
        TASK_PRIORITY_VALUES.includes(value as TaskPriority)
      )
    )
  )

const sanitizeAssigneeFilters = (values: string[]): string[] =>
  Array.from(new Set(values.filter((value) => /^\d+$/.test(value))))

const areStringArraysEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

export default function TasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const savedViewScope = `${user?.organizationId ?? 'global'}:${user?.id ?? 'anonymous'}`
  const { views: savedViews, saveView, deleteView } = useTaskSavedViews(savedViewScope)
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(loadColumnWidths)
  const [visibleColumns, setVisibleColumns] =
    useState<Record<ToggleableColumnKey, boolean>>(loadVisibleColumns)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const resizeState = useRef<{
    key: ColumnKey
    startX: number
    startWidths: Record<ColumnKey, number>
    latestWidths: Record<ColumnKey, number>
    changed: boolean
    previousCursor: string
    previousUserSelect: string
  } | null>(null)
  const columnMenuRef = useRef<HTMLDivElement | null>(null)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [tableContainerWidth, setTableContainerWidth] = useState(0)
  // Flag to prevent URL→state effect from firing when we just pushed state→URL
  const isSyncingToUrl = useRef(false)
  const initialPage = Number(searchParams.get('page') || 1)
  const [page, setPage] = useState(() =>
    Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1
  )
  const initialSize = Number(searchParams.get('size') || PAGE_SIZE)
  const [pageSize, setPageSize] = useState(() =>
    Number.isFinite(initialSize) && initialSize > 0 ? Math.trunc(initialSize) : PAGE_SIZE
  )
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>(() =>
    sanitizeTaskStatuses(searchParams.getAll('status'))
  )
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>(() =>
    sanitizeTaskPriorities(searchParams.getAll('priority'))
  )
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>(() =>
    sanitizeAssigneeFilters(searchParams.getAll('assignee'))
  )
  const [addressIdFilter, setAddressIdFilter] = useState<string>(
    () => searchParams.get('address_id') || ''
  )
  const [addressTitleFilter, setAddressTitleFilter] = useState<string>(
    () => searchParams.get('address_title') || ''
  )
  const [sortBy, setSortBy] = useState<TaskSort>(() => {
    const value = searchParams.get('sort')
    return value === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc'
  })
  const [groupBy, setGroupBy] = useState(() => {
    const value = searchParams.get('group') || ''
    return ['status', 'assignee', 'priority'].includes(value) ? value : ''
  })
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() =>
    ['status', 'priority', 'assignee', 'address_id'].some((key) => searchParams.has(key))
  )
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [showBulkStatusCommentModal, setShowBulkStatusCommentModal] = useState(false)
  const [pendingBulkStatus, setPendingBulkStatus] = useState<TaskStatus | null>(null)
  const [pendingBulkStatusIds, setPendingBulkStatusIds] = useState<number[]>([])
  const [pendingBulkSkippedCount, setPendingBulkSkippedCount] = useState(0)
  const [bulkStatusComment, setBulkStatusComment] = useState('')
  const [bulkStatusCommentError, setBulkStatusCommentError] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')
  const [bulkPlannedDate, setBulkPlannedDate] = useState('')

  const currentSavedViewSettings = useMemo<TaskSavedViewSettings>(
    () => ({
      search,
      statuses: statusFilter,
      priorities: priorityFilter,
      assignees: assigneeFilter,
      addressId: addressIdFilter,
      addressTitle: addressTitleFilter,
      sort: sortBy,
      groupBy,
    }),
    [
      addressIdFilter,
      addressTitleFilter,
      assigneeFilter,
      groupBy,
      priorityFilter,
      search,
      sortBy,
      statusFilter,
    ]
  )
  const activeSavedViewId = useMemo(
    () =>
      savedViews.find((view) => areTaskViewSettingsEqual(view.settings, currentSavedViewSettings))
        ?.id ?? '',
    [currentSavedViewSettings, savedViews]
  )

  // Build filters object
  const filters: TaskFilters = useMemo(
    () => ({
      page,
      size: pageSize,
      sort: sortBy,
      ...(addressIdFilter ? { address_id: Number(addressIdFilter) || undefined } : {}),
      ...(search && { search }),
      ...(statusFilter.length > 0 && { statuses: statusFilter }),
      ...(priorityFilter.length > 0 && { priorities: priorityFilter }),
      ...(assigneeFilter.length > 0 && {
        assignee_ids: assigneeFilter.map(Number).filter((value) => Number.isFinite(value)),
      }),
    }),
    [page, pageSize, sortBy, search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter]
  )

  const { data: interfaceSettings } = usePortalInterfaceSettings()
  const defaultPageSize = Math.max(1, Number(interfaceSettings?.tasks_per_page ?? PAGE_SIZE))
  const pageSizeOptions = useMemo(
    () =>
      Array.from(new Set([PAGE_SIZE, defaultPageSize, ...PAGE_SIZE_OPTIONS])).sort((a, b) => a - b),
    [defaultPageSize]
  )
  const autoRefreshIntervalMs = useMemo(() => {
    const seconds = Number(interfaceSettings?.auto_refresh_interval ?? 0)
    if (!Number.isFinite(seconds) || seconds <= 0) return false
    return Math.trunc(seconds) * 1000
  }, [interfaceSettings?.auto_refresh_interval])
  const { data, isLoading, isError, error, refetch, isFetching } = useTasks(filters, {
    refetchInterval: autoRefreshIntervalMs,
  })
  const { data: unreadTaskNotifications = [] } = useUnreadTaskNotifications({
    enabled: Boolean(user),
  })
  const isResizableEnabled = interfaceSettings?.enable_resizable_columns ?? true
  const isCompactView = interfaceSettings?.compact_table_view ?? false
  const { data: users = [] } = useUsers()
  const assignableUsers = users.filter((user) => user.is_active && isAssignableRole(user.role))
  const prevUnreadRef = useRef<Record<number, number>>({})
  const unreadByTaskId = useMemo(() => {
    const map: Record<number, number> = {}

    for (const notification of unreadTaskNotifications) {
      if (notification.task_id == null) continue
      map[notification.task_id] = (map[notification.task_id] ?? 0) + 1
    }

    // Stabilize reference: return previous object if values are the same
    const prev = prevUnreadRef.current
    const keys = Object.keys(map)
    const prevKeys = Object.keys(prev)
    if (keys.length === prevKeys.length && keys.every((k) => prev[Number(k)] === map[Number(k)])) {
      return prev
    }
    prevUnreadRef.current = map
    return map
  }, [unreadTaskNotifications])
  const visibleDataColumnCount = useMemo(
    () => toggleableColumns.filter((column) => visibleColumns[column.key]).length,
    [visibleColumns]
  )
  const visibleColumnCount = visibleDataColumnCount + 1
  const visibleColumnOrder = useMemo(() => getVisibleColumnOrder(visibleColumns), [visibleColumns])
  const effectiveColumnWidths = useMemo(() => {
    const sanitized = sanitizeColumnWidths(columnWidths)
    if (!isResizableEnabled || tableContainerWidth <= 0) {
      return sanitized
    }
    return fitColumnWidthsToContainer(sanitized, visibleColumnOrder, tableContainerWidth)
  }, [columnWidths, isResizableEnabled, tableContainerWidth, visibleColumnOrder])
  const resizableTableWidth = useMemo(
    () => visibleColumnOrder.reduce((total, key) => total + effectiveColumnWidths[key], 0),
    [effectiveColumnWidths, visibleColumnOrder]
  )

  // Handle search with debounce effect (reset page on search)
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleStatusFilterChange = (values: string[]) => {
    setStatusFilter(sanitizeTaskStatuses(values))
    setPage(1)
  }

  const handlePriorityFilterChange = (values: string[]) => {
    setPriorityFilter(sanitizeTaskPriorities(values))
    setPage(1)
  }

  const handleAssigneeFilterChange = (values: string[]) => {
    setAssigneeFilter(sanitizeAssigneeFilters(values))
    setPage(1)
  }

  const handleSortChange = (value: string) => {
    setSortBy(value === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc')
    setPage(1)
  }

  const toggleQuickStatus = (status: TaskStatus) => {
    setStatusFilter((current) => (current.length === 1 && current[0] === status ? [] : [status]))
    setPage(1)
  }

  const toggleUrgentPriorities = () => {
    setPriorityFilter((current) => {
      const isUrgentView =
        current.length === 2 && current.includes('EMERGENCY') && current.includes('URGENT')
      return isUrgentView ? [] : ['EMERGENCY', 'URGENT']
    })
    setPage(1)
  }

  const applySavedView = (view: TaskSavedView) => {
    setSearch(view.settings.search)
    setSearchInput(view.settings.search)
    setStatusFilter(view.settings.statuses)
    setPriorityFilter(view.settings.priorities)
    setAssigneeFilter(view.settings.assignees)
    setAddressIdFilter(view.settings.addressId)
    setAddressTitleFilter(view.settings.addressTitle)
    setSortBy(view.settings.sort)
    setGroupBy(view.settings.groupBy)
    setCollapsedGroups(new Set())
    setPage(1)
    toast.success(`Применён вид «${view.name}»`)
  }

  const saveCurrentView = (name: string, settings: TaskSavedViewSettings) => {
    try {
      saveView(name, settings)
      toast.success(`Вид «${name}» сохранён`)
    } catch {
      toast.error('Не удалось сохранить вид в браузере')
    }
  }

  const deleteSavedView = (view: TaskSavedView) => {
    if (!window.confirm(`Удалить сохранённый вид «${view.name}»?`)) return
    try {
      deleteView(view.id)
      toast.success(`Вид «${view.name}» удалён`)
    } catch {
      toast.error('Не удалось удалить сохранённый вид')
    }
  }

  const applyColumnWidth = useCallback((key: ColumnKey, width: number) => {
    if (!tableRef.current) return
    tableRef.current.style.setProperty(getColumnWidthCssVar(key), `${width}px`)
  }, [])

  const applyColumnWidths = useCallback(
    (widths: Record<ColumnKey, number>) => {
      const columnKeys = Object.keys(widths) as ColumnKey[]
      columnKeys.forEach((key) => {
        applyColumnWidth(key, widths[key])
      })
    },
    [applyColumnWidth]
  )

  const handleResizeMove = useCallback(
    (event: MouseEvent) => {
      const active = resizeState.current
      if (!active) return
      const { key, startX, startWidths } = active
      // The handle sits on the column's right edge, so only the columns to the *right*
      // absorb the change — columns to the left stay anchored in place.
      const startIndex = visibleColumnOrder.indexOf(key)
      const others = startIndex >= 0 ? visibleColumnOrder.slice(startIndex + 1) : []
      if (others.length === 0) return

      const startWidth = startWidths[key]
      const desiredWidth = clampColumnWidth(key, startWidth + (event.clientX - startX))
      const diff = desiredWidth - startWidth
      if (diff === 0) return

      // The dragged column changes; the difference is absorbed proportionally by the
      // columns to its right so the table stays exactly the container width (no scroll).
      // The column can only grow until *every* column to its right has hit its min width.
      const sumOthers = (widths: Record<ColumnKey, number>) =>
        others.reduce((total, columnKey) => total + widths[columnKey], 0)

      const beforeOthers = sumOthers(startWidths)
      const adjusted = distributeColumnWidths(
        startWidths,
        others,
        Math.abs(diff),
        diff > 0 ? 'shrink' : 'grow'
      )
      const appliedToOthers = Math.abs(sumOthers(adjusted) - beforeOthers)

      const next = {
        ...adjusted,
        [key]: startWidth + (diff > 0 ? appliedToOthers : -appliedToOthers),
      }

      const prev = active.latestWidths
      if (
        (Object.keys(next) as ColumnKey[]).every((columnKey) => prev[columnKey] === next[columnKey])
      ) {
        return
      }

      active.latestWidths = next
      active.changed = true
      applyColumnWidths(next)
    },
    [applyColumnWidths, visibleColumnOrder]
  )

  const stopResize = useCallback(() => {
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', stopResize)
    const activeResize = resizeState.current
    resizeState.current = null

    if (!activeResize) return

    document.body.style.cursor = activeResize.previousCursor
    document.body.style.userSelect = activeResize.previousUserSelect

    if (!activeResize.changed) return

    setColumnWidths(sanitizeColumnWidths(activeResize.latestWidths))
  }, [handleResizeMove])

  const startResize = useCallback(
    (key: ColumnKey, event: React.MouseEvent) => {
      if (!isResizableEnabled) return
      event.preventDefault()
      event.stopPropagation()
      resizeState.current = {
        key,
        startX: event.clientX,
        startWidths: effectiveColumnWidths,
        latestWidths: effectiveColumnWidths,
        changed: false,
        previousCursor: document.body.style.cursor,
        previousUserSelect: document.body.style.userSelect,
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', stopResize)
    },
    [effectiveColumnWidths, handleResizeMove, isResizableEnabled, stopResize]
  )

  useEffect(() => {
    applyColumnWidths(effectiveColumnWidths)
  }, [applyColumnWidths, effectiveColumnWidths])

  useEffect(() => {
    setColumnWidths((prev) => {
      const next = sanitizeColumnWidths(prev)
      const hasChanges = (Object.keys(prev) as ColumnKey[]).some((key) => prev[key] !== next[key])
      return hasChanges ? next : prev
    })
  }, [])

  // Callback ref so we measure the moment the table container actually mounts.
  // It renders only after data loads (a skeleton shows while loading), so a plain
  // mount effect would fire too early with a null ref and never re-run.
  const measureTableContainer = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    tableContainerRef.current = node
    if (!node) return

    const updateWidth = () => setTableContainerWidth(Math.floor(node.clientWidth))
    updateWidth()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)
    resizeObserverRef.current = observer
  }, [])

  useEffect(() => {
    if (!isResizableEnabled) return
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(sanitizeColumnWidths(columnWidths)))
  }, [columnWidths, isResizableEnabled])

  useEffect(() => {
    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(visibleColumns))
  }, [visibleColumns])

  useEffect(() => () => stopResize(), [stopResize])

  useEffect(() => {
    if (!isColumnMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setIsColumnMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsColumnMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isColumnMenuOpen])

  const toggleColumnVisibility = (key: ToggleableColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev[key] && Object.values(prev).filter(Boolean).length === 1) {
        return prev
      }

      return {
        ...prev,
        [key]: !prev[key],
      }
    })
  }

  const handleRowClick = (taskId: number) => {
    navigate(`/tasks/${taskId}`)
  }

  const toggleSelection = (taskId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const toggleSelectAllOnPage = () => {
    if (!data?.items.length) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const pageIds = data.items.map((task) => task.id)
      const allSelected = pageIds.every((id) => next.has(id))

      if (allSelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setBulkStatus('')
    setBulkAssignee('')
    setBulkPriority('')
    setBulkPlannedDate('')
  }, [])

  // Используем функции из taskConstants
  const getPriorityKey = useCallback((value?: TaskPriority | number | string) => {
    if (value === undefined || value === null || value === '') return ''
    return normalizePriority(value)
  }, [])

  const getPriorityLabel = useCallback((value?: TaskPriority | number | string) => {
    return getPriorityLabelFn(value)
  }, [])

  const getStatusLabel = useCallback((value?: TaskStatus | string) => {
    return getStatusLabelFn(value)
  }, [])

  const summary = useMemo(() => {
    const items = data?.items ?? []
    const now = Date.now()
    return items.reduce(
      (acc, task) => {
        const isClosed = task.status === 'DONE' || task.status === 'CANCELLED'
        if (!task.assigned_user_id) acc.unassigned += 1
        const priorityKey = getPriorityKey(task.priority)
        if (!isClosed && (priorityKey === 'EMERGENCY' || priorityKey === 'URGENT')) {
          acc.urgent += 1
        }
        if (task.planned_date && !isClosed) {
          const deadline = new Date(task.planned_date).getTime()
          const diffMs = deadline - now
          if (diffMs < 0) {
            acc.overdue += 1
          } else if (diffMs <= 1000 * 60 * 60 * 24) {
            acc.dueSoon += 1
          }
        }
        return acc
      },
      { unassigned: 0, overdue: 0, dueSoon: 0, urgent: 0 }
    )
  }, [data?.items, getPriorityKey])

  const groupedTasks = useMemo<TaskListGroup[]>(() => {
    const items = data?.items ?? []
    if (!groupBy) {
      return [{ key: 'all', label: '', items }]
    }

    const groups = new Map<string, { key: string; label: string; items: Task[] }>()
    items.forEach((task) => {
      let key = ''
      let label = ''
      if (groupBy === 'status') {
        key = task.status
        label = `Статус: ${getStatusLabel(task.status)}`
      } else if (groupBy === 'priority') {
        key = getPriorityKey(task.priority)
        label = `Приоритет: ${getPriorityLabel(task.priority)}`
      } else if (groupBy === 'assignee') {
        key = task.assigned_user_id ? String(task.assigned_user_id) : 'unassigned'
        label = `Исполнитель: ${task.assigned_user_name || 'Не назначен'}`
      }

      if (!groups.has(key)) {
        groups.set(key, { key, label, items: [] })
      }
      groups.get(key)?.items.push(task)
    })

    const groupsArray = Array.from(groups.values())
    if (groupBy === 'status') {
      const order = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']
      const ordered = order.filter((key) => groups.has(key)).map((key) => groups.get(key)!)
      const rest = groupsArray.filter((group) => !order.includes(group.key))
      return [...ordered, ...rest]
    }

    if (groupBy === 'priority') {
      const order = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED']
      const ordered = order.filter((key) => groups.has(key)).map((key) => groups.get(key)!)
      const rest = groupsArray.filter((group) => !order.includes(group.key))
      return [...ordered, ...rest]
    }

    return groupsArray.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [data?.items, groupBy, getPriorityKey, getPriorityLabel, getStatusLabel])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const activeFilters = useMemo<ActiveTaskFilter[]>(() => {
    return [
      ...(search ? [{ id: 'search', type: 'search' as const, label: 'Поиск', value: search }] : []),
      ...statusFilter.map((status) => ({
        id: `status:${status}`,
        type: 'status' as const,
        label: 'Статус',
        value: getStatusLabel(status),
        rawValue: status,
      })),
      ...priorityFilter.map((priority) => ({
        id: `priority:${priority}`,
        type: 'priority' as const,
        label: 'Приоритет',
        value: getPriorityLabel(priority),
        rawValue: priority,
      })),
      ...assigneeFilter.map((assigneeId) => ({
        id: `assignee:${assigneeId}`,
        type: 'assignee' as const,
        label: 'Исполнитель',
        value:
          assignableUsers.find((user) => String(user.id) === assigneeId)?.full_name || assigneeId,
        rawValue: assigneeId,
      })),
      ...(addressIdFilter
        ? [
            {
              id: 'address',
              type: 'address' as const,
              label: 'Адрес',
              value: addressTitleFilter || `ID ${addressIdFilter}`,
            },
          ]
        : []),
    ]

    const items: Array<{ [key: string]: unknown }> = []
    /*
    if (search) items.push({ key: 'search', label: 'Поиск', value: search })
    if (statusFilter) items.push({ key: 'status', label: 'Статус', value: getStatusLabel(statusFilter as TaskStatus) })
    if (priorityFilter) items.push({ key: 'priority', label: 'Приоритет', value: getPriorityLabel(priorityFilter as TaskPriority) })
    if (assigneeFilter) {
      const name = assignableUsers.find((u) => String(u.id) === assigneeFilter)?.full_name || assigneeFilter
      items.push({ key: 'assignee', label: 'Исполнитель', value: name })
    }
    */
    if (addressIdFilter) {
      items.push({
        key: 'address',
        label: 'Адрес',
        value: addressTitleFilter || `ID ${addressIdFilter}`,
      })
    }
    return items as unknown as ActiveTaskFilter[]
  }, [
    search,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    addressIdFilter,
    addressTitleFilter,
    assignableUsers,
    getPriorityLabel,
    getStatusLabel,
  ])

  const hasActiveFilters = activeFilters.length > 0
  const advancedFilterCount =
    statusFilter.length + priorityFilter.length + assigneeFilter.length + (addressIdFilter ? 1 : 0)
  const isNewQuickView = statusFilter.length === 1 && statusFilter[0] === 'NEW'
  const isInProgressQuickView = statusFilter.length === 1 && statusFilter[0] === 'IN_PROGRESS'
  const isUrgentQuickView =
    priorityFilter.length === 2 &&
    priorityFilter.includes('EMERGENCY') &&
    priorityFilter.includes('URGENT')

  const clearFilters = () => {
    setSearch('')
    setSearchInput('')
    setStatusFilter([])
    setPriorityFilter([])
    setAssigneeFilter([])
    setAddressIdFilter('')
    setAddressTitleFilter('')
    setPage(1)
  }

  const clearSingleFilter = (filter: (typeof activeFilters)[number]) => {
    switch (filter.type) {
      case 'search':
        setSearch('')
        setSearchInput('')
        break
      case 'status':
        if (filter.rawValue) {
          setStatusFilter((prev) => prev.filter((value) => value !== filter.rawValue))
        }
        break
      case 'priority':
        if (filter.rawValue) {
          setPriorityFilter((prev) => prev.filter((value) => value !== filter.rawValue))
        }
        break
      case 'assignee':
        if (filter.rawValue) {
          setAssigneeFilter((prev) => prev.filter((value) => value !== filter.rawValue))
        }
        break
      case 'address':
        setAddressIdFilter('')
        setAddressTitleFilter('')
        break
    }
    setPage(1)
  }

  const bulkStatusMutation = useMutation<
    { successCount: number; failedCount: number },
    Error,
    { ids: number[]; status: string; comment?: string }
  >({
    mutationFn: async ({
      ids,
      status,
      comment,
    }: {
      ids: number[]
      status: string
      comment?: string
    }) => {
      const results = await Promise.allSettled(
        ids.map((id) => tasksApi.updateTaskStatus(id, status, comment))
      )
      const failedCount = results.filter((result) => result.status === 'rejected').length
      return {
        successCount: ids.length - failedCount,
        failedCount,
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const bulkAssigneeMutation = useMutation({
    mutationFn: async ({
      ids,
      assignedUserId,
    }: {
      ids: number[]
      assignedUserId: number | null
    }) => {
      await Promise.all(ids.map((id) => tasksApi.assignTask(id, assignedUserId)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const bulkPriorityMutation = useMutation({
    mutationFn: async ({ ids, priority }: { ids: number[]; priority: TaskPriority }) => {
      await Promise.all(ids.map((id) => tasksApi.updateTask(id, { priority })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const bulkPlannedDateMutation = useMutation({
    mutationFn: async ({ ids, planned_date }: { ids: number[]; planned_date: string | null }) => {
      await Promise.all(ids.map((id) => tasksApi.updateTask(id, { planned_date })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ ids }: { ids: number[] }) => {
      await Promise.all(ids.map((id) => tasksApi.deleteTask(id)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) {
      toast.error('Выберите заявки и статус')
      return
    }
    const nextStatus = bulkStatus as TaskStatus
    const selectedTasks = (data?.items ?? []).filter((task) => selectedIds.has(task.id))
    const eligibleTasks = selectedTasks.filter((task) =>
      isStatusTransitionAllowed(task.status, nextStatus)
    )
    if (eligibleTasks.length === 0) {
      toast.error('Нет заявок с допустимым переходом статуса')
      return
    }
    const ids = eligibleTasks.map((task) => task.id)
    const skippedCount = selectedTasks.length - eligibleTasks.length
    if (nextStatus === 'DONE' || nextStatus === 'CANCELLED') {
      setPendingBulkStatus(nextStatus)
      setPendingBulkStatusIds(ids)
      setPendingBulkSkippedCount(skippedCount)
      setBulkStatusComment('')
      setBulkStatusCommentError('')
      setShowBulkStatusCommentModal(true)
      return
    }

    await submitBulkStatusChange(ids, nextStatus, skippedCount)
  }

  const resetBulkStatusCommentModal = () => {
    setShowBulkStatusCommentModal(false)
    setPendingBulkStatus(null)
    setPendingBulkStatusIds([])
    setPendingBulkSkippedCount(0)
    setBulkStatusComment('')
    setBulkStatusCommentError('')
  }

  const submitBulkStatusChange = async (
    ids: number[],
    status: TaskStatus,
    skippedCount: number,
    comment = ''
  ) => {
    try {
      const result = await bulkStatusMutation.mutateAsync({ ids, status, comment })
      if (result.successCount > 0) {
        toast.success(`Статус обновлён для ${result.successCount} заявок`)
      }
      if (result.failedCount > 0) {
        toast.error(`Не удалось обновить ${result.failedCount} заявок`)
      }
      if (skippedCount > 0) {
        toast('Пропущены заявки с недопустимым переходом статуса')
      }
      if (result.successCount > 0) {
        clearSelection()
      }
      resetBulkStatusCommentModal()
    } catch (err) {
      showApiError(err, 'Ошибка массового обновления статуса')
    }
  }

  const confirmBulkStatusComment = async () => {
    if (!pendingBulkStatus) return
    const commentCopy = getStatusCommentCopy(pendingBulkStatus, { plural: true })
    if (!bulkStatusComment.trim()) {
      setBulkStatusCommentError(commentCopy.error)
      return
    }

    await submitBulkStatusChange(
      pendingBulkStatusIds,
      pendingBulkStatus,
      pendingBulkSkippedCount,
      bulkStatusComment.trim()
    )
  }

  const applyBulkAssignee = async () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите заявки')
      return
    }
    if (bulkAssignee === '') {
      toast.error('Выберите исполнителя')
      return
    }
    const assignedUserId = bulkAssignee === 'none' ? null : Number(bulkAssignee)
    const ids = Array.from(selectedIds)
    try {
      await bulkAssigneeMutation.mutateAsync({ ids, assignedUserId })
      toast.success(`Исполнитель обновлён для ${ids.length} заявок`)
      clearSelection()
    } catch (err) {
      showApiError(err, 'Ошибка массового назначения')
    }
  }

  const applyBulkPriority = async () => {
    if (!bulkPriority || selectedIds.size === 0) {
      toast.error('Выберите заявки и приоритет')
      return
    }
    const priority = getPriorityKey(bulkPriority) as TaskPriority
    if (!priority) {
      toast.error('Invalid priority')
      return
    }
    const ids = Array.from(selectedIds)
    try {
      await bulkPriorityMutation.mutateAsync({ ids, priority })
      toast.success(`Приоритет обновлён для ${ids.length} заявок`)
      clearSelection()
    } catch (err) {
      showApiError(err, 'Ошибка массового обновления приоритета')
    }
  }

  const applyBulkPlannedDate = async () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите заявки')
      return
    }
    if (!bulkPlannedDate) {
      toast.error('Выберите плановую дату')
      return
    }
    const ids = Array.from(selectedIds)
    try {
      await bulkPlannedDateMutation.mutateAsync({ ids, planned_date: bulkPlannedDate })
      toast.success(`Плановая дата обновлена для ${ids.length} заявок`)
      clearSelection()
    } catch (err) {
      showApiError(err, 'Ошибка массового обновления даты')
    }
  }

  const applyBulkDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите заявки')
      return
    }
    if (!confirm(`Удалить выбранные заявки (${selectedIds.size})?`)) {
      return
    }
    const ids = Array.from(selectedIds)
    try {
      await bulkDeleteMutation.mutateAsync({ ids })
      toast.success(`Удалено заявок: ${ids.length}`)
      clearSelection()
    } catch (err) {
      showApiError(err, 'Ошибка массового удаления')
    }
  }

  const commitSearch = useCallback(
    (value: string) => {
      const normalized = value.trim()
      if (normalized === search) return
      setSearch(normalized)
      setPage(1)
    },
    [search]
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      commitSearch(searchInput)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput, commitSearch])

  useEffect(() => {
    setCollapsedGroups(new Set())
  }, [groupBy])

  useEffect(() => {
    clearSelection()
  }, [page, sortBy, search, statusFilter, priorityFilter, assigneeFilter, clearSelection])

  const selectedCount = selectedIds.size
  const allSelectedOnPage = data?.items.length
    ? data.items.every((task) => selectedIds.has(task.id))
    : false

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (search) nextParams.set('search', search)
    statusFilter.forEach((value) => nextParams.append('status', value))
    priorityFilter.forEach((value) => nextParams.append('priority', value))
    assigneeFilter.forEach((value) => nextParams.append('assignee', value))
    if (addressIdFilter) nextParams.set('address_id', addressIdFilter)
    if (addressTitleFilter) nextParams.set('address_title', addressTitleFilter)
    if (sortBy !== 'created_at_desc') nextParams.set('sort', sortBy)
    if (groupBy) nextParams.set('group', groupBy)
    if (page > 1) nextParams.set('page', String(page))
    if (pageSize !== defaultPageSize) nextParams.set('size', String(pageSize))

    const next = nextParams.toString()
    const current = searchParams.toString()
    if (next !== current) {
      isSyncingToUrl.current = true
      setSearchParams(nextParams, { replace: true })
    }
  }, [
    search,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    addressIdFilter,
    addressTitleFilter,
    sortBy,
    groupBy,
    page,
    pageSize,
    defaultPageSize,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    // Skip if this update was triggered by the state→URL sync above
    if (isSyncingToUrl.current) {
      isSyncingToUrl.current = false
      return
    }
    const urlSearch = searchParams.get('search') || ''
    const urlStatuses = sanitizeTaskStatuses(searchParams.getAll('status'))
    const urlPriorities = sanitizeTaskPriorities(searchParams.getAll('priority'))
    const urlAssignees = sanitizeAssigneeFilters(searchParams.getAll('assignee'))
    const urlAddressId = searchParams.get('address_id') || ''
    const urlAddressTitle = searchParams.get('address_title') || ''
    const urlSort =
      searchParams.get('sort') === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc'
    const rawGroup = searchParams.get('group') || ''
    const urlGroup = ['status', 'assignee', 'priority'].includes(rawGroup) ? rawGroup : ''
    const rawPage = Number(searchParams.get('page') || 1)
    const urlPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const rawSize = Number(searchParams.get('size') || defaultPageSize)
    const urlSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.trunc(rawSize) : defaultPageSize

    setSearch((prev) => (prev === urlSearch ? prev : urlSearch))
    setSearchInput((prev) => (prev === urlSearch ? prev : urlSearch))
    setStatusFilter((prev) => (areStringArraysEqual(prev, urlStatuses) ? prev : urlStatuses))
    setPriorityFilter((prev) => (areStringArraysEqual(prev, urlPriorities) ? prev : urlPriorities))
    setAssigneeFilter((prev) => (areStringArraysEqual(prev, urlAssignees) ? prev : urlAssignees))
    setAddressIdFilter((prev) => (prev === urlAddressId ? prev : urlAddressId))
    setAddressTitleFilter((prev) => (prev === urlAddressTitle ? prev : urlAddressTitle))
    setSortBy((prev) => (prev === urlSort ? prev : urlSort))
    setGroupBy((prev) => (prev === urlGroup ? prev : urlGroup))
    setPage((prev) => (prev === urlPage ? prev : urlPage))
    setPageSize((prev) => (prev === urlSize ? prev : urlSize))
  }, [searchParams, defaultPageSize])

  return (
    <div>
      {/* Header */}
      <PageHeader
        className="mb-6"
        title="Заявки"
        description={data ? `Всего: ${data.total}` : 'Загрузка...'}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                refetch().then(() => toast.success('Список обновлён'))
              }}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Button size="sm" onClick={() => navigate('/tasks/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Новая заявка
            </Button>
          </>
        }
      />

      <TaskFiltersPanel
        searchInput={searchInput}
        onSearchChange={handleSearchChange}
        onSearchCommit={() => commitSearch(searchInput)}
        isNewQuickView={isNewQuickView}
        isInProgressQuickView={isInProgressQuickView}
        isUrgentQuickView={isUrgentQuickView}
        onToggleQuickStatus={toggleQuickStatus}
        onToggleUrgentPriorities={toggleUrgentPriorities}
        showAdvancedFilters={showAdvancedFilters}
        advancedFilterCount={advancedFilterCount}
        onToggleAdvancedFilters={() => setShowAdvancedFilters((current) => !current)}
        savedViews={savedViews}
        activeSavedViewId={activeSavedViewId}
        currentSavedViewSettings={currentSavedViewSettings}
        onApplySavedView={applySavedView}
        onSaveCurrentView={saveCurrentView}
        onDeleteSavedView={deleteSavedView}
        sortBy={sortBy}
        groupBy={groupBy}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        assigneeFilter={assigneeFilter}
        assignableUsers={assignableUsers}
        onSortChange={handleSortChange}
        onGroupChange={(value) => {
          setGroupBy(value)
          setCollapsedGroups(new Set())
        }}
        onStatusChange={handleStatusFilterChange}
        onPriorityChange={handlePriorityFilterChange}
        onAssigneeChange={handleAssigneeFilterChange}
        hasActiveFilters={hasActiveFilters}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        onClearSingleFilter={clearSingleFilter}
        summary={data ? summary : undefined}
      />

      {/* Content */}
      {isLoading ? (
        <SkeletonTaskList count={6} />
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-medium text-red-800 dark:text-red-400 mb-1">
            Ошибка загрузки
          </h3>
          <p className="text-red-600 dark:text-red-300 text-sm mb-4">
            {error instanceof Error ? error.message : 'Не удалось загрузить заявки'}
          </p>
          <Button variant="danger" size="sm" onClick={() => refetch()}>
            Попробовать снова
          </Button>
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="Заявки не найдены"
          description={
            hasActiveFilters
              ? 'Попробуйте изменить параметры фильтрации'
              : 'Создайте первую заявку, чтобы начать работу'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Сбросить фильтры
              </Button>
            ) : (
              <Button onClick={() => navigate('/tasks/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Создать заявку
              </Button>
            )
          }
        />
      ) : (
        data && (
          <>
            {selectedCount > 0 && (
              <TaskBulkActions
                selectedCount={selectedCount}
                assignableUsers={assignableUsers}
                status={bulkStatus}
                assignee={bulkAssignee}
                priority={bulkPriority}
                plannedDate={bulkPlannedDate}
                isStatusPending={bulkStatusMutation.isPending}
                isAssigneePending={bulkAssigneeMutation.isPending}
                isPriorityPending={bulkPriorityMutation.isPending}
                isPlannedDatePending={bulkPlannedDateMutation.isPending}
                isDeletePending={bulkDeleteMutation.isPending}
                onStatusChange={setBulkStatus}
                onAssigneeChange={setBulkAssignee}
                onPriorityChange={setBulkPriority}
                onPlannedDateChange={setBulkPlannedDate}
                onApplyStatus={applyBulkStatus}
                onApplyAssignee={applyBulkAssignee}
                onApplyPriority={applyBulkPriority}
                onApplyPlannedDate={applyBulkPlannedDate}
                onDelete={applyBulkDelete}
                onClear={clearSelection}
              />
            )}

            <Modal
              isOpen={showBulkStatusCommentModal}
              onClose={() => {
                if (!bulkStatusMutation.isPending) {
                  resetBulkStatusCommentModal()
                }
              }}
              title={getStatusCommentCopy(pendingBulkStatus, { plural: true }).title}
              size="md"
            >
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {getStatusCommentCopy(pendingBulkStatus, { plural: true }).description}
                </p>
                <Textarea
                  value={bulkStatusComment}
                  onChange={(event) => {
                    setBulkStatusComment(event.target.value)
                    if (bulkStatusCommentError) {
                      setBulkStatusCommentError('')
                    }
                  }}
                  label={getStatusCommentCopy(pendingBulkStatus, { plural: true }).label}
                  placeholder={
                    getStatusCommentCopy(pendingBulkStatus, { plural: true }).placeholder
                  }
                  error={bulkStatusCommentError}
                  disabled={bulkStatusMutation.isPending}
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    onClick={resetBulkStatusCommentModal}
                    disabled={bulkStatusMutation.isPending}
                  >
                    Отмена
                  </Button>
                  <Button
                    onClick={confirmBulkStatusComment}
                    isLoading={bulkStatusMutation.isPending}
                  >
                    {getStatusCommentCopy(pendingBulkStatus, { plural: true }).submitText}
                  </Button>
                </div>
              </div>
            </Modal>

            <TaskMobileList
              groups={groupedTasks}
              groupBy={groupBy}
              collapsedGroups={collapsedGroups}
              selectedIds={selectedIds}
              unreadByTaskId={unreadByTaskId}
              onToggleGroup={toggleGroup}
              onToggleSelection={toggleSelection}
              onOpenTask={handleRowClick}
            />

            <TaskListTable
              groups={groupedTasks}
              groupBy={groupBy}
              collapsedGroups={collapsedGroups}
              selectedIds={selectedIds}
              unreadByTaskId={unreadByTaskId}
              visibleColumns={visibleColumns}
              effectiveColumnWidths={effectiveColumnWidths}
              visibleColumnCount={visibleColumnCount}
              visibleDataColumnCount={visibleDataColumnCount}
              isResizableEnabled={isResizableEnabled}
              isCompactView={isCompactView}
              tableWidth={resizableTableWidth}
              allSelectedOnPage={allSelectedOnPage}
              isColumnMenuOpen={isColumnMenuOpen}
              tableRef={tableRef}
              columnMenuRef={columnMenuRef}
              onMeasureContainer={measureTableContainer}
              onColumnMenuToggle={() => setIsColumnMenuOpen((current) => !current)}
              onColumnVisibilityToggle={toggleColumnVisibility}
              onResetVisibleColumns={() => setVisibleColumns(defaultVisibleColumns)}
              onResizeStart={startResize}
              onToggleSelectAll={toggleSelectAllOnPage}
              onToggleSelection={toggleSelection}
              onToggleGroup={toggleGroup}
              onOpenTask={handleRowClick}
            />

            {/* Pagination */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>Показывать по:</span>
                {pageSizeOptions.map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setPageSize(size)
                      setPage(1)
                    }}
                    className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
                      pageSize === size
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              {data.pages > 1 && (
                <Pagination
                  currentPage={data.page}
                  totalPages={data.pages}
                  onPageChange={setPage}
                />
              )}
            </div>

            {/* Page info */}
            <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Показано {(data.page - 1) * data.size + 1}–
              {Math.min(data.page * data.size, data.total)} из {data.total}
            </div>
          </>
        )
      )}
    </div>
  )
}

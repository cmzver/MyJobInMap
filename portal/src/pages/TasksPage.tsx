import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { showApiError } from '@/utils/apiError'
import { Search, Plus, RefreshCw, MapPin, Calendar, User, AlertTriangle, Clock, ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUnreadTaskNotifications } from '@/hooks/useNotifications'
import { useTasks } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { tasksApi } from '@/api/tasks'
import apiClient from '@/api/client'
import type { TaskStatus, TaskPriority, TaskFilters, Task, TaskSort } from '@/types/task'
import { formatDateTime, getSla } from '@/utils/dateFormat'
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  normalizePriority,
  getPriorityLabel as getPriorityLabelFn,
  getStatusLabel as getStatusLabelFn,
  getStatusCommentCopy,
  isStatusTransitionAllowed,
} from '@/config/taskConstants'
import Button from '@/components/Button'
import MultiSelectFilter from '@/components/MultiSelectFilter'
import Select from '@/components/Select'
import { SkeletonTaskList } from '@/components/Skeleton'
import Pagination from '@/components/Pagination'
import EmptyState from '@/components/EmptyState'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import { useAuthStore } from '@/store/authStore'
import { isAssignableRole } from '@/types/user'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const SEARCH_DEBOUNCE_MS = 700
const COLUMN_STORAGE_KEY = 'tasks-table-column-widths'
const COLUMN_VISIBILITY_STORAGE_KEY = 'tasks-table-visible-columns'

type ColumnKey = 'select' | 'number' | 'title' | 'address' | 'status' | 'priority' | 'assignee' | 'date' | 'sla'
type ToggleableColumnKey = Exclude<ColumnKey, 'select'>

const getColumnWidthCssVar = (key: ColumnKey) => `--tasks-col-${key}`

interface InterfaceSettings {
  enable_resizable_columns: boolean
  compact_table_view: boolean
}

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
  select: 64,
  number: 180,
  title: 640,
  address: 720,
  status: 240,
  priority: 240,
  assignee: 320,
  date: 240,
  sla: 180,
}

const toggleableColumns: Array<{ key: ToggleableColumnKey; label: string }> = [
  { key: 'number', label: 'Номер' },
  { key: 'title', label: 'Заявка' },
  { key: 'address', label: 'Адрес' },
  { key: 'status', label: 'Статус' },
  { key: 'priority', label: 'Приоритет' },
  { key: 'assignee', label: 'Исполнитель' },
  { key: 'date', label: 'Дата' },
  { key: 'sla', label: 'Срок' },
]

const defaultVisibleColumns: Record<ToggleableColumnKey, boolean> = {
  number: true,
  title: true,
  address: true,
  status: true,
  priority: true,
  assignee: true,
  date: true,
  sla: true,
}

const getVisibleColumnOrder = (visibleColumns: Record<ToggleableColumnKey, boolean>): ColumnKey[] => [
  'select',
  ...toggleableColumns
    .filter((column) => visibleColumns[column.key])
    .map((column) => column.key),
]

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

  const normalized = adjustableColumns.map((column) => {
    const rawChange = delta * (column.adjustable / totalAdjustable)
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
    const width = mode === 'shrink'
      ? column.currentWidth - column.change
      : column.currentWidth + column.change
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

// Алиасы для Select компонентов
const statusOptions = [...STATUS_OPTIONS]
const priorityOptions = [...PRIORITY_OPTIONS]

const groupOptions = [
  { value: '', label: 'Без группировки' },
  { value: 'status', label: 'По статусу' },
  { value: 'assignee', label: 'По исполнителю' },
  { value: 'priority', label: 'По приоритету' },
]

const sortOptions = [
  { value: 'created_at_desc', label: 'Дата заявки: новые сверху' },
  { value: 'created_at_asc', label: 'Дата заявки: старые сверху' },
]

const TASK_STATUS_VALUES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const TASK_PRIORITY_VALUES: TaskPriority[] = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED']

const sanitizeTaskStatuses = (values: string[]): TaskStatus[] =>
  Array.from(new Set(values.filter((value): value is TaskStatus => TASK_STATUS_VALUES.includes(value as TaskStatus))))

const sanitizeTaskPriorities = (values: string[]): TaskPriority[] =>
  Array.from(new Set(values.filter((value): value is TaskPriority => TASK_PRIORITY_VALUES.includes(value as TaskPriority))))

const sanitizeAssigneeFilters = (values: string[]): string[] =>
  Array.from(new Set(values.filter((value) => /^\d+$/.test(value))))

const areStringArraysEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

interface ActiveFilterChip {
  id: string
  type: 'search' | 'status' | 'priority' | 'assignee' | 'address'
  label: string
  value: string
  rawValue?: string
}

export default function TasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(loadColumnWidths)
  const [visibleColumns, setVisibleColumns] = useState<Record<ToggleableColumnKey, boolean>>(loadVisibleColumns)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const resizeState = useRef<{
    leftKey: ColumnKey
    rightKey: ColumnKey | null
    startX: number
    startLeftWidth: number
    startRightWidth: number | null
    currentLeftWidth: number
    currentRightWidth: number | null
    snapshotWidths: Record<ColumnKey, number>
    previousCursor: string
    previousUserSelect: string
  } | null>(null)
  const columnMenuRef = useRef<HTMLDivElement | null>(null)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [tableContainerWidth, setTableContainerWidth] = useState(0)
  const initialPage = Number(searchParams.get('page') || 1)
  const [page, setPage] = useState(() => (Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1))
  const initialSize = Number(searchParams.get('size') || PAGE_SIZE)
  const [pageSize, setPageSize] = useState(() => (PAGE_SIZE_OPTIONS.includes(initialSize) ? initialSize : PAGE_SIZE))
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>(() => sanitizeTaskStatuses(searchParams.getAll('status')))
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>(() => sanitizeTaskPriorities(searchParams.getAll('priority')))
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>(() => sanitizeAssigneeFilters(searchParams.getAll('assignee')))
  const [addressIdFilter, setAddressIdFilter] = useState<string>(() => searchParams.get('address_id') || '')
  const [addressTitleFilter, setAddressTitleFilter] = useState<string>(() => searchParams.get('address_title') || '')
  const [sortBy, setSortBy] = useState<TaskSort>(() => {
    const value = searchParams.get('sort')
    return value === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc'
  })
  const [groupBy, setGroupBy] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
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

  // Build filters object
  const filters: TaskFilters = useMemo(() => ({
    page,
    size: pageSize,
    sort: sortBy,
    ...(addressIdFilter ? { address_id: Number(addressIdFilter) || undefined } : {}),
    ...(search && { search }),
    ...(statusFilter.length > 0 && { statuses: statusFilter }),
    ...(priorityFilter.length > 0 && { priorities: priorityFilter }),
    ...(assigneeFilter.length > 0 && { assignee_ids: assigneeFilter.map(Number).filter((value) => Number.isFinite(value)) }),
  }), [page, pageSize, sortBy, search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter])

  const { data, isLoading, isError, error, refetch, isFetching } = useTasks(filters)
  const { data: unreadTaskNotifications = [] } = useUnreadTaskNotifications({ enabled: Boolean(user) })
  const { data: interfaceSettings } = useQuery({
    queryKey: ['interface-settings'],
    queryFn: async () => {
      const response = await apiClient.get<InterfaceSettings>('/admin/settings/interface')
      return response.data
    },
    staleTime: 300000,
    retry: false,
  })
  const isResizableEnabled = interfaceSettings?.enable_resizable_columns ?? true
  const isCompactView = interfaceSettings?.compact_table_view ?? false
  const cellPadding = isCompactView ? 'px-4 py-2' : 'px-4 py-3'
  const { data: users = [] } = useUsers()
  const assignableUsers = users.filter(
    (user) => user.is_active && isAssignableRole(user.role)
  )
  const unreadByTaskId = useMemo(() => {
    const map: Record<number, number> = {}

    for (const notification of unreadTaskNotifications) {
      if (notification.task_id == null) continue
      map[notification.task_id] = (map[notification.task_id] ?? 0) + 1
    }

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

  const applyColumnWidth = useCallback((key: ColumnKey, width: number) => {
    if (!tableRef.current) return
    tableRef.current.style.setProperty(getColumnWidthCssVar(key), `${width}px`)
  }, [])

  const applyColumnWidths = useCallback((widths: Record<ColumnKey, number>) => {
    (Object.keys(widths) as ColumnKey[]).forEach((key) => {
      applyColumnWidth(key, widths[key])
    })
  }, [applyColumnWidth])

  const handleResizeMove = useCallback((event: MouseEvent) => {
    if (!resizeState.current) return
    const { leftKey, rightKey, startX, startLeftWidth, startRightWidth } = resizeState.current
    const delta = event.clientX - startX

    if (!rightKey || startRightWidth == null) {
      const nextWidth = clampColumnWidth(leftKey, startLeftWidth + delta)

      if (resizeState.current.currentLeftWidth === nextWidth) return

      resizeState.current.currentLeftWidth = nextWidth
      applyColumnWidth(leftKey, nextWidth)
      return
    }

    const minDelta = columnMinWidths[leftKey] - startLeftWidth
    const maxDelta = Math.min(
      startRightWidth - columnMinWidths[rightKey],
      columnMaxWidths[leftKey] - startLeftWidth
    )
    const nextDelta = Math.min(maxDelta, Math.max(minDelta, delta))
    const nextLeftWidth = clampColumnWidth(leftKey, startLeftWidth + nextDelta)
    const nextRightWidth = clampColumnWidth(rightKey, startRightWidth - nextDelta)

    if (
      resizeState.current.currentLeftWidth === nextLeftWidth
      && resizeState.current.currentRightWidth === nextRightWidth
    ) {
      return
    }

    resizeState.current.currentLeftWidth = nextLeftWidth
    resizeState.current.currentRightWidth = nextRightWidth
    applyColumnWidth(leftKey, nextLeftWidth)
    applyColumnWidth(rightKey, nextRightWidth)
  }, [applyColumnWidth])

  const stopResize = useCallback(() => {
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', stopResize)
    const activeResize = resizeState.current
    resizeState.current = null

    if (!activeResize) return

    document.body.style.cursor = activeResize.previousCursor
    document.body.style.userSelect = activeResize.previousUserSelect

    if (
      activeResize.currentLeftWidth === activeResize.startLeftWidth
      && activeResize.currentRightWidth === activeResize.startRightWidth
    ) {
      return
    }

    setColumnWidths((prev) => {
      const baseWidths = sanitizeColumnWidths(activeResize.snapshotWidths)
      const leftUnchanged = baseWidths[activeResize.leftKey] === activeResize.currentLeftWidth
      const rightUnchanged = activeResize.rightKey == null
        || baseWidths[activeResize.rightKey] === activeResize.currentRightWidth
      if (leftUnchanged && rightUnchanged) return prev

      return {
        ...baseWidths,
        [activeResize.leftKey]: activeResize.currentLeftWidth,
        ...(activeResize.rightKey && activeResize.currentRightWidth != null
          ? { [activeResize.rightKey]: activeResize.currentRightWidth }
          : {}),
      }
    })
  }, [handleResizeMove])

  const startResize = useCallback(
    (key: ColumnKey, event: React.MouseEvent) => {
      if (!isResizableEnabled) return
      event.preventDefault()
      event.stopPropagation()
      const currentIndex = visibleColumnOrder.indexOf(key)
      const rightKey = currentIndex >= 0 ? visibleColumnOrder[currentIndex + 1] ?? null : null
      const startLeftWidth = effectiveColumnWidths[key]
      const startRightWidth = rightKey ? effectiveColumnWidths[rightKey] : null
      resizeState.current = {
        leftKey: key,
        rightKey,
        startX: event.clientX,
        startLeftWidth,
        startRightWidth,
        currentLeftWidth: startLeftWidth,
        currentRightWidth: startRightWidth,
        snapshotWidths: effectiveColumnWidths,
        previousCursor: document.body.style.cursor,
        previousUserSelect: document.body.style.userSelect,
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', stopResize)
    },
    [effectiveColumnWidths, handleResizeMove, isResizableEnabled, stopResize, visibleColumnOrder]
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

  useEffect(() => {
    const element = tableContainerRef.current
    if (!element) return

    const updateWidth = () => {
      setTableContainerWidth(Math.floor(element.clientWidth))
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(element)

    return () => observer.disconnect()
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

  const renderResizeHandle = (key: ColumnKey) => {
    if (!isResizableEnabled) return null
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(event) => startResize(key, event)}
        className="group absolute right-0 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center"
      >
        <span className="h-[calc(100%-0.875rem)] w-px rounded-full bg-gray-200 transition-colors group-hover:bg-primary-400 dark:bg-gray-600 dark:group-hover:bg-primary-400" />
      </div>
    )
  }

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

  const groupedTasks = useMemo(() => {
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
      const ordered = order
        .filter((key) => groups.has(key))
        .map((key) => groups.get(key)!)
      const rest = groupsArray.filter((group) => !order.includes(group.key))
      return [...ordered, ...rest]
    }

    if (groupBy === 'priority') {
      const order = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED']
      const ordered = order
        .filter((key) => groups.has(key))
        .map((key) => groups.get(key)!)
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

  const activeFilters = useMemo<ActiveFilterChip[]>(() => {
    return [
      ...(search
        ? [{ id: 'search', type: 'search' as const, label: 'Поиск', value: search }]
        : []),
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
        value: assignableUsers.find((user) => String(user.id) === assigneeId)?.full_name || assigneeId,
        rawValue: assigneeId,
      })),
      ...(addressIdFilter
        ? [{
            id: 'address',
            type: 'address' as const,
            label: 'Адрес',
            value: addressTitleFilter || `ID ${addressIdFilter}`,
          }]
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
    return items as unknown as ActiveFilterChip[]
  }, [search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter, addressTitleFilter, assignableUsers, getPriorityLabel, getStatusLabel])

  const hasActiveFilters = activeFilters.length > 0

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
    mutationFn: async ({ ids, status, comment }: { ids: number[]; status: string; comment?: string }) => {
      const results = await Promise.allSettled(ids.map((id) => tasksApi.updateTaskStatus(id, status, comment)))
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
    mutationFn: async ({ ids, assignedUserId }: { ids: number[]; assignedUserId: number | null }) => {
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
    const eligibleTasks = selectedTasks.filter((task) => isStatusTransitionAllowed(task.status, nextStatus))
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

  const submitBulkStatusChange = async (ids: number[], status: TaskStatus, skippedCount: number, comment = '') => {
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
      bulkStatusComment.trim(),
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

  const commitSearch = useCallback((value: string) => {
    const normalized = value.trim()
    if (normalized === search) return
    setSearch(normalized)
    setPage(1)
  }, [search])

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
  const allSelectedOnPage =
    data?.items.length ? data.items.every((task) => selectedIds.has(task.id)) : false

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (search) nextParams.set('search', search)
    statusFilter.forEach((value) => nextParams.append('status', value))
    priorityFilter.forEach((value) => nextParams.append('priority', value))
    assigneeFilter.forEach((value) => nextParams.append('assignee', value))
    if (addressIdFilter) nextParams.set('address_id', addressIdFilter)
    if (addressTitleFilter) nextParams.set('address_title', addressTitleFilter)
    if (sortBy !== 'created_at_desc') nextParams.set('sort', sortBy)
    if (page > 1) nextParams.set('page', String(page))
    if (pageSize !== PAGE_SIZE) nextParams.set('size', String(pageSize))

    const next = nextParams.toString()
    const current = searchParams.toString()
    if (next !== current) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter, addressTitleFilter, sortBy, page, pageSize, searchParams, setSearchParams])

  useEffect(() => {
    const urlSearch = searchParams.get('search') || ''
    const urlStatuses = sanitizeTaskStatuses(searchParams.getAll('status'))
    const urlPriorities = sanitizeTaskPriorities(searchParams.getAll('priority'))
    const urlAssignees = sanitizeAssigneeFilters(searchParams.getAll('assignee'))
    const urlAddressId = searchParams.get('address_id') || ''
    const urlAddressTitle = searchParams.get('address_title') || ''
    const urlSort = searchParams.get('sort') === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc'
    const rawPage = Number(searchParams.get('page') || 1)
    const urlPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const rawSize = Number(searchParams.get('size') || PAGE_SIZE)
    const urlSize = PAGE_SIZE_OPTIONS.includes(rawSize) ? rawSize : PAGE_SIZE

    setSearch((prev) => (prev === urlSearch ? prev : urlSearch))
    setSearchInput((prev) => (prev === urlSearch ? prev : urlSearch))
    setStatusFilter((prev) => (areStringArraysEqual(prev, urlStatuses) ? prev : urlStatuses))
    setPriorityFilter((prev) => (areStringArraysEqual(prev, urlPriorities) ? prev : urlPriorities))
    setAssigneeFilter((prev) => (areStringArraysEqual(prev, urlAssignees) ? prev : urlAssignees))
    setAddressIdFilter((prev) => (prev === urlAddressId ? prev : urlAddressId))
    setAddressTitleFilter((prev) => (prev === urlAddressTitle ? prev : urlAddressTitle))
    setSortBy((prev) => (prev === urlSort ? prev : urlSort))
    setPage((prev) => (prev === urlPage ? prev : urlPage))
    setPageSize((prev) => (prev === urlSize ? prev : urlSize))
  }, [searchParams])

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Заявки</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {data ? `Всего: ${data.total}` : 'Загрузка...'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
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
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="xl:w-[320px]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Поиск
                </span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {hasActiveFilters ? `Активно: ${activeFilters.length}` : 'Все заявки'}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Номер, адрес, клиент"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitSearch(searchInput)
                  }
                }}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Select
              label="Сортировка"
              options={sortOptions}
              value={sortBy}
              onChange={handleSortChange}
              placeholder="Сортировка"
              className="h-9 text-sm"
            />
            <Select
              label="Группировка"
              options={groupOptions}
              value={groupBy}
              onChange={(value) => {
                setGroupBy(value)
                setCollapsedGroups(new Set())
              }}
              placeholder="Без группировки"
              className="h-9 text-sm"
            />
            <MultiSelectFilter
              label="Статусы"
              options={statusOptions}
              selectedValues={statusFilter}
              onChange={handleStatusFilterChange}
              placeholder="Все статусы"
            />
            <MultiSelectFilter
              label="Приоритеты"
              options={priorityOptions}
              selectedValues={priorityFilter}
              onChange={handlePriorityFilterChange}
              placeholder="Все приоритеты"
            />
            <MultiSelectFilter
              label="Исполнители"
              options={assignableUsers.map((user) => ({
                value: String(user.id),
                label: user.full_name || user.username,
              }))}
              selectedValues={assigneeFilter}
              onChange={handleAssigneeFilterChange}
              placeholder="Все исполнители"
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-9 px-3"
            >
              Сбросить
            </Button>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => clearSingleFilter(filter)}
                className="flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <span className="text-gray-500 dark:text-gray-400">{filter.label}:</span>
                <span className="max-w-[180px] truncate text-gray-900 dark:text-white">{filter.value}</span>
                <X size={12} className="text-gray-400" />
              </button>
            ))}
          </div>
      )}

        {data && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 pt-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">Сводка</span>
            <span>
              Без исполнителя <span className="font-semibold text-gray-900 dark:text-white">{summary.unassigned}</span>
            </span>
            <span>
              Просроченные <span className="font-semibold text-gray-900 dark:text-white">{summary.overdue}</span>
            </span>
            <span>
              Срок &lt; 24ч <span className="font-semibold text-gray-900 dark:text-white">{summary.dueSoon}</span>
            </span>
            <span>
              Срочные <span className="font-semibold text-gray-900 dark:text-white">{summary.urgent}</span>
            </span>
          </div>
        )}
      </div>
      {false && (
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary-500 dark:text-primary-400" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-200">
                Фильтры и поиск
              </h2>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Уточните список по поиску, статусу, приоритету, исполнителю и способу отображения.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters ? (
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                Активно: {activeFilters.length}
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                Все заявки
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-9 px-3"
            >
              Сбросить
            </Button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Поиск по заявкам
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Номер, адрес, клиент или название"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitSearch(searchInput)
                    }
                  }}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Ищет по номеру, названию, адресу и клиенту. Нажмите Enter, чтобы применить сразу.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Сортировка"
                options={sortOptions}
                value={sortBy}
                onChange={handleSortChange}
                placeholder="Сортировка"
                className="h-11"
              />
              <Select
                label="Группировка"
                options={groupOptions}
                value={groupBy}
                onChange={(value) => {
                  setGroupBy(value)
                  setCollapsedGroups(new Set())
                }}
                placeholder="Без группировки"
                className="h-11"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Select
              label="Статус"
              options={statusOptions}
              value={statusFilter[0] ?? ''}
              onChange={(value) => handleStatusFilterChange(value ? [value] : [])}
              placeholder="Все статусы"
              className="h-11"
            />
            <Select
              label="Приоритет"
              options={priorityOptions}
              value={priorityFilter[0] ?? ''}
              onChange={(value) => handlePriorityFilterChange(value ? [value] : [])}
              placeholder="Все приоритеты"
              className="h-11"
            />
            <Select
              label="Исполнитель"
              options={[
                { value: '', label: 'Все исполнители' },
                ...assignableUsers.map((user) => ({
                  value: String(user.id),
                  label: user.full_name || user.username,
                })),
              ]}
              value={assigneeFilter[0] ?? ''}
              onChange={(value) => handleAssigneeFilterChange(value ? [value] : [])}
              placeholder="Все исполнители"
              className="h-11"
            />
          </div>

          {hasActiveFilters && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 dark:border-gray-600 dark:bg-gray-900/20">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Активные фильтры
                  </span>
                  {activeFilters.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => clearSingleFilter(filter)}
                      className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-primary-200 hover:bg-primary-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-primary-800 dark:hover:bg-primary-900/20"
                    >
                      <span className="text-gray-500 dark:text-gray-400">{filter.label}:</span>
                      <span className="text-gray-900 dark:text-white">{filter.value}</span>
                      <X size={12} className="text-gray-400" />
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 self-start lg:self-auto">
                  Очистить все
                </Button>
              </div>
            </div>
          )}

          {data && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-700 dark:text-blue-300">Без исполнителя</p>
                <p className="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-200">{summary.unassigned}</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red-700 dark:text-red-300">Просроченные</p>
                <p className="mt-2 text-2xl font-bold text-red-700 dark:text-red-200">{summary.overdue}</p>
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50/80 px-4 py-3 dark:border-orange-900/40 dark:bg-orange-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-orange-700 dark:text-orange-300">Срок &lt; 24ч</p>
                <p className="mt-2 text-2xl font-bold text-orange-700 dark:text-orange-200">{summary.dueSoon}</p>
              </div>
              <div className="rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 dark:border-primary-900/40 dark:bg-primary-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-700 dark:text-primary-300">Срочные</p>
                <p className="mt-2 text-2xl font-bold text-primary-700 dark:text-primary-200">{summary.urgent}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonTaskList count={6} />
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-medium text-red-800 dark:text-red-400 mb-1">Ошибка загрузки</h3>
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
          description={hasActiveFilters 
            ? "Попробуйте изменить параметры фильтрации" 
            : "Создайте первую заявку, чтобы начать работу"}
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
      ) : data && (
        <>
          {selectedCount > 0 && (
            <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Выбрано заявок: <span className="font-medium">{selectedCount}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex gap-2">
                  <Select
                    options={[
                      { value: '', label: 'Статус' },
                      { value: 'NEW', label: 'Новая' },
                      { value: 'IN_PROGRESS', label: 'В работе' },
                      { value: 'DONE', label: 'Выполнена' },
                      { value: 'CANCELLED', label: 'Отменена' },
                    ]}
                    value={bulkStatus}
                    onChange={setBulkStatus}
                    placeholder="Статус"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBulkStatus}
                    isLoading={bulkStatusMutation.isPending}
                  >
                    Применить
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Select
                    options={[
                      { value: '', label: 'Исполнитель' },
                      { value: 'none', label: 'Не назначен' },
                      ...assignableUsers.map((user) => ({
                        value: String(user.id),
                        label: user.full_name || user.username,
                      })),
                    ]}
                    value={bulkAssignee}
                    onChange={setBulkAssignee}
                    placeholder="Исполнитель"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBulkAssignee}
                    isLoading={bulkAssigneeMutation.isPending}
                  >
                    Применить
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Select
                    options={[
                      { value: '', label: 'Приоритет' },
                      { value: 'EMERGENCY', label: 'Аварийная' },
                      { value: 'URGENT', label: 'Срочная' },
                      { value: 'CURRENT', label: 'Текущая' },
                      { value: 'PLANNED', label: 'Плановая' },
                    ]}
                    value={bulkPriority}
                    onChange={setBulkPriority}
                    placeholder="Приоритет"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBulkPriority}
                    isLoading={bulkPriorityMutation.isPending}
                  >
                    Применить
                  </Button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="datetime-local"
                    value={bulkPlannedDate}
                    onChange={(event) => setBulkPlannedDate(event.target.value)}
                    className="h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBulkPlannedDate}
                    isLoading={bulkPlannedDateMutation.isPending}
                  >
                    Назначить
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={applyBulkDelete}
                    isLoading={bulkDeleteMutation.isPending}
                  >
                    Удалить
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Очистить
                  </Button>
                </div>
              </div>
            </div>
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
                placeholder={getStatusCommentCopy(pendingBulkStatus, { plural: true }).placeholder}
                error={bulkStatusCommentError}
                disabled={bulkStatusMutation.isPending}
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={resetBulkStatusCommentModal} disabled={bulkStatusMutation.isPending}>
                  Отмена
                </Button>
                <Button onClick={confirmBulkStatusComment} isLoading={bulkStatusMutation.isPending}>
                  {getStatusCommentCopy(pendingBulkStatus, { plural: true }).submitText}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Tasks Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Колонки: {visibleDataColumnCount}/{toggleableColumns.length}
              </div>
              <div ref={columnMenuRef} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsColumnMenuOpen((prev) => !prev)}
                  className="h-8 px-2.5"
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
                        onClick={() => setVisibleColumns(defaultVisibleColumns)}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        Все
                      </button>
                    </div>
                    <div className="space-y-1">
                      {toggleableColumns.map((column) => {
                        const isLastVisibleColumn = visibleColumns[column.key] && visibleDataColumnCount === 1

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
                              onChange={() => toggleColumnVisibility(column.key)}
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
            <div ref={tableContainerRef} className="overflow-x-auto">
              <table
                ref={tableRef}
                className={`divide-y divide-gray-200 dark:divide-gray-700 ${isResizableEnabled ? 'table-fixed' : 'min-w-full'}`}
                style={isResizableEnabled ? { width: `${resizableTableWidth}px` } : undefined}
              >
                {isResizableEnabled && (
                  <colgroup>
                    <col style={{ width: `var(${getColumnWidthCssVar('select')}, ${effectiveColumnWidths.select}px)` }} />
                    {visibleColumns.number && <col style={{ width: `var(${getColumnWidthCssVar('number')}, ${effectiveColumnWidths.number}px)` }} />}
                    {visibleColumns.title && <col style={{ width: `var(${getColumnWidthCssVar('title')}, ${effectiveColumnWidths.title}px)` }} />}
                    {visibleColumns.address && <col style={{ width: `var(${getColumnWidthCssVar('address')}, ${effectiveColumnWidths.address}px)` }} />}
                    {visibleColumns.status && <col style={{ width: `var(${getColumnWidthCssVar('status')}, ${effectiveColumnWidths.status}px)` }} />}
                    {visibleColumns.priority && <col style={{ width: `var(${getColumnWidthCssVar('priority')}, ${effectiveColumnWidths.priority}px)` }} />}
                    {visibleColumns.assignee && <col style={{ width: `var(${getColumnWidthCssVar('assignee')}, ${effectiveColumnWidths.assignee}px)` }} />}
                    {visibleColumns.date && <col style={{ width: `var(${getColumnWidthCssVar('date')}, ${effectiveColumnWidths.date}px)` }} />}
                    {visibleColumns.sla && <col style={{ width: `var(${getColumnWidthCssVar('sla')}, ${effectiveColumnWidths.sla}px)` }} />}
                  </colgroup>
                )}
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        aria-label="Выбрать все на странице"
                      />
                      {renderResizeHandle('select')}
                    </th>
                    {visibleColumns.number && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        №
                        {renderResizeHandle('number')}
                      </th>
                    )}
                    {visibleColumns.title && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Заявка
                        {renderResizeHandle('title')}
                      </th>
                    )}
                    {visibleColumns.address && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Адрес
                        {renderResizeHandle('address')}
                      </th>
                    )}
                    {visibleColumns.status && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Статус
                        {renderResizeHandle('status')}
                      </th>
                    )}
                    {visibleColumns.priority && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Приоритет
                        {renderResizeHandle('priority')}
                      </th>
                    )}
                    {visibleColumns.assignee && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Исполнитель
                        {renderResizeHandle('assignee')}
                      </th>
                    )}
                    {visibleColumns.date && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Дата
                        {renderResizeHandle('date')}
                      </th>
                    )}
                    {visibleColumns.sla && (
                      <th className={`relative overflow-hidden ${cellPadding} text-left text-sm font-medium text-gray-500 dark:text-gray-400`}>
                        Срок
                        {renderResizeHandle('sla')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {groupedTasks.map((group) => {
                    const isCollapsed = groupBy && collapsedGroups.has(group.key)
                    return (
                      <Fragment key={group.key}>
                        {groupBy && (
                          <tr className="bg-gray-50 dark:bg-gray-900/40">
                            <td colSpan={visibleColumnCount} className={cellPadding}>
                              <button
                                type="button"
                                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                                onClick={() => toggleGroup(group.key)}
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
                        {!isCollapsed && group.items.map((task) => {
                          const sla = getSla(task.planned_date, task.status)
                          const unreadCount = unreadByTaskId[task.id] ?? 0
                          const hasUnreadTaskUpdates = unreadCount > 0

                          return (
                            <tr
                              key={task.id}
                              onClick={() => handleRowClick(task.id)}
                              className={`cursor-pointer transition-colors ${
                                hasUnreadTaskUpdates
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
                                  onChange={() => toggleSelection(task.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  aria-label={`Выбрать заявку ${task.task_number || `#${task.id}`}`}
                                />
                              </td>
                              {visibleColumns.number && (
                                <td className={`${cellPadding} overflow-hidden whitespace-nowrap`}>
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-mono text-gray-900 dark:text-gray-100">
                                      {task.task_number || `#${task.id}`}
                                    </span>
                                    {hasUnreadTaskUpdates && <TaskNotificationBubble count={unreadCount} />}
                                  </div>
                                </td>
                              )}
                              {visibleColumns.title && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="min-w-0 line-clamp-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {task.defect_type || task.title || 'Без описания'}
                                  </div>
                                  {(task.defect_type ? task.title : task.description) && (
                                    <div className="mt-0.5 min-w-0 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                      {task.defect_type ? task.title : task.description}
                                    </div>
                                  )}
                                </td>
                              )}
                              {visibleColumns.address && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="flex min-w-0 items-start gap-1.5">
                                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                                    <span className="min-w-0 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                                      {task.raw_address || '-'}
                                    </span>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.status && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="tasks-badge-cell max-w-full overflow-hidden">
                                    <StatusBadge status={task.status} className="max-w-full truncate" />
                                  </div>
                                </td>
                              )}
                              {visibleColumns.priority && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="tasks-badge-cell max-w-full overflow-hidden">
                                    <PriorityBadge priority={task.priority} className="max-w-full truncate" />
                                  </div>
                                </td>
                              )}
                              {visibleColumns.assignee && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <User className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                                    <span className="min-w-0 truncate text-sm text-gray-600 dark:text-gray-300">
                                      {task.assigned_user_name || '-'}
                                    </span>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.date && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <Calendar className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                                    <span className="min-w-0 truncate text-sm text-gray-500 dark:text-gray-400">
                                      {formatDateTime(task.created_at)}
                                    </span>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.sla && (
                                <td className={`${cellPadding} overflow-hidden`}>
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <Clock className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                                    <span className={`min-w-0 truncate text-sm ${sla.tone}`}>
                                      {sla.label}
                                    </span>
                                  </div>
                                </td>
                              )}
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
          {/* Pagination */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Показывать по:</span>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => { setPageSize(size); setPage(1) }}
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
            Показано {((data.page - 1) * data.size) + 1}–{Math.min(data.page * data.size, data.total)} из {data.total}
          </div>
        </>
      )}
    </div>
  )
}

function TaskNotificationBubble({ count }: { count: number }) {
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
      {count > 9 ? '9+' : count}
    </span>
  )
}

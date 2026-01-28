import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Search, Plus, RefreshCw, MapPin, Calendar, User, AlertTriangle, Clock, ChevronDown, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTasks } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { tasksApi } from '@/api/tasks'
import type { CreateTaskData } from '@/api/tasks'
import apiClient from '@/api/client'
import type { TaskStatus, TaskPriority, TaskFilters, Task } from '@/types/task'
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  normalizePriority,
  getPriorityLabel as getPriorityLabelFn,
  getStatusLabel as getStatusLabelFn,
  parsePriorityFromImport,
} from '@/config/taskConstants'
import Button from '@/components/Button'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import Pagination from '@/components/Pagination'
import EmptyState from '@/components/EmptyState'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import Badge from '@/components/Badge'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 700
const TABLE_COLUMN_COUNT = 9
const COLUMN_STORAGE_KEY = 'tasks-table-column-widths'

type ColumnKey = 'select' | 'number' | 'title' | 'address' | 'status' | 'priority' | 'assignee' | 'date' | 'sla'

interface InterfaceSettings {
  enable_resizable_columns: boolean
  compact_table_view: boolean
}

const isStatusTransitionAllowed = (fromStatus: TaskStatus, toStatus: TaskStatus) => {
  if (fromStatus === toStatus) return false
  switch (fromStatus) {
    case 'NEW':
      return toStatus === 'IN_PROGRESS' || toStatus === 'CANCELLED'
    case 'IN_PROGRESS':
      return toStatus === 'DONE' || toStatus === 'CANCELLED'
    default:
      return false
  }
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
  select: 36,
  number: 70,
  title: 160,
  address: 180,
  status: 110,
  priority: 110,
  assignee: 130,
  date: 120,
  sla: 110,
}

const loadColumnWidths = (): Record<ColumnKey, number> => {
  if (typeof window === 'undefined') return defaultColumnWidths

  try {
    const stored = localStorage.getItem(COLUMN_STORAGE_KEY)
    if (!stored) return defaultColumnWidths
    const parsed = JSON.parse(stored) as Partial<Record<ColumnKey, number>>
    const next = { ...defaultColumnWidths }
    Object.keys(next).forEach((key) => {
      const typedKey = key as ColumnKey
      const value = parsed[typedKey]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        next[typedKey] = value
      }
    })
    return next
  } catch {
    return defaultColumnWidths
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

const importHeaderMap: Record<string, string> = {
  title: 'title',
  название: 'title',
  description: 'description',
  описание: 'description',
  address: 'address',
  адрес: 'address',
  priority: 'priority',
  приоритет: 'priority',
  planned_date: 'planned_date',
  'плановая дата': 'planned_date',
  customer_name: 'customer_name',
  клиент: 'customer_name',
  customer_phone: 'customer_phone',
  телефон: 'customer_phone',
}

const parseCsv = (text: string) => {
  const rows: string[][] = []
  let current = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        i += 1
      }
      row.push(current)
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row)
      }
      row = []
      current = ''
      continue
    }

    if (!inQuotes && char === ',') {
      row.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current)
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row)
    }
  }

  return rows
}

// Используем parsePriorityFromImport из taskConstants
const parsePriorityValue = parsePriorityFromImport

export default function TasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  // auth store is available via useAuthStore if needed
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(loadColumnWidths)
  const resizeState = useRef<{
    key: ColumnKey
    startX: number
    startWidth: number
  } | null>(null)
  const initialPage = Number(searchParams.get('page') || 1)
  const [page, setPage] = useState(() => (Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1))
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || '')
  const [priorityFilter, setPriorityFilter] = useState<string>(() => searchParams.get('priority') || '')
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() => searchParams.get('assignee') || '')
  const [addressIdFilter, setAddressIdFilter] = useState<string>(() => searchParams.get('address_id') || '')
  const [addressTitleFilter, setAddressTitleFilter] = useState<string>(() => searchParams.get('address_title') || '')
  const [groupBy, setGroupBy] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')
  const [bulkPlannedDate, setBulkPlannedDate] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Build filters object
  const filters: TaskFilters = useMemo(() => ({
    page,
    size: PAGE_SIZE,
    ...(addressIdFilter ? { address_id: Number(addressIdFilter) || undefined } : {}),
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter as TaskStatus }),
    ...(priorityFilter && { priority: priorityFilter as TaskPriority }),
    ...(assigneeFilter && { assignee_id: Number(assigneeFilter) }),
  }), [page, search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter])

  const { data, isLoading, isError, error, refetch, isFetching } = useTasks(filters)
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
    (user) => user.is_active && (user.role === 'worker' || user.role === 'dispatcher')
  )

  // Handle search with debounce effect (reset page on search)
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handlePriorityFilterChange = (value: string) => {
    setPriorityFilter(value)
    setPage(1)
  }

  const handleAssigneeFilterChange = (value: string) => {
    setAssigneeFilter(value)
    setPage(1)
  }

  const handleResizeMove = useCallback((event: MouseEvent) => {
    if (!resizeState.current) return
    const { key, startX, startWidth } = resizeState.current
    const delta = event.clientX - startX
    const nextWidth = Math.max(columnMinWidths[key], startWidth + delta)

    setColumnWidths((prev) => {
      if (prev[key] === nextWidth) return prev
      return {
        ...prev,
        [key]: nextWidth,
      }
    })
  }, [])

  const stopResize = useCallback(() => {
    resizeState.current = null
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', stopResize)
  }, [handleResizeMove])

  const startResize = useCallback(
    (key: ColumnKey, event: React.MouseEvent) => {
      if (!isResizableEnabled) return
      event.preventDefault()
      resizeState.current = {
        key,
        startX: event.clientX,
        startWidth: columnWidths[key],
      }
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', stopResize)
    },
    [columnWidths, handleResizeMove, isResizableEnabled, stopResize]
  )

  useEffect(() => {
    if (!isResizableEnabled) return
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnWidths))
  }, [columnWidths, isResizableEnabled])

  useEffect(() => () => stopResize(), [stopResize])

  const renderResizeHandle = (key: ColumnKey) => {
    if (!isResizableEnabled) return null
    return (
      <div
        role="separator"
        onMouseDown={(event) => startResize(key, event)}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary-200/70"
      />
    )
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

  const exportSelected = () => {
    if (!data?.items.length || selectedIds.size === 0) {
      toast.error('Выберите заявки для экспорта')
      return
    }

    const selectedTasks = data.items.filter((task) => selectedIds.has(task.id))
    const headers = [
      'ID',
      'Номер',
      'Название',
      'Клиент',
      'Телефон',
      'Статус',
      'Приоритет',
      'Исполнитель',
      'Адрес',
      'Создана',
    ]
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = selectedTasks.map((task) => [
      task.id,
      task.task_number || `#${task.id}`,
      task.title,
      task.customer_name || '',
      task.customer_phone || '',
      task.status,
      task.priority,
      task.assigned_user_name || '',
      task.raw_address || '',
      task.created_at,
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCsv(String(cell))).join(','))
    const blob = new Blob([`\uFEFF${csv.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const downloadImportTemplate = () => {
    const headers = [
      'title',
      'description',
      'address',
      'priority',
      'planned_date',
      'customer_name',
      'customer_phone',
    ]
    const sample = [
      'Замена счетчика',
      'Проверить состояние, при необходимости заменить',
      'Москва, Тверская, 1',
      'URGENT',
      '2025-01-10T12:00',
      'Иван Иванов',
      '+79991234567',
    ]
    const csv = [headers, sample].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([`\uFEFF${csv.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tasks-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) {
        toast.error('CSV файл пустой или без данных')
        return
      }

      const headers = rows[0].map((header) => header.trim().toLowerCase())
      const fieldByIndex = headers.map((header) => importHeaderMap[header] || '')

      const tasksToCreate: CreateTaskData[] = []
      let skipped = 0

      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i]
        const payload: CreateTaskData = {
          title: '',
          description: '',
          address: '',
        }

        row.forEach((cell, index) => {
          const field = fieldByIndex[index]
          const value = cell?.trim?.() ?? ''
          if (!field || !value) return

          if (field === 'priority') {
            const parsed = parsePriorityValue(value)
            if (parsed) {
              payload.priority = parsed
            }
            return
          }

          if (field === 'planned_date') {
            payload.planned_date = value
            return
          }

          if (field === 'customer_name') {
            payload.customer_name = value
            return
          }

          if (field === 'customer_phone') {
            payload.customer_phone = value
            return
          }

          if (field === 'title') payload.title = value
          if (field === 'description') payload.description = value
          if (field === 'address') payload.address = value
        })

        if (!payload.title || !payload.address) {
          skipped += 1
          continue
        }

        tasksToCreate.push(payload)
      }

      if (tasksToCreate.length === 0) {
        toast.error('Не удалось найти строки с обязательными полями')
        return
      }

      let success = 0
      let failed = 0
      for (const task of tasksToCreate) {
        try {
          await tasksApi.createTask(task)
          success += 1
        } catch {
          failed += 1
        }
      }

      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`Импорт завершён: ${success} успешно, ${failed + skipped} ошибок`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка импорта CSV')
    } finally {
      setIsImporting(false)
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

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

  const getSla = (plannedDate?: string | null, status?: TaskStatus) => {
    if (!plannedDate) {
      return { label: 'Нет срока', tone: 'text-gray-500 dark:text-gray-400' }
    }
    if (status === 'DONE' || status === 'CANCELLED') {
      return { label: 'Закрыта', tone: 'text-gray-500 dark:text-gray-400' }
    }
    const deadline = new Date(plannedDate).getTime()
    const now = Date.now()
    const diffMs = deadline - now
    const diffHours = Math.round(Math.abs(diffMs) / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    const hoursRemainder = diffHours % 24
    const label = diffMs < 0
      ? `Просрочено на ${diffDays > 0 ? `${diffDays}д ` : ''}${hoursRemainder}ч`
      : `Осталось ${diffDays > 0 ? `${diffDays}д ` : ''}${hoursRemainder}ч`
    const tone = diffMs < 0
      ? 'text-red-600 dark:text-red-400'
      : diffHours <= 24
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-green-600 dark:text-green-400'
    return { label, tone }
  }

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

  const activeFilters = useMemo(() => {
    const items: { key: 'search' | 'status' | 'priority' | 'assignee' | 'address'; label: string; value: string }[] = []
    if (search) items.push({ key: 'search', label: 'Поиск', value: search })
    if (statusFilter) items.push({ key: 'status', label: 'Статус', value: getStatusLabel(statusFilter as TaskStatus) })
    if (priorityFilter) items.push({ key: 'priority', label: 'Приоритет', value: getPriorityLabel(priorityFilter as TaskPriority) })
    if (assigneeFilter) {
      const name = assignableUsers.find((u) => String(u.id) === assigneeFilter)?.full_name || assigneeFilter
      items.push({ key: 'assignee', label: 'Исполнитель', value: name })
    }
    if (addressIdFilter) {
      items.push({
        key: 'address',
        label: 'Адрес',
        value: addressTitleFilter || `ID ${addressIdFilter}`,
      })
    }
    return items
  }, [search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter, addressTitleFilter, assignableUsers, getPriorityLabel, getStatusLabel])

  const hasActiveFilters = activeFilters.length > 0

  const clearFilters = () => {
    setSearch('')
    setSearchInput('')
    setStatusFilter('')
    setPriorityFilter('')
    setAssigneeFilter('')
    setAddressIdFilter('')
    setAddressTitleFilter('')
    setPage(1)
  }

  const clearSingleFilter = (key: 'search' | 'status' | 'priority' | 'assignee' | 'address') => {
    switch (key) {
      case 'search':
        setSearch('')
        setSearchInput('')
        break
      case 'status':
        setStatusFilter('')
        break
      case 'priority':
        setPriorityFilter('')
        break
      case 'assignee':
        setAssigneeFilter('')
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
    { ids: number[]; status: string }
  >({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      const results = await Promise.allSettled(ids.map((id) => tasksApi.updateTaskStatus(id, status)))
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
    try {
      const result = await bulkStatusMutation.mutateAsync({ ids, status: bulkStatus })
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка массового обновления статуса')
    }
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
      toast.error(err instanceof Error ? err.message : 'Ошибка массового назначения')
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
      toast.error(err instanceof Error ? err.message : 'Ошибка массового обновления приоритета')
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
      toast.error(err instanceof Error ? err.message : 'Ошибка массового обновления даты')
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
      toast.error(err instanceof Error ? err.message : 'Ошибка массового удаления')
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
  }, [page, search, statusFilter, priorityFilter, assigneeFilter, clearSelection])

  const selectedCount = selectedIds.size
  const allSelectedOnPage =
    data?.items.length ? data.items.every((task) => selectedIds.has(task.id)) : false

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (search) nextParams.set('search', search)
    if (statusFilter) nextParams.set('status', statusFilter)
    if (priorityFilter) nextParams.set('priority', priorityFilter)
    if (assigneeFilter) nextParams.set('assignee', assigneeFilter)
    if (addressIdFilter) nextParams.set('address_id', addressIdFilter)
    if (addressTitleFilter) nextParams.set('address_title', addressTitleFilter)
    if (page > 1) nextParams.set('page', String(page))

    const next = nextParams.toString()
    const current = searchParams.toString()
    if (next !== current) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [search, statusFilter, priorityFilter, assigneeFilter, addressIdFilter, addressTitleFilter, page, searchParams, setSearchParams])

  useEffect(() => {
    const urlSearch = searchParams.get('search') || ''
    const urlStatus = searchParams.get('status') || ''
    const urlPriority = searchParams.get('priority') || ''
    const urlAssignee = searchParams.get('assignee') || ''
    const urlAddressId = searchParams.get('address_id') || ''
    const urlAddressTitle = searchParams.get('address_title') || ''
    const rawPage = Number(searchParams.get('page') || 1)
    const urlPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

    setSearch((prev) => (prev === urlSearch ? prev : urlSearch))
    setSearchInput((prev) => (prev === urlSearch ? prev : urlSearch))
    setStatusFilter((prev) => (prev === urlStatus ? prev : urlStatus))
    setPriorityFilter((prev) => (prev === urlPriority ? prev : urlPriority))
    setAssigneeFilter((prev) => (prev === urlAssignee ? prev : urlAssignee))
    setAddressIdFilter((prev) => (prev === urlAddressId ? prev : urlAddressId))
    setAddressTitleFilter((prev) => (prev === urlAddressTitle ? prev : urlAddressTitle))
    setPage((prev) => (prev === urlPage ? prev : urlPage))
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
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadImportTemplate}
          >
            Шаблон CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            isLoading={isImporting}
          >
            Импорт CSV
          </Button>
          <Button size="sm" onClick={() => navigate('/tasks/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Новая заявка
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportFileChange}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Поиск"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitSearch(searchInput)
                }
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Status filter */}
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={handleStatusFilterChange}
            placeholder="Все статусы"
          />

          {/* Priority filter */}
          <Select
            options={priorityOptions}
            value={priorityFilter}
            onChange={handlePriorityFilterChange}
            placeholder="Все приоритеты"
          />

          {/* Assignee filter */}
          <Select
            options={[
              { value: '', label: 'Все исполнители' },
              ...assignableUsers.map((user) => ({
                value: String(user.id),
                label: user.full_name || user.username,
              })),
            ]}
            value={assigneeFilter}
            onChange={handleAssigneeFilterChange}
            placeholder="Все исполнители"
          />

          {/* Grouping */}
          <Select
            options={groupOptions}
            value={groupBy}
            onChange={(value) => {
              setGroupBy(value)
              setCollapsedGroups(new Set())
            }}
            placeholder="Группировка"
          />

          {/* Clear filters */}
          {hasActiveFilters && (
            <div className="flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="self-center">
                Сбросить фильтры
              </Button>
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Активные фильтры: {activeFilters.length}
            </span>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() => clearSingleFilter(filter.key)}
                className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-600 transition"
              >
                <span className="text-gray-500 dark:text-gray-300">{filter.label}:</span>
                <span className="text-gray-800 dark:text-gray-100">{filter.value}</span>
                <X size={12} className="text-gray-400" />
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Очистить все
            </Button>
          </div>
        )}

        {data && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="info" className="dark:bg-blue-900/40 dark:text-blue-200">
              Без исполнителя: {summary.unassigned}
            </Badge>
            <Badge variant="danger" className="dark:bg-red-900/40 dark:text-red-200">
              Просроченные: {summary.overdue}
            </Badge>
            <Badge variant="warning" className="dark:bg-orange-900/40 dark:text-orange-200">
              Срок &lt; 24ч: {summary.dueSoon}
            </Badge>
            <Badge variant="primary" className="dark:bg-primary-900/40 dark:text-primary-200">
              Срочные: {summary.urgent}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner size="lg" />
        </div>
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
                  <Button variant="ghost" size="sm" onClick={exportSelected}>
                    Экспорт CSV
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Очистить
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Tasks Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className={`min-w-full divide-y divide-gray-200 dark:divide-gray-700 ${isResizableEnabled ? 'table-fixed' : ''}`}>
                {isResizableEnabled && (
                  <colgroup>
                    <col style={{ width: columnWidths.select }} />
                    <col style={{ width: columnWidths.number }} />
                    <col style={{ width: columnWidths.title }} />
                    <col style={{ width: columnWidths.address }} />
                    <col style={{ width: columnWidths.status }} />
                    <col style={{ width: columnWidths.priority }} />
                    <col style={{ width: columnWidths.assignee }} />
                    <col style={{ width: columnWidths.date }} />
                    <col style={{ width: columnWidths.sla }} />
                  </colgroup>
                )}
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        aria-label="Выбрать все на странице"
                      />
                      {renderResizeHandle('select')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      №
                      {renderResizeHandle('number')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Заявка
                      {renderResizeHandle('title')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Адрес
                      {renderResizeHandle('address')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Статус
                      {renderResizeHandle('status')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Приоритет
                      {renderResizeHandle('priority')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Исполнитель
                      {renderResizeHandle('assignee')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Дата
                      {renderResizeHandle('date')}
                    </th>
                    <th className={`relative ${cellPadding} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
                      Срок
                      {renderResizeHandle('sla')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {groupedTasks.map((group) => {
                    const isCollapsed = groupBy && collapsedGroups.has(group.key)
                    return (
                      <Fragment key={group.key}>
                        {groupBy && (
                          <tr className="bg-gray-50 dark:bg-gray-900/40">
                            <td colSpan={TABLE_COLUMN_COUNT} className={cellPadding}>
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

                          return (
                            <tr
                              key={task.id}
                              onClick={() => handleRowClick(task.id)}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
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
                              <td className={`${cellPadding} whitespace-nowrap`}>
                                <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                                  {task.task_number || `#${task.id}`}
                                </span>
                              </td>
                              <td className={cellPadding}>
                                <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                                  {task.defect_type || task.title || 'Без описания'}
                                </div>
                                {(task.defect_type ? task.title : task.description) && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                                    {task.defect_type ? task.title : task.description}
                                  </div>
                                )}
                              </td>
                              <td className={cellPadding}>
                                <div className="flex items-start gap-1.5">
                                  <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
                                  <span className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                                    {task.raw_address || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className={`${cellPadding} whitespace-nowrap`}>
                                <StatusBadge status={task.status} />
                              </td>
                              <td className={`${cellPadding} whitespace-nowrap`}>
                                <PriorityBadge priority={task.priority} />
                              </td>
                              <td className={`${cellPadding} whitespace-nowrap`}>
                                <div className="flex items-center gap-1.5">
                                  <User className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <span className="text-sm text-gray-600 dark:text-gray-300">
                                    {task.assigned_user_name || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className={`${cellPadding} whitespace-nowrap`}>
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {formatDate(task.created_at)}
                                  </span>
                                </div>
                              </td>
                              <td className={`${cellPadding} whitespace-nowrap`}>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <span className={`text-sm ${sla.tone}`}>
                                    {sla.label}
                                  </span>
                                </div>
                              </td>
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
          {data.pages > 1 && (
            <div className="mt-6 flex justify-center">
              <Pagination
                currentPage={data.page}
                totalPages={data.pages}
                onPageChange={setPage}
              />
            </div>
          )}

          {/* Page info */}
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Показано {((data.page - 1) * data.size) + 1}–{Math.min(data.page * data.size, data.total)} из {data.total}
          </div>
        </>
      )}
    </div>
  )
}

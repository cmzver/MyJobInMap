import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Search, Plus, RefreshCw, MapPin, Calendar, User, AlertTriangle, Clock, ChevronDown } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTasks } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { tasksApi } from '@/api/tasks'
import type { CreateTaskData } from '@/api/tasks'
import { useAuthStore } from '@/store/authStore'
import type { TaskStatus, TaskPriority, TaskFilters, Task } from '@/types/task'
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

const statusOptions = [
  { value: '', label: 'Все статусы' },
  { value: 'NEW', label: 'Новые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'DONE', label: 'Выполненные' },
  { value: 'CANCELLED', label: 'Отменённые' },
]

const priorityOptions = [
  { value: '', label: 'Все приоритеты' },
  { value: 'EMERGENCY', label: 'Аварийные' },
  { value: 'URGENT', label: 'Срочные' },
  { value: 'CURRENT', label: 'Текущие' },
  { value: 'PLANNED', label: 'Плановые' },
]

const statusLabels: Record<TaskStatus, string> = {
  NEW: 'Новые',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполненные',
  CANCELLED: 'Отменённые',
}

const priorityLabels: Record<string, string> = {
  EMERGENCY: 'Аварийная',
  URGENT: 'Срочная',
  CURRENT: 'Текущая',
  PLANNED: 'Плановая',
  '4': 'Аварийная',
  '3': 'Срочная',
  '2': 'Текущая',
  '1': 'Плановая',
}

const priorityKeyMap: Record<number, TaskPriority> = {
  1: 'PLANNED',
  2: 'CURRENT',
  3: 'URGENT',
  4: 'EMERGENCY',
}

const priorityValueMap: Record<TaskPriority, number> = {
  PLANNED: 1,
  CURRENT: 2,
  URGENT: 3,
  EMERGENCY: 4,
}

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

const parsePriorityValue = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (['1', '2', '3', '4'].includes(normalized)) {
    return Number(normalized)
  }
  if (['planned', 'плановая'].includes(normalized)) return 1
  if (['current', 'текущая'].includes(normalized)) return 2
  if (['urgent', 'срочная'].includes(normalized)) return 3
  if (['emergency', 'аварийная', 'аварийное', 'авария'].includes(normalized)) return 4
  return undefined
}

export default function TasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const initialPage = Number(searchParams.get('page') || 1)
  const [page, setPage] = useState(() => (Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1))
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || '')
  const [priorityFilter, setPriorityFilter] = useState<string>(() => searchParams.get('priority') || '')
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() => searchParams.get('assignee') || '')
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
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter as TaskStatus }),
    ...(priorityFilter && { priority: priorityFilter as TaskPriority }),
    ...(assigneeFilter && { assignee_id: Number(assigneeFilter) }),
  }), [page, search, statusFilter, priorityFilter, assigneeFilter])

  const { data, isLoading, isError, error, refetch, isFetching } = useTasks(filters)
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

  const getPriorityKey = useCallback((value: TaskPriority | number | string) => {
    if (typeof value === 'number') {
      return priorityKeyMap[value] || String(value)
    }
    if (typeof value === 'string') {
      if (priorityLabels[value]) return value
      const numeric = Number(value)
      if (!Number.isNaN(numeric) && priorityKeyMap[numeric]) {
        return priorityKeyMap[numeric]
      }
      return value
    }
    return ''
  }, [])

  const getPriorityLabel = useCallback((value: TaskPriority | number | string) => {
    const key = getPriorityKey(value)
    return priorityLabels[key] || String(value)
  }, [getPriorityKey])

  const getStatusLabel = useCallback((value?: TaskStatus | string) => {
    if (!value) return 'Не указан'
    return statusLabels[value as TaskStatus] || String(value)
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

  const hasActiveFilters = search || statusFilter || priorityFilter || assigneeFilter

  const clearFilters = () => {
    setSearch('')
    setSearchInput('')
    setStatusFilter('')
    setPriorityFilter('')
    setAssigneeFilter('')
    setPage(1)
  }

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(ids.map((id) => tasksApi.updateTaskStatus(id, status)))
    },
    onSuccess: () => {
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
    mutationFn: async ({ ids, priority }: { ids: number[]; priority: number }) => {
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
    const ids = Array.from(selectedIds)
    try {
      await bulkStatusMutation.mutateAsync({ ids, status: bulkStatus })
      toast.success(`Статус обновлён для ${ids.length} заявок`)
      clearSelection()
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
    const priority = priorityValueMap[bulkPriority as TaskPriority]
    if (!priority) {
      toast.error('Некорректный приоритет')
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
    if (page > 1) nextParams.set('page', String(page))

    const next = nextParams.toString()
    const current = searchParams.toString()
    if (next !== current) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [search, statusFilter, priorityFilter, assigneeFilter, page, searchParams, setSearchParams])

  useEffect(() => {
    const urlSearch = searchParams.get('search') || ''
    const urlStatus = searchParams.get('status') || ''
    const urlPriority = searchParams.get('priority') || ''
    const urlAssignee = searchParams.get('assignee') || ''
    const rawPage = Number(searchParams.get('page') || 1)
    const urlPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

    setSearch((prev) => (prev === urlSearch ? prev : urlSearch))
    setSearchInput((prev) => (prev === urlSearch ? prev : urlSearch))
    setStatusFilter((prev) => (prev === urlStatus ? prev : urlStatus))
    setPriorityFilter((prev) => (prev === urlPriority ? prev : urlPriority))
    setAssigneeFilter((prev) => (prev === urlAssignee ? prev : urlAssignee))
    setPage((prev) => (prev === urlPage ? prev : urlPage))
  }, [searchParams])

  const quickFilters = [
    { id: 'new', label: 'Новые', status: 'NEW', priority: '', assignee: '' },
    { id: 'in-progress', label: 'В работе', status: 'IN_PROGRESS', priority: '', assignee: '' },
    { id: 'urgent', label: 'Срочные', status: '', priority: 'URGENT', assignee: '' },
    { id: 'emergency', label: 'Аварийные', status: '', priority: 'EMERGENCY', assignee: '' },
    user?.id ? { id: 'mine', label: 'Мои', status: '', priority: '', assignee: String(user.id) } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; status: string; priority: string; assignee: string }>

  const applyQuickFilter = (preset: { status: string; priority: string; assignee: string }) => {
    setSearch('')
    setSearchInput('')
    setStatusFilter(preset.status)
    setPriorityFilter(preset.priority)
    setAssigneeFilter(preset.assignee)
    setPage(1)
  }

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
        <div className="flex gap-2">
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
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Быстрые фильтры
          </span>
          {quickFilters.map((preset) => {
            const isActive =
              !search &&
              statusFilter === preset.status &&
              priorityFilter === preset.priority &&
              assigneeFilter === preset.assignee
            return (
              <Button
                key={preset.id}
                size="sm"
                variant={isActive ? 'primary' : 'secondary'}
                onClick={() => applyQuickFilter(preset)}
                className="rounded-full"
              >
                {preset.label}
              </Button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Поиск по номеру, адресу, клиенту, телефону..."
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
            <Button variant="ghost" size="sm" onClick={clearFilters} className="self-center">
              Сбросить фильтры
            </Button>
          )}
        </div>

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
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        aria-label="Выбрать все на странице"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      №
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Заявка
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Адрес
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Приоритет
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Исполнитель
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Дата
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Срок
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
                            <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-2">
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
                                className="px-4 py-3 whitespace-nowrap"
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
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                                  {task.task_number || `#${task.id}`}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                                  {task.title}
                                </div>
                                {task.description && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                                    {task.description}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-1.5">
                                  <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
                                  <span className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                                    {task.raw_address || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <StatusBadge status={task.status} />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <PriorityBadge priority={task.priority} />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <User className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <span className="text-sm text-gray-600 dark:text-gray-300">
                                    {task.assigned_user_name || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {formatDate(task.created_at)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
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

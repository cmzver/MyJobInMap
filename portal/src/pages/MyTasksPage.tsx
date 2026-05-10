import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Clock,
  Filter,
  MapPin,
  Navigation,
  Phone,
  Search,
  X,
} from 'lucide-react'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { myTaskKeys } from '@/hooks/useTasks'
import { Task } from '@/types/task'
import { formatDatePretty as formatDate, formatDateShort } from '@/utils/dateFormat'
import { cn } from '@/utils/cn'

type StatusFilter = 'all' | 'NEW' | 'IN_PROGRESS' | 'DONE'
type VisibleStatusFilter = StatusFilter | 'default'
type SortOption = 'priority_desc' | 'planned_date_asc' | 'created_at_desc' | 'created_at_asc'

const priorityOrder: Record<Task['priority'], number> = {
  EMERGENCY: 4,
  URGENT: 3,
  CURRENT: 2,
  PLANNED: 1,
}

const priorityStripe: Record<Task['priority'], string> = {
  EMERGENCY: 'border-l-red-500',
  URGENT: 'border-l-orange-500',
  CURRENT: 'border-l-blue-500',
  PLANNED: 'border-l-emerald-500',
}

const priorityLabel: Record<Task['priority'], string> = {
  EMERGENCY: 'Аварийная',
  URGENT: 'Срочная',
  CURRENT: 'Текущая',
  PLANNED: 'Плановая',
}

const statusTone: Record<Task['status'], string> = {
  NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  DONE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CANCELLED: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const statusShort: Record<Task['status'], string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  DONE: 'Готово',
  CANCELLED: 'Отменена',
}

// Заголовки часто приходят с префиксами вида "[1190557] " и "№1190557" —
// номер мы и так показываем отдельно слева, поэтому вычищаем дубли.
function cleanTaskTitle(title: string, taskNumber?: string | null): string {
  let result = (title ?? '').trim()
  const numbers = [taskNumber, ...(result.match(/\d{4,}/g) ?? [])].filter(Boolean) as string[]

  // Убираем повторяющиеся "[NUM] " и "№NUM " в любом порядке в начале строки.
  let prevLength = -1
  while (result.length !== prevLength) {
    prevLength = result.length
    for (const num of numbers) {
      const escaped = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result
        .replace(new RegExp(`^\\[\\s*${escaped}\\s*\\]\\s*`), '')
        .replace(new RegExp(`^№\\s*${escaped}\\s*`), '')
    }
    result = result.replace(/^[-–—:·.\s]+/, '')
  }

  return result || title
}

export default function MyTasksPage() {
  const { user } = useAuthStore()
  const [statusFilter, setStatusFilter] = useState<VisibleStatusFilter>('default')
  const [sortBy, setSortBy] = useState<SortOption>('priority_desc')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const { data, isLoading, error } = useQuery({
    queryKey: [...myTaskKeys.list(user?.id), { search }],
    queryFn: async () => {
      const pageSize = 200
      const all: Task[] = []
      let page = 1

      while (true) {
        const params = new URLSearchParams()
        params.append('assignee_id', String(user?.id))
        params.append('page', String(page))
        params.append('size', String(pageSize))
        if (search) params.append('search', search)

        const response = await apiClient.get<{ items: Task[]; pages: number }>(
          `/tasks?${params}`,
        )
        all.push(...response.data.items)

        if (page >= (response.data.pages ?? 0) || response.data.items.length < pageSize) {
          break
        }
        page += 1
      }

      return all
    },
    enabled: !!user?.id,
    refetchOnMount: 'always',
  })

  const tasks = useMemo(() => data ?? [], [data])

  const statusFilters: { value: StatusFilter; label: string; icon: LucideIcon }[] = [
    { value: 'NEW', label: 'Новые', icon: Clock },
    { value: 'IN_PROGRESS', label: 'В работе', icon: Navigation },
    { value: 'DONE', label: 'Выполнено', icon: CheckCircle2 },
    { value: 'all', label: 'Все', icon: Filter },
  ]

  const sortOptions = [
    { value: 'priority_desc', label: 'Сначала срочные' },
    { value: 'planned_date_asc', label: 'Ближайший срок' },
    { value: 'created_at_desc', label: 'Сначала новые' },
    { value: 'created_at_asc', label: 'Сначала старые' },
  ] as const

  const openNavigation = (lat?: number, lon?: number, address?: string) => {
    if (lat != null && lon != null) {
      window.open(`https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`, '_blank', 'noopener,noreferrer')
    } else if (address) {
      window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(address)}`, '_blank', 'noopener,noreferrer')
    }
  }

  const filterCounts = useMemo(
    () => ({
      NEW: tasks.filter((task) => task.status === 'NEW').length,
      IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      DONE: tasks.filter((task) => task.status === 'DONE').length,
      all: tasks.length,
    }),
    [tasks],
  )

  const filteredTasks = useMemo(() => {
    switch (statusFilter) {
      case 'default':
        return tasks.filter((task) => task.status === 'NEW' || task.status === 'IN_PROGRESS')
      case 'NEW':
      case 'IN_PROGRESS':
      case 'DONE':
        return tasks.filter((task) => task.status === statusFilter)
      case 'all':
      default:
        return tasks
    }
  }, [statusFilter, tasks])

  const sortedTasks = useMemo(() => {
    const tasksToSort = [...filteredTasks]

    switch (sortBy) {
      case 'planned_date_asc':
        return tasksToSort.sort((left, right) => {
          const leftTime = left.planned_date ? new Date(left.planned_date).getTime() : Number.POSITIVE_INFINITY
          const rightTime = right.planned_date ? new Date(right.planned_date).getTime() : Number.POSITIVE_INFINITY
          if (leftTime !== rightTime) return leftTime - rightTime
          return priorityOrder[right.priority] - priorityOrder[left.priority]
        })
      case 'created_at_asc':
        return tasksToSort.sort(
          (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
        )
      case 'created_at_desc':
        return tasksToSort.sort(
          (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        )
      case 'priority_desc':
      default:
        return tasksToSort.sort((left, right) => {
          const byPriority = priorityOrder[right.priority] - priorityOrder[left.priority]
          if (byPriority !== 0) return byPriority

          const leftTime = left.planned_date ? new Date(left.planned_date).getTime() : Number.POSITIVE_INFINITY
          const rightTime = right.planned_date ? new Date(right.planned_date).getTime() : Number.POSITIVE_INFINITY
          if (leftTime !== rightTime) return leftTime - rightTime

          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        })
    }
  }, [filteredTasks, sortBy])

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600 dark:text-red-400">Ошибка загрузки заявок</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Мои заявки</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Список заявок, назначенных вам.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative mb-4">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Поиск по номеру, адресу, описанию или клиенту"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            aria-label="Поиск заявок"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label="Очистить поиск"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Показывать</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('default')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  statusFilter === 'default'
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                <Filter size={16} />
                <span>Активные</span>
                <span className="text-xs opacity-80">{filterCounts.NEW + filterCounts.IN_PROGRESS}</span>
              </button>

              {statusFilters.map((filter) => {
                const Icon = filter.icon
                const isActive = statusFilter === filter.value

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700',
                    )}
                  >
                    <Icon size={16} />
                    <span>{filter.label}</span>
                    <span className="text-xs opacity-80">{filterCounts[filter.value]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="w-full lg:w-[240px]">
            <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Сортировка</p>
            <Select
              options={sortOptions.map((option) => ({ value: option.value, label: option.label }))}
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              className="h-10 border-gray-200 bg-white text-sm dark:border-gray-700 dark:bg-gray-800"
              aria-label="Сортировка заявок"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
          <p className="text-base font-medium text-gray-900 dark:text-white">Нет заявок</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {statusFilter === 'default'
              ? 'Сейчас нет новых и активных заявок.'
              : statusFilter === 'all'
                ? 'У вас пока нет назначенных заявок.'
                : 'Нет заявок с выбранным статусом.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sortedTasks.map((task) => {
            const hasNavigation = task.lat != null || task.lon != null || Boolean(task.raw_address)
            const taskNumber = task.task_number || String(task.id)
            const displayTitle = cleanTaskTitle(task.title, taskNumber)
            const cardTitle = `${priorityLabel[task.priority]} · ${statusShort[task.status]} · №${taskNumber}`

            return (
              <div
                key={task.id}
                title={cardTitle}
                className={cn(
                  'group relative rounded-lg border border-l-4 border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60',
                  priorityStripe[task.priority],
                )}
              >
                <Link
                  to={`/tasks/${task.id}`}
                  aria-label={`Открыть заявку №${taskNumber}, ${priorityLabel[task.priority]}, ${statusShort[task.status]}`}
                  className="absolute inset-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />

                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                      <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                        №{taskNumber}
                      </span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          statusTone[task.status],
                        )}
                      >
                        {statusShort[task.status]}
                      </span>
                      {task.planned_date && (
                        <span
                          title={`Срок: ${formatDate(task.planned_date)}`}
                          className="inline-flex items-center gap-1"
                        >
                          <Clock size={11} className="shrink-0" />
                          {formatDateShort(task.planned_date)}
                        </span>
                      )}
                    </div>

                    <p
                      title={task.title}
                      className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white"
                    >
                      {displayTitle}
                    </p>

                    {task.raw_address && (
                      <div
                        title={task.raw_address}
                        className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                      >
                        <MapPin size={12} className="shrink-0 text-gray-400 dark:text-gray-500" />
                        <span className="min-w-0 truncate">{task.raw_address}</span>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openNavigation(task.lat ?? undefined, task.lon ?? undefined, task.raw_address)
                      }}
                      disabled={!hasNavigation}
                      aria-label="Маршрут"
                      title="Маршрут"
                      className={cn(
                        'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                        hasNavigation
                          ? 'border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
                          : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500',
                      )}
                    >
                      <Navigation size={15} />
                    </button>

                    {task.customer_phone && (
                      <a
                        href={`tel:${task.customer_phone}`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                        aria-label={`Позвонить по номеру ${task.customer_phone}`}
                        title={task.customer_phone}
                      >
                        <Phone size={15} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

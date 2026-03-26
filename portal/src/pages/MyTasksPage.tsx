import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
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

export default function MyTasksPage() {
  const { user } = useAuthStore()
  const [statusFilter, setStatusFilter] = useState<VisibleStatusFilter>('default')
  const [sortBy, setSortBy] = useState<SortOption>('priority_desc')

  const { data, isLoading, error } = useQuery({
    queryKey: myTaskKeys.list(user?.id),
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('assignee_id', String(user?.id))
      params.append('size', '100')
      const response = await apiClient.get<{ items: Task[] }>(`/tasks?${params}`)
      return response.data.items
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
        <div className="space-y-2">
          {sortedTasks.map((task) => {
            const hasNavigation = task.lat != null || task.lon != null || Boolean(task.raw_address)

            return (
              <div
                key={task.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={task.status} className="shrink-0" />
                      <PriorityBadge priority={task.priority} className="shrink-0" />
                      <span className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
                        №{task.task_number || task.id}
                      </span>
                      {task.planned_date && (
                        <span
                          title={`Срок: ${formatDate(task.planned_date)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        >
                          <Clock size={12} />
                          {formatDateShort(task.planned_date)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Link
                        to={`/tasks/${task.id}`}
                        title={task.title}
                        className="block truncate text-base font-semibold text-gray-900 transition-colors hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                      >
                        {task.title}
                      </Link>
                      {task.raw_address && (
                        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin size={16} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
                          <span className="min-w-0 truncate" title={task.raw_address}>
                            {task.raw_address}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Link
                      to={`/tasks/${task.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                    >
                      Открыть
                    </Link>

                    <button
                      type="button"
                      onClick={() => openNavigation(task.lat ?? undefined, task.lon ?? undefined, task.raw_address)}
                      disabled={!hasNavigation}
                      className={cn(
                        'inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
                        hasNavigation
                          ? 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
                          : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500',
                      )}
                    >
                      <Navigation size={14} />
                      Маршрут
                    </button>

                    {task.customer_phone && (
                      <a
                        href={`tel:${task.customer_phone}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                        aria-label={`Позвонить по номеру ${task.customer_phone}`}
                      >
                        <Phone size={14} />
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

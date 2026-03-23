import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  MapPin, 
  Clock, 
  Phone, 
  Navigation,
  Filter,
  CheckCircle2
} from 'lucide-react'
import Card from '@/components/Card'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { myTaskKeys } from '@/hooks/useTasks'
import { Task } from '@/types/task'
import { formatDateShort, formatDatePretty as formatDate } from '@/utils/dateFormat'
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

  const tasks = data ?? []

  const statusFilters: { value: StatusFilter; label: string; icon: React.ElementType }[] = [
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
    if (lat && lon) {
      window.open(`https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`, '_blank')
    } else if (address) {
      window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(address)}`, '_blank')
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
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400">Ошибка загрузки заявок</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Мои заявки</h1>
          <p className="text-gray-500 dark:text-gray-400">Заявки, назначенные вам</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {statusFilters.map((filter) => {
            const Icon = filter.icon
            const isActive = statusFilter === filter.value
            return (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                <Icon size={16} />
                <span>{filter.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-4',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
                  )}
                >
                  {filterCounts[filter.value]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="w-full lg:w-[220px]">
          <Select
            options={sortOptions.map((option) => ({ value: option.value, label: option.label }))}
            value={sortBy}
            onChange={(value) => setSortBy(value as SortOption)}
            className="rounded-2xl border-gray-200 bg-white py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
            aria-label="Сортировка заявок"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card compact className="text-center">
          <div className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <CheckCircle2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Нет заявок
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {statusFilter === 'default'
              ? 'Сейчас нет новых и активных заявок'
              : statusFilter === 'all'
              ? 'У вас пока нет назначенных заявок'
              : 'Нет заявок с выбранным статусом'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <Card
              key={task.id}
              compact
              className="border border-gray-200/80 shadow-sm transition-all duration-200 hover:border-primary-200 hover:shadow-md dark:border-gray-700 [&>div]:p-3"
            >
              <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <StatusBadge status={task.status} className="shrink-0 px-2 py-0.5 text-[10px] leading-4" />
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <PriorityBadge priority={task.priority} className="px-2 py-0.5 text-[10px] leading-4" />
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        №{task.task_number || task.id}
                      </span>
                      {task.planned_date && (
                        <span
                          title={`Срок: ${formatDate(task.planned_date)}`}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                          <Clock size={12} />
                          {formatDateShort(task.planned_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <Link 
                    to={`/tasks/${task.id}`}
                    title={task.title}
                    className="block truncate text-sm font-semibold leading-snug text-gray-900 transition hover:text-primary-600 dark:text-white dark:hover:text-primary-400 sm:text-[15px]"
                  >
                    {task.title}
                  </Link>

                  {task.raw_address && (
                    <div className="flex items-start gap-1.5 text-xs leading-5 text-gray-600 dark:text-gray-400 sm:text-sm">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-orange-500" />
                      <span className="min-w-0 truncate" title={task.raw_address}>
                        {task.raw_address}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 md:min-w-[148px] md:flex-col md:items-stretch">
                  <Link
                    to={`/tasks/${task.id}`}
                    className="inline-flex min-h-8 items-center justify-center rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-600"
                  >
                    Подробнее
                  </Link>

                  <div className="flex items-center gap-1.5 md:w-full">
                    <button
                      type="button"
                      onClick={() => openNavigation(task.lat ?? undefined, task.lon ?? undefined, task.raw_address)}
                      disabled={task.lat == null && task.lon == null && !task.raw_address}
                      className={cn(
                        'inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                        task.lat == null && task.lon == null && !task.raw_address
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30',
                      )}
                    >
                      <Navigation size={14} />
                      Маршрут
                    </button>

                    {task.customer_phone && (
                      <a
                        href={`tel:${task.customer_phone}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-green-200 bg-green-50 text-green-700 transition hover:bg-green-100 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30"
                        aria-label={`Позвонить по номеру ${task.customer_phone}`}
                      >
                        <Phone size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

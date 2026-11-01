import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Navigation, Phone, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import Button from '@/components/Button'
import Card from '@/components/Card'
import PageHeader from '@/components/PageHeader'
import PriorityBadge from '@/components/PriorityBadge'
import QueryStatePanel from '@/components/QueryStatePanel'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import { fetchAllTaskPages } from '@/api/tasks'
import { operationsApi } from '@/api/operations'
import { STATUS_HEX } from '@/config/taskConstants'
import { useUpdateTaskStatus } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import type { Task } from '@/types/task'
import { normalizeRoleForAccess } from '@/types/user'
import { showApiError } from '@/utils/apiError'
import { cn } from '@/utils/cn'

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** «Все заявки дня» в селекторе исполнителя у диспетчера. */
const ALL = 0

/**
 * Календарь и «Мой день» — одна страница: слева месяц, справа выбранный день.
 * Монтажник видит свой маршрут (порядок, навигация, звонок, «Начать»);
 * диспетчер — все заявки дня или маршрут выбранного исполнителя.
 */
export default function CalendarPage() {
  const user = useAuthStore((state) => state.user)
  const isWorker = normalizeRoleForAccess(user?.role, user?.baseAccess) === 'worker'
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())
  const [executor, setExecutor] = useState(ALL)

  const users = useUsers({ enabled: !isWorker })
  const monthTasks = useQuery({
    queryKey: ['calendar-tasks', format(month, 'yyyy-MM'), isWorker ? user?.id : null],
    queryFn: () => {
      const params = new URLSearchParams()
      params.append('planned_date_from', format(startOfMonth(month), 'yyyy-MM-dd'))
      params.append('planned_date_to', format(endOfMonth(month), 'yyyy-MM-dd'))
      if (isWorker && user?.id) params.append('assignee_id', String(user.id))
      return fetchAllTaskPages(params)
    },
  })

  const tasksOn = (day: Date) =>
    (monthTasks.data ?? []).filter((task) => task.planned_date && isSameDay(parseISO(task.planned_date), day))

  const pickDay = (day: Date) => {
    setSelected(day)
    if (!isSameMonth(day, month)) setMonth(day)
  }

  const showRoute = isWorker || executor !== ALL
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const offset = (startOfMonth(month).getDay() + 6) % 7

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь"
        description={isWorker ? 'Маршрут на день и заявки по датам' : 'Заявки по датам и маршруты исполнителей'}
        actions={
          !isWorker && (
            <Link to="/tasks/new">
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Новая заявка
              </Button>
            </Link>
          )
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Card flush>
          <div className="flex items-center justify-between px-2 py-1.5">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => setMonth(subMonths(month, 1))}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold capitalize text-gray-900 dark:text-white">
                {format(month, 'LLLL yyyy', { locale: ru })}
              </span>
              <button
                type="button"
                onClick={() => pickDay(new Date())}
                className="rounded px-1.5 text-xs text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
              >
                сегодня
              </button>
            </div>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => setMonth(addMonths(month, 1))}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="border-t border-gray-100 px-2 pb-2 dark:border-gray-700">
            <div className="grid grid-cols-7">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="py-1.5 text-center text-[11px] font-medium text-gray-400">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} />)}
              {days.map((day) => {
                const dayTasks = tasksOn(day)
                const active = isSameDay(day, selected)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => pickDay(day)}
                    title={dayTasks.length ? `Заявок: ${dayTasks.length}` : undefined}
                    className={cn(
                      'relative flex h-9 flex-col items-center justify-center rounded-md text-sm transition-colors',
                      active
                        ? 'bg-primary-500 font-semibold text-white'
                        : isToday(day)
                          ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700',
                    )}
                  >
                    {format(day, 'd')}
                    {dayTasks.length > 0 && (
                      <span className="absolute bottom-1 flex gap-0.5">
                        {dayTasks.slice(0, 3).map((task) => (
                          <span
                            key={task.id}
                            className={cn('h-1 w-1 rounded-full', active && 'bg-white/80')}
                            style={active ? undefined : { backgroundColor: STATUS_HEX[task.status] ?? STATUS_HEX.DONE }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          {monthTasks.isLoading && (
            <div className="flex justify-center border-t border-gray-100 py-2 dark:border-gray-700"><Spinner size="sm" /></div>
          )}
        </Card>

        <Card
          flush
          title={format(selected, 'EEEE, d MMMM', { locale: ru })}
          action={
            !isWorker && (
              <select
                aria-label="Чьи заявки показать"
                value={executor}
                onChange={(event) => setExecutor(Number(event.target.value))}
                className="field h-8 w-56"
              >
                <option value={ALL}>Все заявки дня</option>
                {users.data
                  ?.filter((u) => u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      Маршрут: {u.full_name || u.username}
                    </option>
                  ))}
              </select>
            )
          }
        >
          {showRoute ? (
            <DayRoute day={format(selected, 'yyyy-MM-dd')} userId={isWorker ? undefined : executor} />
          ) : (
            <DayTasks tasks={tasksOn(selected)} isLoading={monthTasks.isLoading} />
          )}
        </Card>
      </div>
    </div>
  )
}

/** Все заявки с плановой датой на выбранный день. */
function DayTasks({ tasks, isLoading }: { tasks: Task[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (tasks.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">На этот день заявок нет</p>
  }
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
      {tasks.map((task) => (
        <li key={task.id}>
          <Link to={`/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <span className="w-12 shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {task.planned_date ? format(parseISO(task.planned_date), 'HH:mm') : ''}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{task.title}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={task.raw_address}>
                {task.raw_address}
                {` · ${task.assigned_user_name || 'не назначен'}`}
              </p>
            </div>
            <PriorityBadge priority={task.priority} className="hidden shrink-0 sm:inline-flex" />
            <StatusBadge status={task.status} className="shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Маршрут исполнителя на день: открытые заявки на день, просроченные и без даты,
 * в сохранённом порядке.
 */
function DayRoute({ day, userId }: { day: string; userId?: number }) {
  const user = useAuthStore((state) => state.user)
  const client = useQueryClient()
  const key = ['my-day', user?.organizationId, userId ?? user?.id, day]
  const query = useQuery({ queryKey: key, queryFn: () => operationsApi.myDay(day, userId) })
  const ownRoute = userId === undefined || userId === user?.id
  const status = useUpdateTaskStatus()
  const route = useMutation({
    mutationFn: (ids: number[]) => operationsApi.saveRoute(day, ids, userId),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error) => showApiError(error, 'Не удалось сохранить порядок'),
  })

  if (query.isPending) return <QueryStatePanel state="loading" className="border-0" />
  if (query.isError) return <QueryStatePanel state="error" onRetry={() => query.refetch()} className="border-0" />
  const tasks = query.data.tasks
  if (tasks.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">В маршруте на этот день заявок нет</p>
  }

  const move = (index: number, shift: number) => {
    const ids = tasks.map((task) => task.id)
    const target = index + shift
    const current = ids[index]
    const next = ids[target]
    if (current === undefined || next === undefined) return
    ids[index] = next
    ids[target] = current
    route.mutate(ids)
  }

  return (
    <ol className="divide-y divide-gray-100 dark:divide-gray-700">
      {tasks.map((task, index) => (
        <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <span className="w-5 shrink-0 text-xs tabular-nums text-gray-400">{index + 1}</span>
          <div className="min-w-0 flex-1 basis-48">
            <Link to={`/tasks/${task.id}`} className="block truncate font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400">
              {task.title}
            </Link>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={task.raw_address}>
              {task.raw_address}
              {task.planned_date
                ? ` · ${format(parseISO(task.planned_date), isSameDay(parseISO(task.planned_date), parseISO(day)) ? 'HH:mm' : 'd MMM, HH:mm', { locale: ru })}`
                : ' · без даты'}
            </p>
          </div>
          <StatusBadge status={task.status} className="shrink-0" />
          <div className="flex shrink-0 items-center gap-0.5">
            <RouteIcon title="Выше" disabled={index === 0 || route.isPending} onClick={() => move(index, -1)}>
              <ArrowUp className="h-3.5 w-3.5" />
            </RouteIcon>
            <RouteIcon title="Ниже" disabled={index === tasks.length - 1 || route.isPending} onClick={() => move(index, 1)}>
              <ArrowDown className="h-3.5 w-3.5" />
            </RouteIcon>
            <a
              title="Маршрут в Яндекс Картах"
              aria-label="Маршрут"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              href={`https://yandex.ru/maps/?text=${encodeURIComponent(task.raw_address)}${task.lat && task.lon ? `&rtext=~${task.lat},${task.lon}&rtt=auto` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="h-3.5 w-3.5" />
            </a>
            {task.customer_phone && (
              <a
                title={`Позвонить ${task.customer_phone}`}
                aria-label="Позвонить"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                href={`tel:${task.customer_phone.replace(/[^+\d]/g, '')}`}
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
            )}
            {/* «Начать» — дело самого исполнителя, не диспетчера в чужом маршруте */}
            {task.status === 'NEW' && ownRoute && (
              <Button
                size="sm"
                variant="outline"
                className="ml-1 h-7 px-2.5"
                disabled={status.isPending}
                onClick={() =>
                  status.mutate(
                    { id: task.id, status: 'IN_PROGRESS' },
                    {
                      onSuccess: () => {
                        client.invalidateQueries({ queryKey: key })
                        toast.success('Работа начата')
                      },
                      onError: (error) => showApiError(error, 'Не удалось начать работу'),
                    },
                  )
                }
              >
                Начать
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function RouteIcon({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200"
    >
      {children}
    </button>
  )
}

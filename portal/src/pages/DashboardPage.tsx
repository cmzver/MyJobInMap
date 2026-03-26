import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Users,
  Zap,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import { SkeletonStats, SkeletonTaskList } from '@/components/Skeleton'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import apiClient from '@/api/client'
import type { TaskPriority, TaskStatus } from '@/types/task'

interface DashboardStats {
  totalTasks: number
  newTasks: number
  inProgressTasks: number
  completedTasks: number
  cancelledTasks: number
  totalWorkers: number
  activeWorkers: number
}

interface DayActivity {
  date: string
  created: number
  completed: number
}

interface UrgentTask {
  id: number
  title: string
  priority: string
  status: string
  planned_date: string | null
  assignee_name: string | null
}

interface DashboardActivity {
  activity: DayActivity[]
  urgentTasks: UrgentTask[]
  todayCreated: number
  todayCompleted: number
  weekCreated: number
  weekCompleted: number
}

interface RecentTask {
  id: number
  title: string
  status: string
  priority: string
  created_at: string
  assignee_name?: string
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await apiClient.get<DashboardStats>('/dashboard/stats')
      return response.data
    },
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: async () => {
      const response = await apiClient.get<DashboardActivity>('/dashboard/activity')
      return response.data
    },
  })

  const { data: recentTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['recent-tasks'],
    queryFn: async () => {
      const response = await apiClient.get<{ items: RecentTask[] }>('/tasks?size=4&sort=-created_at')
      return response.data.items
    },
  })

  const recentPreview = recentTasks ?? []
  const urgentPreview = useMemo(() => activity?.urgentTasks.slice(0, 4) ?? [], [activity?.urgentTasks])
  const maxActivityValue = useMemo(() => {
    const values = activity?.activity.map((day) => Math.max(day.created, day.completed)) ?? []
    return Math.max(1, ...values)
  }, [activity?.activity])

  const overviewCards = [
    {
      title: 'Всего заявок',
      value: stats?.totalTasks ?? 0,
      meta: 'в работе системы',
      icon: ClipboardList,
    },
    {
      title: 'Новые',
      value: stats?.newTasks ?? 0,
      meta: 'ждут разбора',
      icon: AlertTriangle,
    },
    {
      title: 'В работе',
      value: stats?.inProgressTasks ?? 0,
      meta: 'назначены в работу',
      icon: Clock,
    },
    {
      title: 'Выполнено',
      value: stats?.completedTasks ?? 0,
      meta: 'закрыто',
      icon: CheckCircle2,
    },
  ]

  const controlCards = [
    {
      title: 'Срочные заявки',
      value: activity?.urgentTasks.length ?? 0,
      meta: 'нуждаются в приоритете',
      icon: Zap,
    },
    {
      title: 'Активные исполнители',
      value: stats?.activeWorkers ?? 0,
      meta: `из ${stats?.totalWorkers ?? 0}`,
      icon: Users,
    },
    {
      title: 'Отменено',
      value: stats?.cancelledTasks ?? 0,
      meta: 'снято с исполнения',
      icon: AlertTriangle,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Дашборд</h1>
        <p className="max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Сводка по очереди заявок, работе исполнителей и активности за неделю.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        {statsLoading ? (
          <SkeletonStats count={4} className="grid-cols-2 gap-3 lg:grid-cols-4" />
        ) : (
          <Card compact>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Состояние очереди</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Основные статусы по текущим заявкам.</p>
                </div>
                <Link
                  to="/tasks"
                  className="flex items-center gap-1 text-sm text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  Все заявки <ArrowRight size={15} />
                </Link>
              </div>

              <dl className="grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700 sm:grid-cols-2 xl:grid-cols-4">
                {overviewCards.map((card) => (
                  <div key={card.title} className="bg-white px-4 py-4 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        <card.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <dt className="text-sm font-medium text-gray-600 dark:text-gray-300">{card.title}</dt>
                        <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</dd>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{card.meta}</p>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
        )}

        {statsLoading || activityLoading ? (
          <SkeletonStats count={3} className="grid-cols-1 gap-3" />
        ) : (
          <Card compact>
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Контроль смены</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Что требует внимания прямо сейчас.</p>
              </div>
              <div className="space-y-2">
                {controlCards.map((card) => (
                  <div
                    key={card.title}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        <card.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{card.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{card.meta}</p>
                      </div>
                    </div>
                    <span className="text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,0.95fr)]">
        <Card
          compact
          action={
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-sm text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Все заявки <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Последние заявки</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Новые обращения и недельная активность по системе.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(290px,0.95fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Новые в очереди</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Последние обращения, зарегистрированные в системе.
                    </p>
                  </div>
                  {!tasksLoading && recentPreview.length > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{recentPreview.length} шт.</span>
                  )}
                </div>

                {tasksLoading ? (
                  <SkeletonTaskList count={3} />
                ) : recentPreview.length > 0 ? (
                  <div className="space-y-2">
                    {recentPreview.map((task) => (
                      <Link
                        key={task.id}
                        to={`/tasks/${task.id}`}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
                            <PriorityBadge priority={task.priority as TaskPriority} className="hidden sm:inline-flex" />
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {task.assignee_name || 'Не назначен'}
                            {' • '}
                            {format(parseISO(task.created_at), 'd MMM, HH:mm', { locale: ru })}
                          </p>
                        </div>
                        <StatusBadge status={task.status as TaskStatus} className="shrink-0" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    Пока нет заявок для отображения.
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Активность за 7 дней</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Создано и закрыто по дням недели.</p>
                    </div>
                  </div>

                  {!activityLoading && activity && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {activity.weekCreated} создано / {activity.weekCompleted} закрыто
                    </p>
                  )}
                </div>

                {activityLoading ? (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                ) : activity ? (
                  <>
                    <div className="mt-4 flex h-24 items-end justify-between gap-2">
                      {activity.activity.map((day) => {
                        const createdHeight = (day.created / maxActivityValue) * 100
                        const completedHeight = (day.completed / maxActivityValue) * 100
                        const dayLabel = format(parseISO(day.date), 'EEEEE', { locale: ru })

                        return (
                          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center">
                            <div className="flex h-20 items-end gap-1">
                              <div
                                className="w-2.5 rounded-t bg-gray-400 dark:bg-gray-500"
                                style={{ height: `${createdHeight}%` }}
                                title={`Создано: ${day.created}`}
                              />
                              <div
                                className="w-2.5 rounded-t bg-gray-900 dark:bg-gray-100"
                                style={{ height: `${completedHeight}%` }}
                                title={`Выполнено: ${day.completed}`}
                              />
                            </div>
                            <span className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{dayLabel}</span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700">
                      <div className="bg-white px-3 py-3 dark:bg-gray-800">
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">{activity.todayCreated}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Создано сегодня</p>
                      </div>
                      <div className="bg-white px-3 py-3 dark:bg-gray-800">
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">{activity.todayCompleted}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Выполнено сегодня</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                        Создано
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-gray-900 dark:bg-gray-100" />
                        Выполнено
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    Нет данных по активности.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card
          compact
          action={
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-sm text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Открыть список <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Требуют внимания</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Срочные заявки с ближайшим сроком или без назначенного исполнителя.
            </p>
          </div>

          {activityLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : urgentPreview.length > 0 ? (
            <div className="space-y-2">
              {urgentPreview.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
                      <PriorityBadge priority={task.priority as TaskPriority} className="hidden sm:inline-flex" />
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {task.assignee_name || 'Не назначен'}
                      {task.planned_date && ` • срок ${format(parseISO(task.planned_date), 'd MMM, HH:mm', { locale: ru })}`}
                    </p>
                  </div>
                  <StatusBadge status={task.status as TaskStatus} className="shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Срочных заявок нет</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Сейчас аварийные заявки не требуют отдельного контроля.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

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

type OverviewTone = 'blue' | 'amber' | 'orange' | 'green' | 'red' | 'slate'

const overviewToneStyles: Record<
  OverviewTone,
  {
    panel: string
    iconShell: string
    icon: string
    value: string
  }
> = {
  blue: {
    panel: 'border-blue-200/80 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20',
    iconShell: 'bg-blue-100 dark:bg-blue-900/40',
    icon: 'text-blue-600 dark:text-blue-300',
    value: 'text-blue-700 dark:text-blue-200',
  },
  amber: {
    panel: 'border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20',
    iconShell: 'bg-amber-100 dark:bg-amber-900/40',
    icon: 'text-amber-600 dark:text-amber-300',
    value: 'text-amber-700 dark:text-amber-200',
  },
  orange: {
    panel: 'border-orange-200/80 bg-orange-50/70 dark:border-orange-900/50 dark:bg-orange-950/20',
    iconShell: 'bg-orange-100 dark:bg-orange-900/40',
    icon: 'text-orange-600 dark:text-orange-300',
    value: 'text-orange-700 dark:text-orange-200',
  },
  green: {
    panel: 'border-green-200/80 bg-green-50/70 dark:border-green-900/50 dark:bg-green-950/20',
    iconShell: 'bg-green-100 dark:bg-green-900/40',
    icon: 'text-green-600 dark:text-green-300',
    value: 'text-green-700 dark:text-green-200',
  },
  red: {
    panel: 'border-red-200/80 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20',
    iconShell: 'bg-red-100 dark:bg-red-900/40',
    icon: 'text-red-600 dark:text-red-300',
    value: 'text-red-700 dark:text-red-200',
  },
  slate: {
    panel: 'border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/60',
    iconShell: 'bg-gray-100 dark:bg-gray-700',
    icon: 'text-gray-600 dark:text-gray-200',
    value: 'text-gray-900 dark:text-white',
  },
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
      meta: `${stats?.cancelledTasks ?? 0} отменено`,
      icon: ClipboardList,
      tone: 'blue' as const,
    },
    {
      title: 'Новые',
      value: stats?.newTasks ?? 0,
      meta: 'ждут разбора',
      icon: AlertTriangle,
      tone: 'amber' as const,
    },
    {
      title: 'В работе',
      value: stats?.inProgressTasks ?? 0,
      meta: 'активный пул',
      icon: Clock,
      tone: 'orange' as const,
    },
    {
      title: 'Выполнено',
      value: stats?.completedTasks ?? 0,
      meta: 'закрыто',
      icon: CheckCircle2,
      tone: 'green' as const,
    },
    {
      title: 'Срочные',
      value: activity?.urgentTasks.length ?? 0,
      meta: 'требуют внимания',
      icon: Zap,
      tone: 'red' as const,
    },
    {
      title: 'Активные исполнители',
      value: stats?.activeWorkers ?? 0,
      meta: `из ${stats?.totalWorkers ?? 0}`,
      icon: Users,
      tone: 'slate' as const,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Дашборд</h1>
        <p className="max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Короткий срез по заявкам, приоритетам и текущей активности без дублирования навигации.
        </p>
      </div>

      {statsLoading ? (
        <SkeletonStats count={6} className="grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {overviewCards.map((card) => {
            const tone = overviewToneStyles[card.tone]

            return (
              <div
                key={card.title}
                className={`rounded-xl border px-4 py-3 transition-colors ${tone.panel}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                      {card.title}
                    </p>
                    <p className={`mt-2 text-3xl font-bold leading-none ${tone.value}`}>{card.value}</p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{card.meta}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone.iconShell}`}>
                    <card.icon className={`h-5 w-5 ${tone.icon}`} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,0.95fr)]">
        <Card
          compact
          title="Пульс заявок"
          action={
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-sm text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Все заявки <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(290px,0.95fr)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Последние заявки</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Новые элементы, которые только что поступили в систему.
                  </p>
                </div>
                {!tasksLoading && recentPreview.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {recentPreview.length} шт.
                  </span>
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
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 transition hover:border-primary-200 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-primary-800 dark:hover:bg-gray-800"
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
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Пока нет заявок для отображения.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Активность за 7 дней</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Создано и выполнено по дням.</p>
                  </div>
                </div>

                {!activityLoading && activity && (
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-300">
                    +{activity.weekCreated} / {activity.weekCompleted} закрыто
                  </div>
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
                              className="w-2.5 rounded-t bg-blue-500"
                              style={{ height: `${createdHeight}%` }}
                              title={`Создано: ${day.created}`}
                            />
                            <div
                              className="w-2.5 rounded-t bg-green-500"
                              style={{ height: `${completedHeight}%` }}
                              title={`Выполнено: ${day.completed}`}
                            />
                          </div>
                          <span className="mt-2 text-[11px] font-medium uppercase text-gray-500 dark:text-gray-400">
                            {dayLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-blue-50 px-3 py-3 dark:bg-blue-900/20">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{activity.todayCreated}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Создано сегодня</p>
                    </div>
                    <div className="rounded-lg bg-green-50 px-3 py-3 dark:bg-green-900/20">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">{activity.todayCompleted}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Выполнено сегодня</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      Создано
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
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
        </Card>

        <Card
          compact
          title="Фокус дня"
          action={
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-sm text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Открыть список <ArrowRight size={15} />
            </Link>
          }
        >
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
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 px-3 py-3 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:bg-red-950/30"
                >
                  <PriorityBadge priority={task.priority as TaskPriority} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {task.assignee_name || 'Не назначен'}
                      {task.planned_date && ` • срок ${format(parseISO(task.planned_date), 'd MMM, HH:mm', { locale: ru })}`}
                    </p>
                  </div>
                  <StatusBadge status={task.status as TaskStatus} className="shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-green-300 bg-green-50/80 px-4 py-8 text-center dark:border-green-900/40 dark:bg-green-950/20">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600 dark:text-green-300" />
              <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">Срочных заявок нет</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Аварийные и срочные заявки сейчас не требуют отдельного внимания.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

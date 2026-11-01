import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import Card from '@/components/Card'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Spinner from '@/components/Spinner'
import { SkeletonStats, SkeletonTaskList } from '@/components/Skeleton'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import apiClient from '@/api/client'
import type { TaskPriority, TaskStatus } from '@/types/task'
import { buildTaskListUrl } from '@/utils/taskListUrl'

interface DashboardStats {
  totalTasks: number
  newTasks: number
  inProgressTasks: number
  completedTasks: number
  cancelledTasks: number
  totalWorkers: number
  activeWorkers: number
  overdueTasks: number
  dueSoonTasks: number
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
  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
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

  const {
    data: recentTasks,
    isLoading: tasksLoading,
    isFetching: tasksFetching,
    isError: tasksError,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ['recent-tasks'],
    queryFn: async () => {
      const response = await apiClient.get<{ items: RecentTask[] }>('/tasks?size=4&sort=-created_at')
      return response.data.items
    },
  })

  const recentPreview = recentTasks ?? []
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
      to: buildTaskListUrl(),
    },
    {
      title: 'Новые',
      value: stats?.newTasks ?? 0,
      meta: 'ждут разбора',
      icon: AlertTriangle,
      to: buildTaskListUrl({ statuses: ['NEW'] }),
    },
    {
      title: 'В работе',
      value: stats?.inProgressTasks ?? 0,
      meta: 'назначены',
      icon: Clock,
      to: buildTaskListUrl({ statuses: ['IN_PROGRESS'] }),
    },
    {
      title: 'Выполнено',
      value: stats?.completedTasks ?? 0,
      meta: 'закрыто',
      icon: CheckCircle2,
      to: buildTaskListUrl({ statuses: ['DONE'] }),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Дашборд"
        description="Сводка по очереди заявок и активности за неделю."
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div>
          {statsLoading ? (
            <SkeletonStats count={4} className="grid-cols-2 gap-3 lg:grid-cols-4" />
          ) : statsError && !stats ? (
            <QueryStatePanel
              state="error"
              title="Не удалось загрузить состояние очереди"
              onRetry={refetchStats}
              isRetrying={statsFetching}
            />
          ) : (
            <Card flush title="Состояние очереди" action={<MoreLink to="/tasks">Все заявки</MoreLink>}>
              <dl className="grid grid-cols-2 divide-gray-100 sm:grid-cols-4 sm:divide-x dark:divide-gray-700">
                {overviewCards.map((card) => (
                  <div key={card.title} className="group relative px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <Link to={card.to} aria-label={`${card.title}: ${card.value}. Открыть список`} className="absolute inset-0" />
                    <dt className="eyebrow">{card.title}</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">{card.value}</dd>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{card.meta}</p>
                  </div>
                ))}
              </dl>
              <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="eyebrow">Активность за 7 дней</span>
                  {activity && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      создано {activity.weekCreated} · закрыто {activity.weekCompleted} · сегодня +{activity.todayCreated} / ✓{activity.todayCompleted}
                    </span>
                  )}
                </div>
                {activityLoading ? (
                  <div className="flex justify-center py-4"><Spinner /></div>
                ) : activity ? (
                  <div className="flex h-16 items-end gap-2">
                    {activity.activity.map((day) => (
                      <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center">
                        <div className="flex h-12 items-end gap-0.5" title={`Создано ${day.created}, выполнено ${day.completed}`}>
                          <div className="w-2 rounded-t bg-gray-300 dark:bg-gray-500" style={{ height: `${(day.created / maxActivityValue) * 100}%` }} />
                          <div className="w-2 rounded-t bg-primary-500" style={{ height: `${(day.completed / maxActivityValue) * 100}%` }} />
                        </div>
                        <span className="mt-1 text-[10px] text-gray-400">{format(parseISO(day.date), 'EEEEEE', { locale: ru })}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Нет данных по активности.</p>
                )}
              </div>
            </Card>
          )}
        </div>

        <div>
          <Card flush title="Последние заявки" action={<MoreLink to="/tasks">Все заявки</MoreLink>}>
            {tasksLoading ? (
              <div className="p-4"><SkeletonTaskList count={3} /></div>
            ) : tasksError && !recentTasks ? (
              <QueryStatePanel
                state="error"
                title="Не удалось загрузить последние заявки"
                onRetry={refetchTasks}
                isRetrying={tasksFetching}
                className="border-0"
              />
            ) : recentPreview.length > 0 ? (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentPreview.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      to={`/tasks/${task.id}`}
                      title={task.title}
                      priority={task.priority as TaskPriority}
                      status={task.status as TaskStatus}
                      meta={`${task.assignee_name || 'Не назначен'} · ${format(parseISO(task.created_at), 'd MMM, HH:mm', { locale: ru })}`}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Пока нет заявок.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
      {children} <ArrowRight size={14} />
    </Link>
  )
}

function TaskRow({
  to,
  title,
  priority,
  status,
  meta,
}: {
  to: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  meta: string
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{meta}</p>
      </div>
      <PriorityBadge priority={priority} className="hidden shrink-0 sm:inline-flex" />
      <StatusBadge status={status} className="shrink-0" />
    </Link>
  )
}

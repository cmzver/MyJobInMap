import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  ClipboardList, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Calendar,
  Zap,
  Activity,
  ArrowUpRight
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
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
      const response = await apiClient.get<{ items: RecentTask[] }>('/tasks?size=5&sort=-created_at')
      return response.data.items
    },
  })

  const statCards = [
    {
      title: 'Всего заявок',
      value: stats?.totalTasks ?? 0,
      icon: ClipboardList,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Новые',
      value: stats?.newTasks ?? 0,
      icon: AlertTriangle,
      color: 'bg-yellow-500',
      lightColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      textColor: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      title: 'В работе',
      value: stats?.inProgressTasks ?? 0,
      icon: Clock,
      color: 'bg-orange-500',
      lightColor: 'bg-orange-50 dark:bg-orange-900/20',
      textColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      title: 'Выполнено',
      value: stats?.completedTasks ?? 0,
      icon: CheckCircle2,
      color: 'bg-green-500',
      lightColor: 'bg-green-50 dark:bg-green-900/20',
      textColor: 'text-green-600 dark:text-green-400',
    },
  ]

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      NEW: { label: 'Новая', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
      IN_PROGRESS: { label: 'В работе', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      DONE: { label: 'Выполнена', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      CANCELLED: { label: 'Отменена', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400' },
    }
    const { label, className } = statusMap[status] || statusMap.NEW
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${className}`}>{label}</span>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Дашборд</h1>
        <p className="text-gray-500 dark:text-gray-400">Обзор системы управления заявками</p>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${stat.lightColor} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tasks */}
        <Card className="lg:col-span-2">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Последние заявки</h2>
              <Link 
                to="/tasks" 
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center"
              >
                Все заявки <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            {tasksLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : recentTasks && recentTasks.length > 0 ? (
              <div className="space-y-4">
                {recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {task.assignee_name || 'Не назначен'}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {getStatusBadge(task.status)}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Нет заявок
              </p>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card>
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Быстрые действия</h2>
          </div>
          <div className="p-5 space-y-3">
            <Link
              to="/tasks/new"
              className="flex items-center p-4 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition"
            >
              <ClipboardList size={20} className="mr-3" />
              <span className="font-medium">Создать заявку</span>
            </Link>
            <Link
              to="/map"
              className="flex items-center p-4 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <TrendingUp size={20} className="mr-3" />
              <span className="font-medium">Открыть карту</span>
            </Link>
            <Link
              to="/calendar"
              className="flex items-center p-4 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <Calendar size={20} className="mr-3" />
              <span className="font-medium">Календарь</span>
            </Link>
            <Link
              to="/users"
              className="flex items-center p-4 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <Users size={20} className="mr-3" />
              <span className="font-medium">Пользователи</span>
            </Link>
          </div>
        </Card>
      </div>

      {/* Activity and Urgent Tasks Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <Card>
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Активность за 7 дней</h2>
              </div>
              {activity && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    За неделю: <span className="font-medium text-green-600 dark:text-green-400">+{activity.weekCreated}</span> / <span className="font-medium text-blue-600 dark:text-blue-400">{activity.weekCompleted} ✓</span>
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="p-5">
            {activityLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : activity ? (
              <div className="space-y-4">
                {/* Mini bar chart */}
                <div className="flex items-end justify-between h-32 gap-2">
                  {activity.activity.map((day) => {
                    const maxValue = Math.max(...activity.activity.map(d => Math.max(d.created, d.completed)), 1)
                    const createdHeight = (day.created / maxValue) * 100
                    const completedHeight = (day.completed / maxValue) * 100
                    const dayName = format(parseISO(day.date), 'EEE', { locale: ru })
                    
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex items-end justify-center gap-0.5 h-24">
                          <div 
                            className="w-3 bg-blue-500 rounded-t transition-all"
                            style={{ height: `${createdHeight}%` }}
                            title={`Создано: ${day.created}`}
                          />
                          <div 
                            className="w-3 bg-green-500 rounded-t transition-all"
                            style={{ height: `${completedHeight}%` }}
                            title={`Выполнено: ${day.completed}`}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 capitalize">{dayName}</span>
                      </div>
                    )
                  })}
                </div>
                
                {/* Legend */}
                <div className="flex items-center justify-center gap-6 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Создано</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Выполнено</span>
                  </div>
                </div>

                {/* Today stats */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{activity.todayCreated}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Создано сегодня</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{activity.todayCompleted}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Выполнено сегодня</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Нет данных
              </p>
            )}
          </div>
        </Card>

        {/* Urgent Tasks */}
        <Card>
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Срочные заявки</h2>
              </div>
              <Link
                to="/tasks?priority=EMERGENCY&priority=URGENT"
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center"
              >
                Все срочные <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            {activityLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : activity?.urgentTasks && activity.urgentTasks.length > 0 ? (
              <div className="space-y-3">
                {activity.urgentTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition border border-red-200 dark:border-red-800/30"
                  >
                    <div className="flex-shrink-0">
                      <PriorityBadge priority={task.priority as TaskPriority} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {task.assignee_name || 'Не назначен'}
                        {task.planned_date && ` • Срок: ${format(parseISO(task.planned_date), 'd MMM', { locale: ru })}`}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <StatusBadge status={task.status as TaskStatus} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Нет срочных заявок</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Все аварийные и срочные заявки обработаны</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Workers Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Команда</h2>
              </div>
              <Link 
                to="/users" 
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center"
              >
                Управление <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.totalWorkers || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Всего работников</p>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats?.activeWorkers || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Активны сейчас</p>
              </div>
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats?.inProgressTasks || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Заявок в работе</p>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats?.newTasks || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ожидает назначения</p>
              </div>
            </div>
          </div>
        </Card>

        {/* System Status */}
        <Card>
          <div className="p-5 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Статус системы</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">API сервер</span>
              <span className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Онлайн
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">База данных</span>
              <span className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Активна
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Push уведомления</span>
              <span className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Работают
              </span>
            </div>
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <Link
                to="/admin/settings"
                className="flex items-center justify-center gap-2 w-full p-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
              >
                Системные настройки <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

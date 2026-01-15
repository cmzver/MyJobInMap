import { useState } from 'react'
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
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { Task } from '@/types/task'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

type StatusFilter = 'all' | 'NEW' | 'IN_PROGRESS' | 'DONE'

export default function MyTasksPage() {
  const { user } = useAuthStore()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-tasks', user?.id, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('assignee_id', String(user?.id))
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      params.append('size', '50')
      const response = await apiClient.get<{ items: Task[] }>(`/tasks?${params}`)
      return response.data.items
    },
    enabled: !!user?.id,
  })

  const tasks = data ?? []

  const statusFilters: { value: StatusFilter; label: string; icon: React.ElementType }[] = [
    { value: 'all', label: 'Все', icon: Filter },
    { value: 'NEW', label: 'Новые', icon: Clock },
    { value: 'IN_PROGRESS', label: 'В работе', icon: Navigation },
    { value: 'DONE', label: 'Выполнено', icon: CheckCircle2 },
  ]

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd MMM yyyy, HH:mm', { locale: ru })
    } catch {
      return dateStr
    }
  }

  const openNavigation = (lat?: number, lon?: number, address?: string) => {
    if (lat && lon) {
      window.open(`https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`, '_blank')
    } else if (address) {
      window.open(`https://yandex.ru/maps/?text=${encodeURIComponent(address)}`, '_blank')
    }
  }

  const callPhone = (phone?: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400">Ошибка загрузки заявок</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Мои заявки</h1>
        <p className="text-gray-500 dark:text-gray-400">Заявки, назначенные вам</p>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map((filter) => {
          const Icon = filter.icon
          const isActive = statusFilter === filter.value
          return (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Icon size={16} className="mr-2" />
              {filter.label}
            </button>
          )
        })}
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Нет заявок
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {statusFilter === 'all' 
              ? 'У вас пока нет назначенных заявок'
              : 'Нет заявок с выбранным статусом'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <Card key={task.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-5">
                {/* Header with priority and status */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <PriorityBadge priority={task.priority} />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      №{task.task_number || task.id}
                    </span>
                  </div>
                  <StatusBadge status={task.status} />
                </div>

                {/* Title */}
                <Link 
                  to={`/tasks/${task.id}`}
                  className="block text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 mb-3"
                >
                  {task.title}
                </Link>

                {/* Address */}
                {task.raw_address && (
                  <div className="flex items-start text-gray-600 dark:text-gray-400 mb-3">
                    <MapPin size={18} className="mr-2 mt-0.5 flex-shrink-0 text-orange-500" />
                    <span className="text-sm">{task.raw_address}</span>
                  </div>
                )}

                {/* Date */}
                {task.planned_date && (
                  <div className="flex items-center text-gray-600 dark:text-gray-400 mb-4">
                    <Clock size={18} className="mr-2 flex-shrink-0 text-blue-500" />
                    <span className="text-sm">Срок: {formatDate(task.planned_date)}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center space-x-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => openNavigation(task.lat ?? undefined, task.lon ?? undefined, task.raw_address)}
                    className="flex-1 flex items-center justify-center px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition font-medium text-sm"
                  >
                    <Navigation size={18} className="mr-2" />
                    Маршрут
                  </button>
                  
                  {task.customer_phone && (
                    <button
                      onClick={() => callPhone(task.customer_phone!)}
                      className="flex items-center justify-center px-4 py-2.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition"
                    >
                      <Phone size={18} />
                    </button>
                  )}
                  
                  <Link
                    to={`/tasks/${task.id}`}
                    className="flex-1 flex items-center justify-center px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition font-medium text-sm"
                  >
                    Подробнее
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

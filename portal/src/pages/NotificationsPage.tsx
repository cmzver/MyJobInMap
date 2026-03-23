import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2,
  Clock
} from 'lucide-react'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import Button from '@/components/Button'
import apiClient from '@/api/client'
import { type Notification } from '@/hooks/useNotifications'
import { formatDateRelative as formatDate } from '@/utils/dateFormat'

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: async () => {
      const params = filter === 'unread' ? '?is_read=false' : ''
      const response = await apiClient.get<Notification[]>(`/notifications${params}`)
      return response.data
    },
  })

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.patch(`/notifications/${id}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch('/notifications/read-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/notifications/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const notifications = data ?? []
  const unreadCount = notifications.filter(n => !n.is_read).length

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task':
        return <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
      case 'alert':
        return <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-red-600 dark:text-red-400" />
        </div>
      case 'support':
        return <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
      default:
        return <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Уведомления</h1>
          <p className="text-gray-500 dark:text-gray-400">
            {unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все прочитано'}
          </p>
        </div>
        
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => markAllAsReadMutation.mutate()}
            isLoading={markAllAsReadMutation.isPending}
          >
            <CheckCheck size={18} className="mr-2" />
            Прочитать все
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex space-x-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            filter === 'all'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            filter === 'unread'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Непрочитанные
          {unreadCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Bell className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Нет уведомлений
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {filter === 'unread' 
              ? 'Все уведомления прочитаны'
              : 'У вас пока нет уведомлений'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`p-4 transition ${
                !notification.is_read 
                  ? 'bg-primary-50/50 dark:bg-primary-900/10 border-l-4 border-l-primary-500' 
                  : ''
              }`}
            >
              <div className="flex items-start">
                {getNotificationIcon(notification.type)}
                
                <div className="ml-4 flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className={`text-sm font-medium ${
                        notification.is_read 
                          ? 'text-gray-700 dark:text-gray-300' 
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {notification.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {notification.message}
                      </p>
                      {notification.task_id && (
                        <Link
                          to={`/tasks/${notification.task_id}`}
                          className="mt-2 inline-flex text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          Открыть заявку #{notification.task_id}
                        </Link>
                      )}
                      {notification.type === 'support' && notification.support_ticket_id && (
                        <Link
                          to={`/support/${notification.support_ticket_id}`}
                          className="mt-2 inline-flex text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          Открыть тикет #{notification.support_ticket_id}
                        </Link>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      {!notification.is_read && (
                        <button
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition"
                          title="Отметить как прочитанное"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotificationMutation.mutate(notification.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                        title="Удалить"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center mt-2 text-xs text-gray-400">
                    <Clock size={12} className="mr-1" />
                    {formatDate(notification.created_at)}
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

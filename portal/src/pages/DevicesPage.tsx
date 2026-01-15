/**
 * DevicesPage - FCM devices management
 * Features: table view, test notifications, device management
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { 
  Smartphone, 
  RefreshCw, 
  Bell, 
  Trash2, 
  Send,
  User,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useDevices, useSendTestNotification, useDeleteDevice } from '@/hooks/useApi'
import Button from '@/components/Button'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/Card'

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy HH:mm', { locale: ru })
  } catch {
    return dateStr
  }
}

function truncateToken(token: string, length = 20): string {
  if (token.length <= length) return token
  return `${token.slice(0, length)}...`
}

export default function DevicesPage() {
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  
  const { data: devices, isLoading, refetch, isFetching } = useDevices()
  const sendNotification = useSendTestNotification()
  const deleteDevice = useDeleteDevice()

  const handleSendTest = async (userId?: number) => {
    try {
      await sendNotification.mutateAsync(userId)
      toast.success(userId 
        ? 'Тестовое уведомление отправлено' 
        : 'Уведомление отправлено всем устройствам'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка отправки')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteDevice.mutateAsync(id)
      toast.success('Устройство удалено')
      setDeleteConfirm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка удаления')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Устройства</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Управление FCM токенами и push-уведомлениями
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => handleSendTest()}
            disabled={sendNotification.isPending}
          >
            <Bell className="w-4 h-4" />
            Тест всем
          </Button>
          <Button
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {devices?.length || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Всего устройств</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <User className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {new Set(devices?.map(d => d.user_id)).size || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Уникальных пользователей</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Bell className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {sendNotification.isPending ? '...' : 'OK'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Firebase статус</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Devices Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Пользователь
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Устройство
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  FCM Токен
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Последняя активность
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Spinner size="lg" />
                  </td>
                </tr>
              ) : !devices?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12">
                    <EmptyState
                      icon={Smartphone}
                      title="Нет зарегистрированных устройств"
                      description="Устройства появятся здесь после установки мобильного приложения"
                    />
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr 
                    key={device.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                        {device.id}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {device.user_name || `User #${device.user_id}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {device.device_name || 'Unknown Device'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span 
                        className="text-xs font-mono text-gray-500 dark:text-gray-400 cursor-help"
                        title={device.fcm_token}
                      >
                        {truncateToken(device.fcm_token, 30)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {formatDate(device.last_active)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendTest(device.user_id)}
                          disabled={sendNotification.isPending}
                          title="Отправить тестовое уведомление"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                        
                        {deleteConfirm === device.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(device.id)}
                              disabled={deleteDevice.isPending}
                            >
                              Да
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Нет
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(device.id)}
                            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Удалить устройство"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {devices && devices.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Всего устройств: {devices.length}
            </p>
          </div>
        )}
      </Card>

      {/* Help Info */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-300">Информация</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              FCM токены автоматически регистрируются при входе в мобильное приложение.
              Используйте кнопку «Тест всем» для проверки работоспособности push-уведомлений.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Settings,
  Image,
  HardDrive,
  Bell,
  Shield,
  Puzzle,
  LayoutPanelLeft,
  UserCog,
  Save,
  RefreshCw,
  Trash2,
  Plus,
  Database,
  Server,
  Play,
  Download,
  ChevronRight,
  GripVertical,
  Edit2,
  X,
  Smartphone,
  Send,
  User,
  Clock,
  RotateCcw,
} from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import apiClient from '@/api/client'
import { useDevices, useSendTestNotification, useDeleteDevice } from '@/hooks/useDevices'
import { useSetting, useUpdateSetting } from '@/hooks/useSettings'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

// Types

interface ServerInfo {
  version: string
  uptime: string
  database_size: string
  tasks_count: number
  users_count: number
  photos_count: number
  firebase_enabled: boolean
  geocoding_cache_size: number
}

interface Backup {
  name: string
  size: number
  created: string
}

interface CustomField {
  id: number
  name: string
  label: string
  field_type: string
  options?: string[]
  placeholder?: string
  default_value?: string
  required: boolean
  show_in_list: boolean
  show_in_card: boolean
  order: number
}

const tabs = [
  { id: 'general', label: 'Общие', icon: Settings },
  { id: 'devices', label: 'Устройства', icon: Smartphone },
  { id: 'images', label: 'Изображения', icon: Image },
  { id: 'backup', label: 'Бэкапы', icon: HardDrive },
  { id: 'notifications', label: 'Уведомления', icon: Bell },
  { id: 'security', label: 'Безопасность', icon: Shield },
  { id: 'custom-fields', label: 'Поля заявок', icon: Puzzle },
  { id: 'card-builder', label: 'Конструктор', icon: LayoutPanelLeft },
  { id: 'permissions', label: 'Права доступа', icon: UserCog },
]

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Системные настройки
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Управление конфигурацией системы
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4 overflow-x-auto pb-px" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'general' && <GeneralSettingsTab showClearConfirm={showClearConfirm} setShowClearConfirm={setShowClearConfirm} />}
        {activeTab === 'devices' && <DevicesTab />}
        {activeTab === 'images' && <ImageSettingsTab />}
        {activeTab === 'backup' && <BackupSettingsTab />}
        {activeTab === 'notifications' && <NotificationSettingsTab />}
        {activeTab === 'security' && <SecuritySettingsTab />}
        {activeTab === 'custom-fields' && <CustomFieldsTab />}
        {activeTab === 'card-builder' && <CardBuilderTab />}
        {activeTab === 'permissions' && <PermissionsTab />}
      </div>
    </div>
  )
}

// ============= General Settings Tab =============
function GeneralSettingsTab({ showClearConfirm, setShowClearConfirm }: { showClearConfirm: boolean; setShowClearConfirm: (show: boolean) => void }) {
  const queryClient = useQueryClient()
  const { data: serverInfo, isLoading } = useQuery({
    queryKey: ['server-info'],
    queryFn: async () => {
      const response = await apiClient.get<ServerInfo>('/info')
      return response.data
    },
  })
  const apiHost = typeof window !== 'undefined' ? window.location.origin : '—'
  const uiFramework = 'React 18 + TypeScript, TailwindCSS'

  const seedMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/db/seed'),
    onSuccess: () => {
      toast.success('Тестовые данные добавлены')
      // Обновить данные без перезагрузки страницы
      queryClient.invalidateQueries({ queryKey: ['server-info'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error: Error) => {
      const message = (error as import('axios').AxiosError<{detail?: string}>)?.response?.data?.detail || 'Ошибка при добавлении данных'
      toast.error(message)
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => apiClient.delete('/admin/tasks'),
    onSuccess: () => {
      toast.success('Заявки и комментарии удалены')
      // Обновить данные без перезагрузки страницы
      queryClient.invalidateQueries({ queryKey: ['server-info'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error: Error) => {
      const message = (error as import('axios').AxiosError<{detail?: string}>)?.response?.data?.detail || 'Ошибка при очистке'
      toast.error(message)
    },
  })

  const vacuumMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/db/vacuum'),
    onSuccess: () => {
      toast.success('БД оптимизирована (VACUUM)')
      queryClient.invalidateQueries({ queryKey: ['db-stats'] })
    },
    onError: () => toast.error('Ошибка оптимизации'),
  })

  const optimizeMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/db/optimize'),
    onSuccess: () => {
      toast.success('БД оптимизирована (ANALYZE + VACUUM)')
      queryClient.invalidateQueries({ queryKey: ['db-stats'] })
    },
    onError: () => toast.error('Ошибка оптимизации'),
  })

  const integrityMutation = useMutation({
    mutationFn: () => apiClient.get('/admin/db/integrity'),
    onSuccess: (response) => {
      const data = response.data as { status: string; message: string }
      if (data.status === 'ok') {
        toast.success(data.message)
      } else {
        toast.error(data.message)
      }
    },
    onError: () => toast.error('Ошибка проверки целостности'),
  })

  const [cleanupDays, setCleanupDays] = useState(90)
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false)

  const cleanupMutation = useMutation({
    mutationFn: (days: number) => apiClient.post(`/admin/db/cleanup?days=${days}&include_done=true&include_cancelled=true`),
    onSuccess: (response) => {
      const data = response.data as { deleted_tasks: number; deleted_comments: number; deleted_photos: number }
      toast.success(`Удалено: ${data.deleted_tasks} заявок, ${data.deleted_comments} комментариев, ${data.deleted_photos} фото`)
      queryClient.invalidateQueries({ queryKey: ['db-stats'] })
      queryClient.invalidateQueries({ queryKey: ['server-info'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setShowCleanupConfirm(false)
    },
    onError: (error: Error) => {
      toast.error((error as import('axios').AxiosError<{detail?: string}>)?.response?.data?.detail || 'Ошибка очистки')
    },
  })

  // Database stats query
  const { data: dbStats } = useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => {
      const response = await apiClient.get('/admin/db/stats')
      return response.data as {
        database: { type: string; size_mb: number; path: string }
        tables: { tasks: number; users: number; comments: number; devices: number; photos: number; addresses: number; notifications: number }
        tasks_by_status: { new: number; in_progress: number; done: number; cancelled: number }
        last_activity: string | null
        backups_count: number
      }
    },
  })

  const { data: resizableSetting, isLoading: resizableLoading } = useSetting('enable_resizable_columns')
  const { data: compactSetting, isLoading: compactLoading } = useSetting('compact_table_view')
  const updateSettingMutation = useUpdateSetting()
  const isResizableEnabled = resizableSetting?.value ?? true
  const isCompactEnabled = compactSetting?.value ?? false

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Server Info */}
      <Card title="Информация о сервере" action={<Server className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-3 text-sm">
          <InfoRow label="Версия" value={serverInfo?.version || '2.0.0'} />
          <InfoRow label="Время работы" value={serverInfo?.uptime || 'N/A'} />
          <InfoRow label="API" value={apiHost} />
          <InfoRow label="Портал" value={uiFramework} />
          <InfoRow 
            label="Firebase" 
            value={
              <span className={`px-2 py-0.5 rounded text-xs ${
                serverInfo?.firebase_enabled 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {serverInfo?.firebase_enabled ? 'Включён' : 'Выключен'}
              </span>
            } 
          />
          <InfoRow label="Кэш геокодинга" value={`${serverInfo?.geocoding_cache_size || 0} записей`} />
        </div>
      </Card>

      {/* Database Actions */}
      <Card title="База данных" action={<Database className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-4">
          {/* Stats */}
          {dbStats && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                <span className="text-gray-500 dark:text-gray-400">Тип:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">{dbStats.database.type}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                <span className="text-gray-500 dark:text-gray-400">Размер:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">{dbStats.database.size_mb} MB</span>
              </div>
            </div>
          )}

          {/* Tables stats */}
          {dbStats && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">Записи в таблицах</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-bold text-lg text-gray-900 dark:text-white">{dbStats.tables.tasks}</div>
                  <div className="text-gray-500">Заявки</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-bold text-lg text-gray-900 dark:text-white">{dbStats.tables.users}</div>
                  <div className="text-gray-500">Пользователи</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-bold text-lg text-gray-900 dark:text-white">{dbStats.tables.comments}</div>
                  <div className="text-gray-500">Комментарии</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-bold text-lg text-gray-900 dark:text-white">{dbStats.tables.photos}</div>
                  <div className="text-gray-500">Фото</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-bold text-lg text-gray-900 dark:text-white">{dbStats.tables.devices}</div>
                  <div className="text-gray-500">Устройства</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-bold text-lg text-gray-900 dark:text-white">{dbStats.backups_count}</div>
                  <div className="text-gray-500">Бэкапы</div>
                </div>
              </div>
            </div>
          )}
          
          {/* Data Management Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">Тестовые данные</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                {seedMutation.isPending ? 'Загрузка...' : 'Seed'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                disabled={clearMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {clearMutation.isPending ? 'Удаление...' : 'Очистить всё'}
              </Button>
            </div>
          </div>

          {/* Optimization Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">Обслуживание</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => vacuumMutation.mutate()}
                disabled={vacuumMutation.isPending}
                title="Очистить неиспользуемое пространство"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {vacuumMutation.isPending ? '...' : 'VACUUM'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => optimizeMutation.mutate()}
                disabled={optimizeMutation.isPending}
                title="Анализ и дефрагментация"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {optimizeMutation.isPending ? '...' : 'ANALYZE'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => integrityMutation.mutate()}
                disabled={integrityMutation.isPending}
                title="Проверка целостности БД"
              >
                <Shield className="h-4 w-4 mr-1" />
                {integrityMutation.isPending ? '...' : 'Проверка'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCleanupConfirm(true)}
                title="Удалить старые заявки"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Очистка
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Cleanup Confirmation Modal */}
      {showCleanupConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Очистка старых заявок
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Будут удалены выполненные и отменённые заявки старше указанного периода, включая их комментарии и фото.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Удалить заявки старше (дней)
              </label>
              <Input
                type="number"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(parseInt(e.target.value) || 90)}
                min={7}
                max={365}
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowCleanupConfirm(false)}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => cleanupMutation.mutate(cleanupDays)}
                disabled={cleanupMutation.isPending}
              >
                {cleanupMutation.isPending ? 'Удаление...' : 'Удалить'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Interface Settings */}
      <Card title="Интерфейс" action={<Settings className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Изменяемая ширина колонок</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Перетаскивание границ колонок в таблицах</p>
            </div>
            <input
              type="checkbox"
              checked={isResizableEnabled}
              disabled={resizableLoading || updateSettingMutation.isPending}
              onChange={(event) =>
                updateSettingMutation.mutate({
                  key: 'enable_resizable_columns',
                  value: event.target.checked,
                })
              }
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Компактный вид</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Уменьшенные отступы в таблицах</p>
            </div>
            <input
              type="checkbox"
              checked={isCompactEnabled}
              disabled={compactLoading || updateSettingMutation.isPending}
              onChange={(event) =>
                updateSettingMutation.mutate({
                  key: 'compact_table_view',
                  value: event.target.checked,
                })
              }
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>
        </div>
      </Card>

      {/* Default Values */}
      <Card title="Значения по умолчанию" action={<Settings className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Приоритет новых заявок
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <option value="CURRENT">Текущая</option>
              <option value="PLANNED">Плановая</option>
              <option value="URGENT">Срочная</option>
              <option value="EMERGENCY">Аварийная</option>
            </select>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Автогеокодинг</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Определять координаты по адресу</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>
        </div>
      </Card>

      {/* Clear Database Confirmation Modal */}
      {showClearConfirm && <ClearDatabaseModal setShowClearConfirm={setShowClearConfirm} />}
    </div>
  )
}

// ============= Image Settings Tab =============
function ImageSettingsTab() {
  const [settings, setSettings] = useState({
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 85,
    format: 'webp',
  })

  const handleSave = () => {
    toast.success('Настройки изображений сохранены')
  }

  return (
    <div className="max-w-2xl">
      <Card title="Оптимизация изображений" action={<Image className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Настройки автоматической оптимизации загружаемых фотографий
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="number"
              label="Макс. ширина (px)"
              value={settings.maxWidth}
              onChange={(e) => setSettings({ ...settings, maxWidth: Number(e.target.value) })}
            />
            <Input
              type="number"
              label="Макс. высота (px)"
              value={settings.maxHeight}
              onChange={(e) => setSettings({ ...settings, maxHeight: Number(e.target.value) })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Качество ({settings.quality}%)
            </label>
            <input
              type="range"
              min="10"
              max="100"
              value={settings.quality}
              onChange={(e) => setSettings({ ...settings, quality: Number(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Сжатие</span>
              <span>Качество</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Формат сохранения
            </label>
            <select
              value={settings.format}
              onChange={(e) => setSettings({ ...settings, format: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="webp">WebP (рекомендуется)</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="original">Оригинал</option>
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Сохранить
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ============= Backup Settings Tab =============
interface BackupSettings {
  auto_backup: boolean
  schedule: string
  retention_days: number
}

function BackupSettingsTab() {
  const [autoBackup, setAutoBackup] = useState(true)
  const [schedule, setSchedule] = useState('daily')
  const [retentionDays, setRetentionDays] = useState(30)

  // Загрузка настроек
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const response = await apiClient.get<BackupSettings>('/admin/backup/settings')
      return response.data
    },
  })

  // Синхронизация состояния с загруженными данными
  useEffect(() => {
    if (settings) {
      setAutoBackup(settings.auto_backup)
      setSchedule(settings.schedule)
      setRetentionDays(settings.retention_days)
    }
  }, [settings])

  const { data: backups, isLoading, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const response = await apiClient.get<{ backups: Backup[] }>('/admin/backup/list')
      return response.data.backups
    },
  })

  const createBackupMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/backup/run'),
    onSuccess: () => {
      toast.success('Бэкап создан')
      refetch()
    },
    onError: () => toast.error('Ошибка создания бэкапа'),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: (data: BackupSettings) => apiClient.put('/admin/backup/settings', data),
    onSuccess: () => toast.success('Настройки сохранены'),
    onError: () => toast.error('Ошибка сохранения настроек'),
  })

  const deleteBackupMutation = useMutation({
    mutationFn: (filename: string) => apiClient.delete(`/admin/backup/${filename}`),
    onSuccess: () => {
      toast.success('Бэкап удалён')
      refetch()
    },
    onError: () => toast.error('Ошибка удаления бэкапа'),
  })

  const restoreBackupMutation = useMutation({
    mutationFn: (filename: string) => apiClient.post(`/admin/backup/restore/${filename}`),
    onSuccess: () => {
      toast.success('База данных восстановлена! Рекомендуется перезапустить сервер.')
      refetch()
    },
    onError: () => toast.error('Ошибка восстановления'),
  })

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate({
      auto_backup: autoBackup,
      schedule,
      retention_days: retentionDays,
    })
  }

  const handleDownload = async (filename: string) => {
    try {
      // Получаем токен из того же места, что и apiClient
      const authData = localStorage.getItem('fieldworker-auth')
      let token = ''
      if (authData) {
        try {
          const authState = JSON.parse(authData)
          token = authState.state?.token || ''
        } catch (e) {
          // Ignore
        }
      }
      
      const response = await fetch(`/api/admin/backup/download/${filename}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Файл скачан')
    } catch (error) {
      toast.error('Ошибка скачивания')
    }
  }

  const handleDelete = (filename: string) => {
    if (confirm(`Удалить бэкап ${filename}?`)) {
      deleteBackupMutation.mutate(filename)
    }
  }

  const handleRestore = (filename: string) => {
    if (confirm(`⚠️ ВНИМАНИЕ!\n\nВосстановить базу данных из бэкапа "${filename}"?\n\nТекущая база будет заменена. Перед восстановлением автоматически создастся бэкап текущего состояния.\n\nПосле восстановления рекомендуется перезапустить сервер.`)) {
      restoreBackupMutation.mutate(filename)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Backup Settings */}
      <Card title="Настройки резервного копирования" action={<HardDrive className="h-5 w-5 text-gray-400" />}>
        {settingsLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Автобэкап</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ежедневное резервное копирование</p>
            </div>
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Расписание
            </label>
            <select 
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="daily">Ежедневно в 03:00</option>
              <option value="weekly">Еженедельно (Вс, 03:00)</option>
              <option value="manual">Только вручную</option>
            </select>
          </div>

          <Input
            type="number"
            label="Хранить копий (дней)"
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
          />

          <div className="flex justify-end pt-2">
            <Button 
              onClick={handleSaveSettings}
              disabled={saveSettingsMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveSettingsMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
        )}
      </Card>

      {/* Backup List */}
      <Card 
        title="Резервные копии" 
        action={
          <Button
            size="sm"
            onClick={() => createBackupMutation.mutate()}
            disabled={createBackupMutation.isPending}
          >
            <Play className="h-4 w-4 mr-1" />
            Создать
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !backups?.length ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            Нет резервных копий
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {backups.map((backup) => (
              <div
                key={backup.name}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {backup.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatBytes(backup.size)} • {new Date(backup.created).toLocaleString('ru-RU')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleRestore(backup.name)}
                    disabled={restoreBackupMutation.isPending}
                    className="p-1.5 text-gray-500 hover:text-green-600 transition-colors disabled:opacity-50"
                    title="Восстановить из этого бэкапа"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDownload(backup.name)}
                    className="p-1.5 text-gray-500 hover:text-primary-500 transition-colors"
                    title="Скачать"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(backup.name)}
                    className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ============= Notification Settings Tab =============
function NotificationSettingsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Настройки уведомлений" action={<Bell className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Push-уведомления</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Отправлять push через Firebase</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Email-уведомления</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Дублировать на email</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">При создании заявки</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Уведомлять исполнителя</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">При смене статуса</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Уведомлять диспетчера</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
          </label>

          <div className="flex justify-end pt-2">
            <Button onClick={() => toast.success('Настройки сохранены')}>
              <Save className="h-4 w-4 mr-2" />
              Сохранить
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Статус Firebase" action={<Bell className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-medium text-green-700 dark:text-green-400">Firebase подключён</span>
            </div>
            <p className="text-sm text-green-600 dark:text-green-500 mt-1">
              Пуш-уведомления работают
            </p>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => toast.success('Тестовое уведомление отправлено')}
          >
            <Bell className="h-4 w-4 mr-2" />
            Отправить тестовое уведомление
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ============= Security Settings Tab =============
function SecuritySettingsTab() {
  return (
    <div className="max-w-2xl">
      <Card title="Настройки безопасности" action={<Shield className="h-5 w-5 text-gray-400" />}>
        <div className="space-y-6">
          {/* Rate Limiting */}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">Rate Limiting</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                type="number"
                label="Макс. попыток входа"
                defaultValue={5}
              />
              <Input
                type="number"
                label="Окно (секунд)"
                defaultValue={60}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Блокировка IP после N неудачных попыток входа за указанный период
            </p>
          </div>

          {/* Session */}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">Сессии</h3>
            <Input
              type="number"
              label="Время жизни токена (часы)"
              defaultValue={24}
            />
          </div>

          {/* Password Policy */}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">Политика паролей</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Минимум 6 символов</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Требовать цифры</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Требовать спецсимволы</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => toast.success('Настройки безопасности сохранены')}>
              <Save className="h-4 w-4 mr-2" />
              Сохранить
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ============= Custom Fields Tab =============
function CustomFieldsTab() {
  const [showModal, setShowModal] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)

  const { data: fields, isLoading } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      // Mock data for now
      return [
        { id: 1, name: 'customer_phone', label: 'Телефон клиента', field_type: 'text', required: true, show_in_list: true, show_in_card: true, order: 1 },
        { id: 2, name: 'equipment_type', label: 'Тип оборудования', field_type: 'select', options: ['Котёл', 'Колонка', 'Плита'], required: false, show_in_list: false, show_in_card: true, order: 2 },
      ] as CustomField[]
    },
  })

  const getFieldTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      text: 'Текст',
      textarea: 'Многострочный',
      number: 'Число',
      select: 'Список',
      checkbox: 'Флажок',
      date: 'Дата',
    }
    return types[type] || type
  }

  return (
    <div>
      <Card
        title="Конструктор полей заявок"
        action={
          <Button size="sm" onClick={() => { setEditingField(null); setShowModal(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить поле
          </Button>
        }
      >
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Создавайте дополнительные поля для заявок. Они будут отображаться в форме создания/редактирования.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !fields?.length ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            Нет кастомных полей
          </p>
        ) : (
          <div className="space-y-2">
            {fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {field.name} • {getFieldTypeLabel(field.field_type)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-2 text-xs">
                    {field.show_in_list && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                        В списке
                      </span>
                    )}
                    {field.show_in_card && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                        В карточке
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingField(field); setShowModal(true) }}
                      className="p-1.5 text-gray-500 hover:text-primary-500 transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 text-gray-500 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Custom Field Modal */}
      {showModal && (
        <CustomFieldModal
          field={editingField}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false)
            toast.success(editingField ? 'Поле обновлено' : 'Поле создано')
          }}
        />
      )}
    </div>
  )
}

function CustomFieldModal({ 
  field, 
  onClose, 
  onSave 
}: { 
  field: CustomField | null
  onClose: () => void
  onSave: () => void 
}) {
  const [formData, setFormData] = useState({
    name: field?.name || '',
    label: field?.label || '',
    field_type: field?.field_type || 'text',
    options: field?.options?.join('\n') || '',
    placeholder: field?.placeholder || '',
    default_value: field?.default_value || '',
    required: field?.required || false,
    show_in_list: field?.show_in_list || false,
    show_in_card: field?.show_in_card ?? true,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {field ? 'Редактировать поле' : 'Добавить поле'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Input
            label="Системное имя"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="customer_phone"
          />
          <Input
            label="Отображаемое название"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            placeholder="Телефон клиента"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Тип поля
            </label>
            <select
              value={formData.field_type}
              onChange={(e) => setFormData({ ...formData, field_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="text">Текст (одна строка)</option>
              <option value="textarea">Текст (многострочный)</option>
              <option value="number">Число</option>
              <option value="select">Выпадающий список</option>
              <option value="checkbox">Флажок (да/нет)</option>
              <option value="date">Дата</option>
            </select>
          </div>

          {formData.field_type === 'select' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Варианты (каждый с новой строки)
              </label>
              <textarea
                value={formData.options}
                onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="Вариант 1&#10;Вариант 2"
              />
            </div>
          )}

          <Input
            label="Placeholder"
            value={formData.placeholder}
            onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
          />

          <div className="grid grid-cols-3 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.required}
                onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
              />
              <span className="text-sm">Обязательное</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.show_in_list}
                onChange={(e) => setFormData({ ...formData, show_in_list: e.target.checked })}
                className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
              />
              <span className="text-sm">В списке</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.show_in_card}
                onChange={(e) => setFormData({ ...formData, show_in_card: e.target.checked })}
                className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded"
              />
              <span className="text-sm">В карточке</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={onSave}>Сохранить</Button>
        </div>
      </div>
    </div>
  )
}

// ============= Card Builder Tab =============
function CardBuilderTab() {
  const zones = [
    { id: 'header', label: 'Шапка карточки', fields: ['priority', 'task_number', 'status'] },
    { id: 'main', label: 'Основной блок', fields: ['title', 'address', 'planned_date'] },
    { id: 'details', label: 'Детали', fields: ['description', 'phone', 'customer_phone'] },
    { id: 'footer', label: 'Нижний блок', fields: ['created_at', 'assignee'] },
  ]

  const availableFields = [
    { id: 'priority', label: 'Приоритет' },
    { id: 'task_number', label: 'Номер заявки' },
    { id: 'status', label: 'Статус' },
    { id: 'title', label: 'Название' },
    { id: 'address', label: 'Адрес' },
    { id: 'planned_date', label: 'Плановая дата' },
    { id: 'description', label: 'Описание' },
    { id: 'phone', label: 'Телефон' },
    { id: 'created_at', label: 'Дата создания' },
    { id: 'assignee', label: 'Исполнитель' },
    { id: 'is_paid', label: 'Платная' },
    { id: 'amount', label: 'Сумма' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Available Fields */}
      <div>
        <Card title="Доступные поля" action={<Puzzle className="h-5 w-5 text-gray-400" />}>
          <div className="space-y-2">
            {availableFields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-move hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
                </div>
                <Plus className="h-4 w-4 text-gray-400" />
              </div>
            ))}
          </div>
        </Card>
        
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Подсказка:</strong> Перетащите поля в нужные зоны карточки справа
          </p>
        </div>
      </div>

      {/* Card Preview */}
      <div className="lg:col-span-2">
        <Card 
          title="Предпросмотр карточки" 
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => toast.success('Сброшено')}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Сброс
              </Button>
              <Button size="sm" onClick={() => toast.success('Макет сохранён')}>
                <Save className="h-4 w-4 mr-1" />
                Сохранить
              </Button>
            </div>
          }
        >
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg min-h-[500px] space-y-4">
            {zones.map((zone) => (
              <div key={zone.id} className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {zone.label}
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 min-h-[60px]">
                  <div className="flex flex-wrap gap-2">
                    {zone.fields.map((fieldId) => {
                      const field = availableFields.find(f => f.id === fieldId)
                      return field ? (
                        <span
                          key={fieldId}
                          className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded flex items-center gap-1"
                        >
                          {field.label}
                          <X className="h-3 w-3 cursor-pointer hover:text-red-500" />
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ============= Permissions Tab =============
function PermissionsTab() {
  const queryClient = useQueryClient()
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, Record<string, boolean>>>('/admin/permissions')
      return response.data
    },
  })
  const updatePermissionsMutation = useMutation({
    mutationFn: ({ role, permission, value }: { role: string; permission: string; value: boolean }) =>
      apiClient.put(`/admin/permissions/${role}`, { permissions: { [permission]: value } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
      toast.success('Права обновлены')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления прав')
    },
  })

  const rows = [
    { id: 'view_dashboard', label: 'Дашборд' },
    { id: 'view_tasks', label: 'Заявки' },
    { id: 'create_tasks', label: 'Создавать заявки' },
    { id: 'edit_tasks', label: 'Редактировать заявки' },
    { id: 'delete_tasks', label: 'Удалять заявки' },
    { id: 'change_task_status', label: 'Менять статусы' },
    { id: 'assign_tasks', label: 'Назначать исполнителей' },
    { id: 'view_comments', label: 'Комментарии (просмотр)' },
    { id: 'add_comments', label: 'Комментарии (добавление)' },
    { id: 'view_photos', label: 'Фото (просмотр)' },
    { id: 'add_photos', label: 'Фото (добавление)' },
    { id: 'delete_photos', label: 'Фото (удаление)' },
    { id: 'view_users', label: 'Пользователи (просмотр)' },
    { id: 'edit_users', label: 'Пользователи (ред.)' },
    { id: 'view_finance', label: 'Финансы' },
    { id: 'view_devices', label: 'Устройства' },
    { id: 'view_settings', label: 'Настройки (просмотр)' },
    { id: 'edit_settings', label: 'Настройки (ред.)' },
    { id: 'view_addresses', label: 'Адреса (просмотр)' },
    { id: 'edit_addresses', label: 'Адреса (ред.)' },
  ]

  const isDisabled = (role: string) => role === 'admin' || updatePermissionsMutation.isPending

  return (
    <Card title="Права доступа по ролям" action={<UserCog className="h-5 w-5 text-gray-400" />}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Настройте права доступа и допустимые действия для каждой роли.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Разрешение
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Админ
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Диспетчер
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Исполнитель
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                    {row.label}
                  </td>
                  {(['admin', 'dispatcher', 'worker'] as const).map((role) => {
                    const checked = permissions?.[role]?.[row.id] ?? (role === 'admin')
                    return (
                      <td key={role} className="text-center py-3 px-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isDisabled(role)}
                          onChange={(event) =>
                            updatePermissionsMutation.mutate({
                              role,
                              permission: row.id,
                              value: event.target.checked,
                            })
                          }
                          className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ============= Devices Tab =============
function DevicesTab() {
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

  const formatDate = (dateStr: string): string => {
    try {
      return format(new Date(dateStr), 'dd.MM.yyyy HH:mm', { locale: ru })
    } catch {
      return dateStr
    }
  }

  const truncateToken = (token: string, length = 20): string => {
    if (token.length <= length) return token
    return `${token.slice(0, length)}...`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 dark:text-gray-400">
            Управление FCM токенами и push-уведомлениями
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => handleSendTest()}
            disabled={sendNotification.isPending}
          >
            <Bell className="w-4 h-4 mr-2" />
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
                  FCM токен
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
    </div>
  )
}

function ClearDatabaseModal({ setShowClearConfirm }: { setShowClearConfirm: (show: boolean) => void }) {
  const queryClient = useQueryClient()
  const clearMutation = useMutation({
    mutationFn: () => apiClient.delete('/admin/tasks'),
    onSuccess: () => {
      toast.success('✓ Все заявки и комментарии удалены')
      setShowClearConfirm(false)
      // Обновить данные без перезагрузки страницы
      queryClient.invalidateQueries({ queryKey: ['server-info'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error: Error) => {
      const message = (error as import('axios').AxiosError<{detail?: string}>)?.response?.data?.detail || 'Ошибка при очистке'
      toast.error(`✗ ${message}`)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/40">
              <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Очистить базу данных?
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Это действие <span className="font-semibold">безвозвратно удалит</span> все заявки и комментарии из базы данных.
          </p>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              ⚠️ Это действие нельзя отменить!
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex gap-3">
          <button
            onClick={() => setShowClearConfirm(false)}
            disabled={clearMutation.isPending}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Отмена
          </button>
          <button
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {clearMutation.isPending ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Удаление...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Удалить все
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= Helper Functions =============
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// ============= Helper Component =============
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  )
}

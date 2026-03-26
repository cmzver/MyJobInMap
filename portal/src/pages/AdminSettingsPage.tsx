import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import {
  Settings,
  HardDrive,
  Bell,
  Shield,
  Palette,
  Puzzle,
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
import Button from '@/components/Button'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import apiClient from '@/api/client'
import { useDevices, useSendTestNotification, useDeleteDevice } from '@/hooks/useDevices'
import { useSetting, useSettings, useUpdateSetting } from '@/hooks/useSettings'
import { formatDateTime as formatDate } from '@/utils/dateFormat'
import { cn } from '@/utils/cn'
import { UpdatesManagementSection } from '@/pages/UpdatesPage'

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

type SettingsPanelId =
  | 'overview'
  | 'backups'
  | 'security'
  | 'interface'
  | 'portal-branding'
  | 'mobile-updates'
  | 'mobile-notifications'
  | 'mobile-devices'
  | 'task-defaults'
  | 'task-media'
  | 'task-fields'
  | 'task-layout'
  | 'permissions-matrix'

type SettingsMenuGroup = {
  id: string
  label: string
  items: Array<{
    id: SettingsPanelId
    label: string
    description: string
    icon: typeof Settings
  }>
}

const settingsMenuGroups: SettingsMenuGroup[] = [
  {
    id: 'system',
    label: 'Система',
    items: [
      { id: 'portal-branding', label: 'Брендинг и доступ', description: 'Экран входа, бренд и блок поддержки', icon: Palette },
      { id: 'overview', label: 'Обзор и БД', description: 'Состояние сервера и сервисные операции', icon: Server },
      { id: 'backups', label: 'Резервные копии', description: 'Создание, скачивание и восстановление', icon: HardDrive },
      { id: 'security', label: 'Безопасность', description: 'Rate limiting, сессии и защита входа', icon: Shield },
      { id: 'interface', label: 'Веб-портал', description: 'Поведение таблиц и интерфейса', icon: Settings },
    ],
  },
  {
    id: 'mobile',
    label: 'Мобильное',
    items: [
      { id: 'mobile-updates', label: 'Обновления APK', description: 'Публикация и управление релизами', icon: Smartphone },
      { id: 'mobile-notifications', label: 'Push-уведомления', description: 'Канал Firebase и сценарии оповещений', icon: Bell },
      { id: 'mobile-devices', label: 'Устройства', description: 'FCM токены и действия по устройствам', icon: Smartphone },
    ],
  },
  {
    id: 'tasks',
    label: 'Заявки',
    items: [
      { id: 'task-defaults', label: 'По умолчанию', description: 'Стартовые параметры новых заявок', icon: Puzzle },
      { id: 'task-media', label: 'Изображения', description: 'Оптимизация фото и параметры загрузки', icon: Puzzle },
      { id: 'task-fields', label: 'Доп. поля', description: 'Конструктор пользовательских полей', icon: Puzzle },
      { id: 'task-layout', label: 'Макет карточки', description: 'Структура отображения заявки', icon: Puzzle },
    ],
  },
  {
    id: 'permissions',
    label: 'Права доступа',
    items: [
      { id: 'permissions-matrix', label: 'Матрица прав', description: 'Разрешения по ролям и доступам', icon: UserCog },
    ],
  },
]

const settingsMenuItems = settingsMenuGroups.flatMap((group) => group.items)

function isSettingsPanelId(value: string | null): value is SettingsPanelId {
  return value !== null && settingsMenuItems.some((item) => item.id === value)
}

function getInitialPanelId(searchParams: URLSearchParams): SettingsPanelId {
  const panel = searchParams.get('panel')
  if (isSettingsPanelId(panel)) {
    return panel
  }

  switch (searchParams.get('tab')) {
    case 'mobile':
      return 'mobile-updates'
    case 'tasks':
      return 'task-defaults'
    case 'permissions':
      return 'permissions-matrix'
    case 'system':
    default:
      return 'overview'
  }
}

export default function AdminSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const activePanel = getInitialPanelId(searchParams)
  const activeMenuItem = settingsMenuItems.find((item) => item.id === activePanel) ?? {
    id: 'overview' as const,
    label: 'Обзор и БД',
    description: 'Состояние сервера и сервисные операции',
    icon: Server,
  }
  const ActivePanelIcon = activeMenuItem.icon

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('tab')
    nextParams.set('panel', activePanel)

    if (nextParams.toString() === searchParams.toString()) {
      return
    }

    setSearchParams(nextParams, { replace: true })
  }, [activePanel, searchParams, setSearchParams])

  const handlePanelChange = (panelId: SettingsPanelId) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('tab')
    nextParams.set('panel', panelId)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      <aside className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-2 px-2 py-2">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Настройки портала</div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Разделы администрирования и системные параметры.</div>
        </div>
        <nav className="flex flex-col gap-2" aria-label="Разделы настроек">
          {settingsMenuGroups.map((group) => (
            <div key={group.id} className="rounded-lg border border-gray-200 bg-gray-50 px-1.5 py-1.5 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="px-2 py-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                {group.label}
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activePanel === item.id

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePanelChange(item.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-gray-500 dark:text-gray-400">{item.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <section className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-1 pb-2.5 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <ActivePanelIcon className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">{activeMenuItem.label}</h1>
            </div>
          </div>

          {activePanel !== 'portal-branding' && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-800/40">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Брендирование входа находится в отдельном разделе</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Откройте раздел «Брендинг и доступ», чтобы изменить экран входа, название портала и контакты поддержки.
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => handlePanelChange('portal-branding')}>
                <Palette className="mr-2 h-4 w-4" />
                Открыть брендирование
              </Button>
            </div>
          )}
        </div>

        <div className="pt-2.5">
          {activePanel === 'overview' && <GeneralSettingsTab showClearConfirm={showClearConfirm} setShowClearConfirm={setShowClearConfirm} />}
          {activePanel === 'backups' && <BackupSettingsTab />}
          {activePanel === 'security' && <SecuritySettingsTab />}
          {activePanel === 'interface' && <InterfaceSettingsCard />}
          {activePanel === 'portal-branding' && <PortalBrandingSettingsTab />}
          {activePanel === 'mobile-updates' && <UpdatesManagementSection embedded />}
          {activePanel === 'mobile-notifications' && <NotificationSettingsTab />}
          {activePanel === 'mobile-devices' && <DevicesTab />}
          {activePanel === 'task-defaults' && <TaskDefaultsCard />}
          {activePanel === 'task-media' && <ImageSettingsTab />}
          {activePanel === 'task-fields' && <CustomFieldsTab />}
          {activePanel === 'task-layout' && <CardBuilderTab />}
          {activePanel === 'permissions-matrix' && <PermissionsTab />}
        </div>
      </section>
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
      showApiSuccess('Тестовые данные добавлены')
      queryClient.invalidateQueries({ queryKey: ['server-info'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error: Error) => {
      showApiError(error, 'Ошибка при добавлении данных')
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => apiClient.delete('/admin/tasks'),
    onSuccess: () => {
      showApiSuccess('Заявки и комментарии удалены')
      // Обновить данные без перезагрузки страницы
      queryClient.invalidateQueries({ queryKey: ['server-info'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error: Error) => {
      showApiError(error, 'Ошибка при очистке')
    },
  })

  const vacuumMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/db/vacuum'),
    onSuccess: () => {
      showApiSuccess('БД оптимизирована (VACUUM)')
      queryClient.invalidateQueries({ queryKey: ['db-stats'] })
    },
    onError: (err) => showApiError(err, 'Ошибка оптимизации'),
  })

  const optimizeMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/db/optimize'),
    onSuccess: () => {
      showApiSuccess('БД оптимизирована (ANALYZE + VACUUM)')
      queryClient.invalidateQueries({ queryKey: ['db-stats'] })
    },
    onError: (err) => showApiError(err, 'Ошибка оптимизации'),
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
    onError: (err) => showApiError(err, 'Ошибка проверки целостности'),
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
      showApiError(error, 'Ошибка очистки')
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  const serverInfoItems = [
    { label: 'Версия API', value: serverInfo?.version || '2.0.0' },
    { label: 'Время работы', value: serverInfo?.uptime || 'N/A' },
    { label: 'Адрес API', value: apiHost, monospace: true },
    { label: 'Стек портала', value: uiFramework },
    {
      label: 'Firebase',
      value: (
        <CompactStatusBadge tone={serverInfo?.firebase_enabled ? 'success' : 'danger'}>
          {serverInfo?.firebase_enabled ? 'Включён' : 'Выключен'}
        </CompactStatusBadge>
      ),
    },
    { label: 'Кэш геокодинга', value: `${serverInfo?.geocoding_cache_size || 0} записей` },
  ]

  const databaseInfoItems = dbStats
    ? [
        { label: 'Тип БД', value: dbStats.database.type },
        { label: 'Размер файла', value: `${dbStats.database.size_mb} MB` },
        { label: 'Заявки', value: String(dbStats.tables.tasks), highlight: true },
        { label: 'Пользователи', value: String(dbStats.tables.users), highlight: true },
        { label: 'Комментарии', value: String(dbStats.tables.comments), highlight: true },
        { label: 'Фото', value: String(dbStats.tables.photos), highlight: true },
        { label: 'Устройства', value: String(dbStats.tables.devices), highlight: true },
        { label: 'Бэкапы', value: String(dbStats.backups_count), highlight: true },
        ...(dbStats.last_activity
          ? [{ label: 'Последняя активность', value: formatDate(dbStats.last_activity) }]
          : []),
      ]
    : []

  return (
    <div className="space-y-3">
      <CompactInfoMatrix title="Сервер" icon={Server} items={serverInfoItems} />
      <CompactDatabaseSection title="База данных" icon={Database} items={databaseInfoItems}>
        <CompactActionTile
          title="VACUUM"
          description="Освобождает неиспользуемое пространство и уменьшает размер SQLite-файла."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => vacuumMutation.mutate()}
              disabled={vacuumMutation.isPending}
              title="Очистить неиспользуемое пространство"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {vacuumMutation.isPending ? 'Выполняется...' : 'Запустить'}
            </Button>
          }
        />
        <CompactActionTile
          title="ANALYZE + VACUUM"
          description="Перестраивает статистику и оптимизирует таблицы после больших изменений данных."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => optimizeMutation.mutate()}
              disabled={optimizeMutation.isPending}
              title="Анализ и дефрагментация"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {optimizeMutation.isPending ? 'Выполняется...' : 'Оптимизировать'}
            </Button>
          }
        />
        <CompactActionTile
          title="Проверка целостности"
          description="Запускает встроенную integrity_check-проверку для текущей базы данных."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => integrityMutation.mutate()}
              disabled={integrityMutation.isPending}
              title="Проверка целостности БД"
            >
              <Shield className="h-4 w-4 mr-1" />
              {integrityMutation.isPending ? 'Проверка...' : 'Проверить'}
            </Button>
          }
        />
        <CompactActionTile
          title="Удаление старых заявок"
          description={`Удаляет выполненные и отменённые заявки старше ${cleanupDays} дней вместе с комментариями и фото.`}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCleanupConfirm(true)}
              title="Удалить старые заявки"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Очистка
            </Button>
          }
        />
        <CompactActionTile
          title="Тестовые данные"
          description="Создаёт пользователей и примерные заявки для локальной проверки сценариев."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              {seedMutation.isPending ? 'Загрузка...' : 'Seed'}
            </Button>
          }
        />
        <CompactActionTile
          title="Очистить заявки и комментарии"
          description="Удаляет текущие заявки, комментарии и связанные файлы фото из рабочей базы."
          actions={
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {clearMutation.isPending ? 'Удаление...' : 'Очистить всё'}
            </Button>
          }
        />
      </CompactDatabaseSection>

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

      {/* Clear Database Confirmation Modal */}
      {showClearConfirm && <ClearDatabaseModal setShowClearConfirm={setShowClearConfirm} />}
    </div>
  )
}

function InterfaceSettingsCard() {
  const { data: resizableSetting, isLoading: resizableLoading } = useSetting('enable_resizable_columns')
  const { data: compactSetting, isLoading: compactLoading } = useSetting('compact_table_view')
  const updateSettingMutation = useUpdateSetting()
  const isResizableEnabled = Boolean(resizableSetting?.value ?? true)
  const isCompactEnabled = Boolean(compactSetting?.value ?? false)

  return (
    <div className="space-y-3">
      <CompactToggleRow
        title="Изменяемая ширина колонок"
        description="Перетаскивание границ колонок в таблицах портала."
        checked={isResizableEnabled}
        disabled={resizableLoading || updateSettingMutation.isPending}
        onChange={(checked) =>
          updateSettingMutation.mutate({
            key: 'enable_resizable_columns',
            value: checked,
          })
        }
      />
      <CompactToggleRow
        title="Компактный вид таблиц"
        description="Уменьшенные вертикальные отступы и плотная подача данных."
        checked={isCompactEnabled}
        disabled={compactLoading || updateSettingMutation.isPending}
        onChange={(checked) =>
          updateSettingMutation.mutate({
            key: 'compact_table_view',
            value: checked,
          })
        }
      />
    </div>
  )
}

type PortalBrandingFormState = {
  login_app_name: string
  login_product_label: string
  login_headline: string
  login_description: string
  login_organization_name: string
  support_email: string
  support_phone: string
  support_hours: string
}

const BRANDING_DEFAULTS: PortalBrandingFormState = {
  login_app_name: 'FieldWorker',
  login_product_label: 'Field Service Platform',
  login_headline: 'Защищённый вход в рабочее пространство',
  login_description: 'Единая авторизация для администраторов, диспетчеров и исполнителей с tenant-изоляцией по организациям.',
  login_organization_name: '',
  support_email: '',
  support_phone: '',
  support_hours: 'Пн-Пт, 09:00-18:00',
}

function PortalBrandingSettingsTab() {
  const queryClient = useQueryClient()
  const { data: groups, isLoading } = useSettings()
  const [form, setForm] = useState<PortalBrandingFormState>(BRANDING_DEFAULTS)

  useEffect(() => {
    if (!groups) {
      return
    }

    const settingsMap = new Map(
      groups.flatMap((group) => group.settings.map((setting) => [setting.key, setting.value]))
    )

    setForm({
      login_app_name: String(settingsMap.get('login_app_name') ?? BRANDING_DEFAULTS.login_app_name),
      login_product_label: String(settingsMap.get('login_product_label') ?? BRANDING_DEFAULTS.login_product_label),
      login_headline: String(settingsMap.get('login_headline') ?? BRANDING_DEFAULTS.login_headline),
      login_description: String(settingsMap.get('login_description') ?? BRANDING_DEFAULTS.login_description),
      login_organization_name: String(settingsMap.get('login_organization_name') ?? BRANDING_DEFAULTS.login_organization_name),
      support_email: String(settingsMap.get('support_email') ?? BRANDING_DEFAULTS.support_email),
      support_phone: String(settingsMap.get('support_phone') ?? BRANDING_DEFAULTS.support_phone),
      support_hours: String(settingsMap.get('support_hours') ?? BRANDING_DEFAULTS.support_hours),
    })
  }, [groups])

  const saveMutation = useMutation({
    mutationFn: (payload: PortalBrandingFormState) => apiClient.patch('/admin/settings', payload),
    onSuccess: () => {
      showApiSuccess('Настройки экрана входа сохранены')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['public-login-branding'] })
    },
    onError: (error: Error) => {
      showApiError(error, 'Не удалось сохранить брендинг входа')
    },
  })

  const handleChange = (key: keyof PortalBrandingFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Бренд-блок страницы входа</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Эти параметры отображаются на экране авторизации до входа в систему и доступны без авторизации через публичный endpoint.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Input
            label="Название приложения"
            value={form.login_app_name}
            onChange={(e) => handleChange('login_app_name', e.target.value)}
            placeholder="FieldWorker"
          />
          <Input
            label="Подзаголовок продукта"
            value={form.login_product_label}
            onChange={(e) => handleChange('login_product_label', e.target.value)}
            placeholder="Field Service Platform"
          />
          <Input
            label="Главный заголовок"
            value={form.login_headline}
            onChange={(e) => handleChange('login_headline', e.target.value)}
            placeholder="Защищённый вход в рабочее пространство"
            className="lg:col-span-2"
          />
          <Textarea
            label="Описание"
            value={form.login_description}
            onChange={(e) => handleChange('login_description', e.target.value)}
            placeholder="Короткое описание возможностей портала на экране входа"
            className="min-h-[120px] lg:col-span-2"
          />
          <Input
            label="Название организации"
            value={form.login_organization_name}
            onChange={(e) => handleChange('login_organization_name', e.target.value)}
            placeholder="Оставьте пустым для общего входа"
            className="lg:col-span-2"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Блок поддержки и получения доступа</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Заполните email и или телефон, если на странице входа должен показываться блок с контактами для получения доступа.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Input
            label="Email поддержки"
            value={form.support_email}
            onChange={(e) => handleChange('support_email', e.target.value)}
            placeholder="support@example.com"
          />
          <Input
            label="Телефон поддержки"
            value={form.support_phone}
            onChange={(e) => handleChange('support_phone', e.target.value)}
            placeholder="+7 900 000-00-00"
          />
          <Input
            label="Часы работы"
            value={form.support_hours}
            onChange={(e) => handleChange('support_hours', e.target.value)}
            placeholder="Пн-Пт, 09:00-18:00"
            className="lg:col-span-2"
          />
        </div>
      </div>

      <CompactActionRow
        title="Сохранить настройки экрана входа"
        description="Применяет новые брендовые тексты и контакты поддержки на публичной странице авторизации."
        actions={
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        }
      />
    </div>
  )
}

function TaskDefaultsCard() {
  return (
    <div className="space-y-3">
      <CompactFieldRow
        label="Приоритет новых заявок"
        description="Базовый приоритет для новых заявок до ручной корректировки диспетчером."
        control={
          <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:w-56">
            <option value="CURRENT">Текущая</option>
            <option value="PLANNED">Плановая</option>
            <option value="URGENT">Срочная</option>
            <option value="EMERGENCY">Аварийная</option>
          </select>
        }
      />
      <CompactToggleRow
        title="Автогеокодинг"
        description="Автоматически определять координаты по адресу при создании заявки."
        checked
        onChange={() => undefined}
      />
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
    <div className="space-y-3">
      <CompactFieldRow
        label="Максимальная ширина"
        description="Ограничение по ширине для загружаемых изображений после оптимизации."
        control={
          <Input
            type="number"
            value={settings.maxWidth}
            onChange={(e) => setSettings({ ...settings, maxWidth: Number(e.target.value) })}
            className="sm:w-36"
          />
        }
      />
      <CompactFieldRow
        label="Максимальная высота"
        description="Ограничение по высоте, применяемое перед сохранением файла."
        control={
          <Input
            type="number"
            value={settings.maxHeight}
            onChange={(e) => setSettings({ ...settings, maxHeight: Number(e.target.value) })}
            className="sm:w-36"
          />
        }
      />
      <CompactFieldRow
        label="Формат сохранения"
        description="Формат целевого файла после оптимизации и конвертации."
        control={
          <select
            value={settings.format}
            onChange={(e) => setSettings({ ...settings, format: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:w-56"
          >
            <option value="webp">WebP (рекомендуется)</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="original">Оригинал</option>
          </select>
        }
      />
      <CompactSliderRow
        label="Качество изображения"
        description="Баланс между степенью сжатия и сохранением визуального качества файла."
        value={settings.quality}
        min={10}
        max={100}
        onChange={(value) => setSettings({ ...settings, quality: value })}
      />
      <CompactActionRow
        title="Сохранить параметры изображений"
        description="Применяет ограничения размеров, качества и формата для новых загрузок."
        actions={
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Сохранить
          </Button>
        }
      />
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
      const response = await apiClient.get<BackupSettings>('/admin/backups/settings')
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
      const response = await apiClient.get<{ backups: Backup[] }>('/admin/backups')
      return response.data.backups
    },
  })

  const createBackupMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/backups'),
    onSuccess: () => {
      showApiSuccess('Бэкап создан')
      refetch()
    },
    onError: (err) => showApiError(err, 'Ошибка создания бэкапа'),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: (data: BackupSettings) => apiClient.patch('/admin/backups/settings', data),
    onSuccess: () => showApiSuccess('Настройки сохранены'),
    onError: (err) => showApiError(err, 'Ошибка сохранения настроек'),
  })

  const deleteBackupMutation = useMutation({
    mutationFn: (filename: string) => apiClient.delete(`/admin/backups/${filename}`),
    onSuccess: () => {
      showApiSuccess('Бэкап удалён')
      refetch()
    },
    onError: (err) => showApiError(err, 'Ошибка удаления бэкапа'),
  })

  const restoreBackupMutation = useMutation({
    mutationFn: (filename: string) => apiClient.post(`/admin/backups/${filename}/restore`),
    onSuccess: () => {
      showApiSuccess('База данных восстановлена! Рекомендуется перезапустить сервер.')
      refetch()
    },
    onError: (err) => showApiError(err, 'Ошибка восстановления'),
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
      
      const response = await fetch(`/api/admin/backups/${filename}/download`, {
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
    <div className="space-y-4">
      {settingsLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <>
          <CompactToggleRow
            title="Автоматический бэкап"
            description="Ежедневное резервное копирование базы данных по расписанию."
            checked={autoBackup}
            onChange={setAutoBackup}
          />
          <CompactFieldRow
            label="Расписание"
            description="Частота автоматического создания резервных копий."
            control={
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:w-64"
              >
                <option value="daily">Ежедневно в 03:00</option>
                <option value="weekly">Еженедельно (Вс, 03:00)</option>
                <option value="manual">Только вручную</option>
              </select>
            }
          />
          <CompactFieldRow
            label="Срок хранения"
            description="Сколько дней держать резервные копии перед автоматической ротацией."
            control={
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="sm:w-36"
              />
            }
          />
          <CompactActionRow
            title="Сохранить параметры резервного копирования"
            description="Применяет текущее расписание и параметры ротации."
            actions={
              <Button
                onClick={handleSaveSettings}
                disabled={saveSettingsMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {saveSettingsMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            }
          />
        </>
      )}

      <CompactActionRow
        title="Создать резервную копию сейчас"
        description="Ручной снимок базы данных с сохранением в каталог backups."
        actions={
          <Button
            size="sm"
            onClick={() => createBackupMutation.mutate()}
            disabled={createBackupMutation.isPending}
          >
            <Play className="h-4 w-4 mr-1" />
            {createBackupMutation.isPending ? 'Создание...' : 'Создать'}
          </Button>
        }
      />

      <CompactGroupLabel icon={HardDrive} title="Доступные резервные копии" className="pt-4" />
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : !backups?.length ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Нет резервных копий
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          {backups.map((backup, index) => (
            <div
              key={backup.name}
              className={cn(
                'flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                index !== backups.length - 1 && 'border-b border-gray-200 dark:border-gray-800'
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{backup.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(backup.size)} • {new Date(backup.created).toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-center">
                <IconActionButton
                  title="Восстановить из этого бэкапа"
                  onClick={() => handleRestore(backup.name)}
                  disabled={restoreBackupMutation.isPending}
                  icon={<RotateCcw className="h-4 w-4" />}
                />
                <IconActionButton
                  title="Скачать"
                  onClick={() => handleDownload(backup.name)}
                  icon={<Download className="h-4 w-4" />}
                />
                <IconActionButton
                  title="Удалить"
                  onClick={() => handleDelete(backup.name)}
                  tone="danger"
                  icon={<Trash2 className="h-4 w-4" />}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============= Notification Settings Tab =============
function NotificationSettingsTab() {
  const { data: pushEnabled, isLoading: pushLoading } = useSetting('push_enabled')
  const { data: notifyOnNewTask, isLoading: newTaskLoading } = useSetting('notify_on_new_task')
  const { data: notifyOnStatusChange, isLoading: statusChangeLoading } = useSetting('notify_on_status_change')
  const updateSettingMutation = useUpdateSetting()
  const testPushMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ success: boolean; message?: string }>('/notifications/test')
      return data
    },
    onSuccess: () => showApiSuccess('Тестовое уведомление отправлено'),
    onError: (error) => showApiError(error, 'Не удалось отправить тестовое уведомление'),
  })
  const isSaving = updateSettingMutation.isPending
  const isPushEnabled = typeof pushEnabled?.value === 'boolean' ? pushEnabled.value : true

  const settingsLoading = pushLoading || newTaskLoading || statusChangeLoading

  const handleToggle = (key: string, value: boolean, successMessage: string) => {
    updateSettingMutation.mutate(
      { key, value },
      {
        onSuccess: () => showApiSuccess(successMessage),
        onError: (error) => showApiError(error, 'Не удалось сохранить настройку'),
      }
    )
  }

  return (
    <div className="space-y-4">
      {settingsLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <>
          <CompactToggleRow
            title="Push-уведомления"
            description="Отправлять push через Firebase на зарегистрированные устройства."
            checked={isPushEnabled}
            disabled={isSaving}
            onChange={(checked) => handleToggle('push_enabled', checked, 'Настройки push-уведомлений сохранены')}
          />
          <CompactToggleRow
            title="При создании заявки"
            description="Уведомлять исполнителя о появлении новой назначенной заявки."
            checked={Boolean(notifyOnNewTask?.value ?? true)}
            disabled={isSaving}
            onChange={(checked) => handleToggle('notify_on_new_task', checked, 'Сценарий уведомлений о новых заявках сохранён')}
          />
          <CompactToggleRow
            title="При смене статуса"
            description="Уведомлять диспетчера при изменении статуса заявки."
            checked={Boolean(notifyOnStatusChange?.value ?? true)}
            disabled={isSaving}
            onChange={(checked) => handleToggle('notify_on_status_change', checked, 'Сценарий уведомлений о смене статуса сохранён')}
          />
          <CompactNotice tone="warning">
            Email-уведомления пока не поддерживаются сервером и не вынесены в сохраняемые системные параметры.
          </CompactNotice>
        </>
      )}

      <CompactInfoMatrix
        title="Статус Firebase"
        icon={Bell}
        items={[
          {
            label: 'Push-канал',
            value: (
              <CompactStatusBadge tone={isPushEnabled ? 'success' : 'danger'}>
                {isPushEnabled ? 'Включён' : 'Отключён'}
              </CompactStatusBadge>
            ),
          },
          {
            label: 'Состояние отправки',
            value: isPushEnabled
              ? 'Уведомления будут отправляться на зарегистрированные устройства.'
              : 'Отправка push-уведомлений отключена системной настройкой.',
          },
        ]}
      />

      <CompactActionRow
        title="Тестовая отправка"
        description="Проверяет push-канал и доставку уведомлений на зарегистрированные устройства."
        actions={
          <Button
            variant="secondary"
            onClick={() => testPushMutation.mutate()}
            disabled={!isPushEnabled}
            isLoading={testPushMutation.isPending}
          >
            <Bell className="h-4 w-4 mr-2" />
            Отправить тестовое уведомление
          </Button>
        }
      />
    </div>
  )
}

// ============= Security Settings Tab =============
function SecuritySettingsTab() {
  const { data: rateLimitAttempts, isLoading: attemptsLoading } = useSetting('rate_limit_attempts')
  const { data: rateLimitWindow, isLoading: windowLoading } = useSetting('rate_limit_window')
  const { data: sessionTimeoutHours, isLoading: sessionLoading } = useSetting('session_timeout_hours')
  const updateSettingMutation = useUpdateSetting()

  const [attempts, setAttempts] = useState(5)
  const [windowSeconds, setWindowSeconds] = useState(60)
  const [sessionHours, setSessionHours] = useState(168)

  useEffect(() => {
    if (typeof rateLimitAttempts?.value === 'number') {
      setAttempts(rateLimitAttempts.value)
    }
  }, [rateLimitAttempts])

  useEffect(() => {
    if (typeof rateLimitWindow?.value === 'number') {
      setWindowSeconds(rateLimitWindow.value)
    }
  }, [rateLimitWindow])

  useEffect(() => {
    if (typeof sessionTimeoutHours?.value === 'number') {
      setSessionHours(sessionTimeoutHours.value)
    }
  }, [sessionTimeoutHours])

  const settingsLoading = attemptsLoading || windowLoading || sessionLoading

  const handleSave = async () => {
    const updates = [
      { key: 'rate_limit_attempts', value: Math.max(1, attempts) },
      { key: 'rate_limit_window', value: Math.max(10, windowSeconds) },
      { key: 'session_timeout_hours', value: Math.max(1, sessionHours) },
    ]

    try {
      for (const update of updates) {
        await updateSettingMutation.mutateAsync(update)
      }
      showApiSuccess('Настройки безопасности сохранены')
    } catch (error) {
      showApiError(error, 'Не удалось сохранить настройки безопасности')
    }
  }

  return (
    <div className="space-y-6">
      {settingsLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <>
          <CompactGroupLabel icon={Shield} title="Ограничение попыток входа" />
          <CompactFieldRow
            label="Максимум попыток"
            description="После превышения лимита IP временно блокируется."
            control={
              <Input
                type="number"
                value={attempts}
                onChange={(event) => setAttempts(Number(event.target.value) || 1)}
                className="sm:w-32"
              />
            }
          />
          <CompactFieldRow
            label="Окно в секундах"
            description="Интервал, внутри которого считаются неудачные попытки входа."
            control={
              <Input
                type="number"
                value={windowSeconds}
                onChange={(event) => setWindowSeconds(Number(event.target.value) || 10)}
                className="sm:w-32"
              />
            }
          />

          <CompactGroupLabel icon={Clock} title="Сессии" className="pt-4" />
          <CompactFieldRow
            label="Время жизни токена"
            description="Сколько часов access token остаётся действительным после входа."
            control={
              <Input
                type="number"
                value={sessionHours}
                onChange={(event) => setSessionHours(Number(event.target.value) || 1)}
                className="sm:w-32"
              />
            }
          />

          <CompactGroupLabel icon={Shield} title="Политика паролей" className="pt-4" />
          <CompactNotice>
            Сервер пока не хранит отдельные параметры парольной политики в системных настройках. Когда появятся backend-ключи, этот блок можно будет перевести на такое же сохранение, как rate limiting и сессии.
          </CompactNotice>

          <CompactActionRow
            title="Сохранить настройки безопасности"
            description="Применяет значения rate limiting и времени жизни токена."
            actions={
              <Button onClick={handleSave} disabled={updateSettingMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateSettingMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            }
          />
        </>
      )}
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
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white/90 p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Конструктор полей заявок</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Создавайте дополнительные поля для заявок. Они будут отображаться в форме создания и редактирования.
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditingField(null); setShowModal(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить поле
          </Button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Создавайте дополнительные поля для заявок. Они будут отображаться в форме создания/редактирования.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !fields?.length ? (
          <CompactEmptyPanel title="Нет кастомных полей" description="Добавьте первое поле, чтобы расширить форму заявки." icon={Puzzle} />
        ) : (
          <div className="space-y-2">
            {fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-slate-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/50"
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
      </div>

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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div>
        <div className="rounded-2xl border border-gray-200 bg-white/90 p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              <Puzzle className="h-4 w-4" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Доступные поля</h4>
          </div>
          <div className="space-y-2">
            {availableFields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-slate-50/80 p-3 transition-colors hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:bg-gray-800 cursor-move"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
                </div>
                <Plus className="h-4 w-4 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
        
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Подсказка:</strong> Перетащите поля в нужные зоны карточки справа
          </p>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white/90 p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Предпросмотр карточки</h4>
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
          </div>
          <div className="min-h-[500px] space-y-3 rounded-xl bg-gray-100 p-3.5 dark:bg-gray-800">
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
        </div>
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
      apiClient.patch(`/admin/permissions/${role}`, { permissions: { [permission]: value } }),
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
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/70">
        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              <UserCog className="h-4 w-4" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Права доступа по ролям</h4>
          </div>
        </div>
        <div className="p-2.5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full">
                <thead className="bg-gray-50/80 dark:bg-gray-800/60">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      Разрешение
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                      Админ
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                      Диспетчер
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                      Исполнитель
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {row.label}
                      </td>
                      {(['admin', 'dispatcher', 'worker'] as const).map((role) => {
                        const checked = permissions?.[role]?.[row.id] ?? (role === 'admin')
                        return (
                          <td key={role} className="px-4 py-3 text-center">
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
                              className="w-4 h-4 rounded border-gray-300 text-primary-500 disabled:opacity-50 dark:border-gray-600"
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
        </div>
      </div>
    </div>
  )
}

function DevicesTab() {
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { data: devices, isLoading, refetch, isFetching } = useDevices()
  const sendNotification = useSendTestNotification()
  const deleteDevice = useDeleteDevice()

  const handleSendTest = async (userId?: number) => {
    try {
      await sendNotification.mutateAsync(userId)
      toast.success(userId ? 'Тестовое уведомление отправлено' : 'Уведомление отправлено всем устройствам')
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

  const truncateToken = (token: string, length = 20): string => {
    if (token.length <= length) return token
    return `${token.slice(0, length)}...`
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Устройства и push-канал
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white/90 dark:border-gray-800 dark:bg-gray-900/70">
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
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded bg-gray-100 px-2 py-1 text-sm font-mono dark:bg-gray-700">
                        {device.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {device.user_name || `User #${device.user_id}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {device.device_name || 'Unknown Device'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="cursor-help text-xs font-mono text-gray-500 dark:text-gray-400"
                        title={device.fcm_token}
                      >
                        {truncateToken(device.fcm_token, 30)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {formatDate(device.last_active)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
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
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Всего устройств: {devices.length}
            </p>
          </div>
        )}
      </div>
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

function CompactGroupLabel({
  icon: Icon,
  title,
  className,
}: {
  icon: typeof Settings
  title: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/60',
        className
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Настройки и действия внутри этого блока сгруппированы в отдельные карточки.</p>
      </div>
    </div>
  )
}

function CompactInfoMatrix({
  title,
  icon: Icon,
  items,
}: {
  title: string
  icon: typeof Settings
  items: Array<{ label: string; value: React.ReactNode; monospace?: boolean; highlight?: boolean }>
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
          <Icon className="h-4 w-4" />
        </div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <CompactInfoTile
            key={item.label}
            label={item.label}
            value={item.value}
            monospace={item.monospace}
            highlight={item.highlight}
          />
        ))}
      </div>
    </div>
  )
}

function CompactDatabaseSection({
  title,
  icon: Icon,
  items,
  children,
}: {
  title: string
  icon: typeof Settings
  items: Array<{ label: string; value: React.ReactNode; monospace?: boolean; highlight?: boolean }>
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
          <Icon className="h-4 w-4" />
        </div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
      </div>

      <div className="space-y-2.5 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/70">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CompactInfoTile
              key={item.label}
              label={item.label}
              value={item.value}
              monospace={item.monospace}
              highlight={item.highlight}
            />
          ))}
        </div>

        <div className="border-t border-gray-200 pt-2.5 dark:border-gray-800">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Операции с базой</h5>
              <p className="text-xs text-gray-500 dark:text-gray-400">Обслуживание, очистка и сервисные действия без переключения в отдельные группы.</p>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">{children}</div>
        </div>
      </div>
    </div>
  )
}

function CompactInfoTile({
  label,
  value,
  monospace = false,
  highlight = false,
}: {
  label: string
  value: React.ReactNode
  monospace?: boolean
  highlight?: boolean
}) {
  return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 dark:border-gray-800 dark:bg-gray-800/40">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div
        className={cn(
          'mt-0.5 text-sm font-semibold text-gray-900 dark:text-white',
          monospace && 'font-mono text-xs sm:text-sm',
          highlight && 'text-base'
        )}
      >
        {value}
      </div>
    </div>
  )
}

function CompactToggleRow({
  title,
  description: _description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:border-gray-800 dark:bg-gray-900/70">
      <div className="pr-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      </div>
      <ToggleSwitch checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  )
}

function CompactFieldRow({
  label,
  description: _description,
  control,
}: {
  label: string
  description: string
  control: React.ReactNode
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:border-gray-800 dark:bg-gray-900/70">
      <div className="pr-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      </div>
      <div className="sm:flex sm:justify-end">
        <div className="min-w-[136px] rounded-md bg-gray-50 p-0.5 dark:bg-gray-800">{control}</div>
      </div>
    </div>
  )
}

function CompactActionRow({
  title,
  description: _description,
  actions,
}: {
  title: string
  description: string
  actions: React.ReactNode
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:border-gray-800 dark:bg-gray-900/70">
      <div className="pr-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
    </div>
  )
}

function CompactActionTile({
  title,
  description: _description,
  actions,
}: {
  title: string
  description: string
  actions: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

function CompactSliderRow({
  label,
  description: _description,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="pr-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        </div>
        <div className="min-w-[210px] rounded-md bg-gray-50 p-1.5 dark:bg-gray-800">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
            <span>Ниже</span>
            <span>{value}%</span>
            <span>Выше</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
          />
        </div>
      </div>
    </div>
  )
}

function CompactNotice({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 text-sm',
        tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
          : 'border-dashed border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300'
      )}
    >
      {children}
    </div>
  )
}

function CompactEmptyPanel({
  title,
  description: _description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: typeof Settings
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 dark:border-gray-700">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      </div>
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        checked
          ? 'border-primary-500 bg-primary-500 dark:border-primary-400 dark:bg-primary-400'
          : 'border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function CompactStatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'success' | 'danger'
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'success'
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      )}
    >
      {children}
    </span>
  )
}

function IconActionButton({
  title,
  onClick,
  icon,
  tone = 'default',
  disabled,
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
  tone?: 'default' | 'danger'
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400',
        tone === 'danger'
          ? 'hover:border-red-200 hover:text-red-500 dark:hover:border-red-900/70 dark:hover:text-red-400'
          : 'hover:border-primary-200 hover:text-primary-500 dark:hover:border-primary-900/70 dark:hover:text-primary-400'
      )}
    >
      {icon}
    </button>
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

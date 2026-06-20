import { useCallback, useState, useEffect } from 'react'
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
  Bot,
  Power,
} from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import apiClient from '@/api/client'
import { useDevices, useSendTestNotification, useDeleteDevice } from '@/hooks/useDevices'
import { useUsers } from '@/hooks/useUsers'
import { useSetting, useSettings, useUpdateSetting } from '@/hooks/useSettings'
import { useTelegramBotSettings, useUpdateTelegramBotSettings } from '@/hooks/useSettings'
import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  useToggleCustomField,
} from '@/hooks/useSettings'
import type {
  TelegramGroupMapping,
  TelegramKnownGroup,
  CustomField,
  CustomFieldCreateData,
  CustomFieldUpdateData,
} from '@/hooks/useSettings'
import { formatDateTime as formatDate } from '@/utils/dateFormat'
import { cn } from '@/utils/cn'
import { UpdatesManagementSection } from '@/pages/UpdatesPage'
import IpProtectionPanel from '@/components/security/IpProtectionPanel'
import type { LucideIcon } from 'lucide-react'
import {
  SettingsCard,
  SettingsField,
  SettingsToggle,
  SettingsRows,
  SettingsSelect,
  SettingsIconButton,
  SettingRow,
  StatRow,
} from '@/components/settings/SettingsSection'
import { settingsTokens } from '@/components/settings/tokens'
import Badge from '@/components/Badge'
import {
  SettingsSaveContext,
  useRegisterSettingsSave,
} from '@/components/settings/SettingsSaveContext'
import type { SettingsSaveState } from '@/components/settings/SettingsSaveContext'

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
  | 'permissions-matrix'
  | 'telegram-bot'

type SettingsTabId = 'system' | 'tasks' | 'notifications' | 'security' | 'portal' | 'integrations'

type SettingsTab = {
  id: SettingsTabId
  label: string
  description: string
  icon: LucideIcon
  panels: SettingsPanelId[]
}

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'system', label: 'Система', description: 'Состояние сервера, база данных и резервные копии.', icon: Server, panels: ['overview'] },
  { id: 'tasks', label: 'Заявки', description: 'Параметры новых заявок и дополнительные поля.', icon: Puzzle, panels: ['task-defaults', 'task-media', 'task-fields'] },
  { id: 'notifications', label: 'Уведомления', description: 'Push-канал и зарегистрированные устройства.', icon: Bell, panels: ['mobile-notifications', 'mobile-devices'] },
  { id: 'security', label: 'Безопасность', description: 'Защита входа, IP-ограничения и права ролей.', icon: Shield, panels: ['security', 'permissions-matrix'] },
  { id: 'portal', label: 'Портал', description: 'Брендинг экрана входа и поведение интерфейса.', icon: Palette, panels: ['portal-branding', 'interface'] },
  { id: 'integrations', label: 'Интеграции', description: 'Telegram-бот и обновления мобильного приложения.', icon: Bot, panels: ['telegram-bot', 'mobile-updates'] },
]

function getInitialTabId(searchParams: URLSearchParams): SettingsTabId {
  const tab = searchParams.get('tab')
  if (tab && SETTINGS_TABS.some((t) => t.id === tab)) {
    return tab as SettingsTabId
  }
  // Back-compat with old deep links: ?panel=<id>
  const panel = searchParams.get('panel')
  const owner = SETTINGS_TABS.find((t) => t.panels.includes(panel as SettingsPanelId))
  return owner?.id ?? 'system'
}

function renderPanel(
  panelId: SettingsPanelId,
  ctx: { showClearConfirm: boolean; setShowClearConfirm: (show: boolean) => void }
) {
  switch (panelId) {
    case 'overview':
      return (
        <GeneralSettingsTab
          showClearConfirm={ctx.showClearConfirm}
          setShowClearConfirm={ctx.setShowClearConfirm}
        />
      )
    case 'backups':
      return <BackupSettingsTab />
    case 'security':
      return <SecuritySettingsTab />
    case 'permissions-matrix':
      return <PermissionsTab />
    case 'interface':
      return <InterfaceSettingsCard />
    case 'portal-branding':
      return <PortalBrandingSettingsTab />
    case 'mobile-updates':
      return <UpdatesManagementSection embedded />
    case 'mobile-notifications':
      return <NotificationSettingsTab />
    case 'mobile-devices':
      return <DevicesTab />
    case 'task-defaults':
      return <TaskDefaultsCard />
    case 'task-media':
      return <ImageSettingsTab />
    case 'task-fields':
      return <CustomFieldsTab />
    case 'telegram-bot':
      return <TelegramBotSettingsTab />
    default:
      return null
  }
}

export default function AdminSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [saveState, setSaveState] = useState<SettingsSaveState | null>(null)
  const activeTabId = getInitialTabId(searchParams)
  const activeTab = (SETTINGS_TABS.find((t) => t.id === activeTabId) ?? SETTINGS_TABS[0])!

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('panel')
    nextParams.set('tab', activeTabId)

    if (nextParams.toString() === searchParams.toString()) {
      return
    }

    setSearchParams(nextParams, { replace: true })
  }, [activeTabId, searchParams, setSearchParams])

  const handleTabChange = (tabId: SettingsTabId) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('panel')
    nextParams.set('tab', tabId)
    setSearchParams(nextParams, { replace: true })
    setSaveState(null)
  }

  return (
    <SettingsSaveContext.Provider value={{ state: saveState, setState: setSaveState }}>
      <div className="space-y-4">
        {/* Breadcrumbs */}
        <nav
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
          aria-label="Хлебные крошки"
        >
          <span>Настройки</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-gray-700 dark:text-gray-300">{activeTab.label}</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Настройки портала</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activeTab.description}</p>
          </div>
          {saveState && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={saveState.onReset}
                disabled={!saveState.dirty || saveState.saving}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Сбросить
              </Button>
              <Button size="sm" onClick={saveState.onSave} disabled={!saveState.dirty || saveState.saving}>
                <Save className="mr-2 h-4 w-4" />
                {saveState.saving ? 'Сохранение...' : 'Сохранить изменения'}
              </Button>
            </div>
          )}
        </div>

        {/* Horizontal tab strip */}
        <div className="border-b border-gray-200 dark:border-gray-800">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Разделы настроек">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = tab.id === activeTabId
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-300'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Active tab content: stacked titled cards */}
        <div className={settingsTokens.stack}>
          {activeTab.panels.map((panelId) => (
            <div key={panelId}>{renderPanel(panelId, { showClearConfirm, setShowClearConfirm })}</div>
          ))}
        </div>
      </div>
    </SettingsSaveContext.Provider>
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

  const maintenanceOps = [
    {
      title: 'VACUUM',
      desc: 'Освобождает неиспользуемое пространство и уменьшает размер SQLite-файла.',
      button: (
        <Button variant="secondary" size="sm" onClick={() => vacuumMutation.mutate()} disabled={vacuumMutation.isPending}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {vacuumMutation.isPending ? '...' : 'Запустить'}
        </Button>
      ),
    },
    {
      title: 'ANALYZE + VACUUM',
      desc: 'Перестраивает статистику и оптимизирует таблицы после больших изменений данных.',
      button: (
        <Button variant="secondary" size="sm" onClick={() => optimizeMutation.mutate()} disabled={optimizeMutation.isPending}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {optimizeMutation.isPending ? '...' : 'Оптимизировать'}
        </Button>
      ),
    },
    {
      title: 'Проверка целостности',
      desc: 'Запускает встроенную integrity_check-проверку текущей базы данных.',
      button: (
        <Button variant="secondary" size="sm" onClick={() => integrityMutation.mutate()} disabled={integrityMutation.isPending}>
          <Shield className="mr-1.5 h-4 w-4" />
          {integrityMutation.isPending ? '...' : 'Проверить'}
        </Button>
      ),
    },
    {
      title: 'Тестовые данные',
      desc: 'Создаёт пользователей и примерные заявки для локальной проверки сценариев.',
      button: (
        <Button variant="secondary" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          {seedMutation.isPending ? '...' : 'Seed'}
        </Button>
      ),
    },
  ]

  return (
    <div className={settingsTokens.stack}>
      <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
        {/* Main column: maintenance + backups */}
        <div className={cn(settingsTokens.stack, 'lg:col-span-2')}>
          <SettingsCard title="Обслуживание базы данных" icon={Database}>
            <SettingsRows>
              {maintenanceOps.map((op) => (
                <SettingRow key={op.title} title={op.title} description={op.desc}>
                  {op.button}
                </SettingRow>
              ))}
            </SettingsRows>
          </SettingsCard>
          <BackupSettingsTab />
        </div>

        {/* Status rail + danger zone (sticky) */}
        <div className={cn(settingsTokens.stack, 'lg:sticky lg:top-4')}>
          <SettingsCard title="Статус сервера" icon={Server}>
            <div>
              <StatRow label="Версия API" value={serverInfo?.version || '2.0.0'} />
              <StatRow label="Время работы" value={serverInfo?.uptime || 'N/A'} />
              <StatRow label="Адрес API" value={apiHost} mono copyText={apiHost} />
              <StatRow
                label="Firebase"
                value={
                  <Badge variant={serverInfo?.firebase_enabled ? 'success' : 'danger'}>
                    {serverInfo?.firebase_enabled ? 'Включён' : 'Выключен'}
                  </Badge>
                }
              />
              <StatRow label="Кэш геокодинга" value={`${serverInfo?.geocoding_cache_size || 0}`} />
              {dbStats && (
                <>
                  <StatRow label="Тип БД" value={dbStats.database.type} />
                  <StatRow label="Размер БД" value={`${dbStats.database.size_mb} MB`} />
                  <StatRow label="Заявки" value={dbStats.tables.tasks} />
                  <StatRow label="Пользователи" value={dbStats.tables.users} />
                  <StatRow label="Фото" value={dbStats.tables.photos} />
                  <StatRow label="Бэкапы" value={dbStats.backups_count} />
                </>
              )}
            </div>
          </SettingsCard>

          <SettingsCard
            title="Опасные действия"
            icon={Trash2}
            className="border-red-200 dark:border-red-900/50"
          >
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={() => setShowCleanupConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить старые заявки
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="w-full justify-center"
                onClick={() => setShowClearConfirm(true)}
                disabled={clearMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {clearMutation.isPending ? 'Удаление...' : 'Очистить заявки и комментарии'}
              </Button>
            </div>
            <p className="mt-2.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Действия необратимы. Перед очисткой создайте резервную копию.
            </p>
          </SettingsCard>
        </div>
      </div>

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
    <SettingsCard title="Таблицы" icon={Settings}>
      <SettingsRows>
        <SettingsToggle
          title="Изменяемая ширина колонок"
          description="Перетаскивание границ колонок в таблицах портала."
          checked={isResizableEnabled}
          disabled={resizableLoading || updateSettingMutation.isPending}
          onChange={(checked) =>
            updateSettingMutation.mutate({ key: 'enable_resizable_columns', value: checked })
          }
        />
        <SettingsToggle
          title="Компактный вид таблиц"
          description="Уменьшенные вертикальные отступы и плотная подача данных."
          checked={isCompactEnabled}
          disabled={compactLoading || updateSettingMutation.isPending}
          onChange={(checked) =>
            updateSettingMutation.mutate({ key: 'compact_table_view', value: checked })
          }
        />
      </SettingsRows>
    </SettingsCard>
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
    <div className={settingsTokens.stack}>
      <SettingsCard
        title="Бренд-блок страницы входа"
        icon={Palette}
        description="Параметры отображаются на экране авторизации до входа и доступны без авторизации через публичный endpoint."
      >
        <div className="grid gap-3 lg:grid-cols-2">
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
      </SettingsCard>

      <SettingsCard
        title="Блок поддержки и доступа"
        icon={User}
        description="Заполните email или телефон, если на странице входа должен показываться блок с контактами."
      >
        <div className="grid gap-3 lg:grid-cols-2">
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
      </SettingsCard>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}

function TaskDefaultsCard() {
  const { data: prioritySetting, isLoading } = useSetting('default_task_priority')
  const updateSetting = useUpdateSetting()
  const priority = String(prioritySetting?.value ?? 'PLANNED')

  return (
    <SettingsCard title="Параметры по умолчанию" icon={Puzzle}>
      <SettingsField
        label="Приоритет новых заявок"
        help="Базовый приоритет для новых заявок до ручной корректировки диспетчером."
        className="sm:max-w-xs"
      >
        <SettingsSelect
          value={priority}
          disabled={isLoading || updateSetting.isPending}
          onChange={(e) =>
            updateSetting.mutate({ key: 'default_task_priority', value: e.target.value })
          }
        >
          <option value="PLANNED">Плановая</option>
          <option value="CURRENT">Текущая</option>
          <option value="URGENT">Срочная</option>
          <option value="EMERGENCY">Аварийная</option>
        </SettingsSelect>
      </SettingsField>
      <div className="mt-3">
        <CompactNotice>
          Координаты заявки определяются автоматически по адресу при создании — отдельного переключателя не требуется.
        </CompactNotice>
      </div>
    </SettingsCard>
  )
}

// ============= Image Settings Tab =============
function ImageSettingsTab() {
  const { data: optimizationEnabled, isLoading: optLoading } = useSetting('image_optimization_enabled')
  const { data: qualitySetting, isLoading: qualityLoading } = useSetting('image_quality')
  const { data: maxDimensionSetting, isLoading: dimLoading } = useSetting('image_max_dimension')
  const { data: convertWebpSetting, isLoading: webpLoading } = useSetting('image_convert_to_webp')
  const updateSetting = useUpdateSetting()

  const isLoading = optLoading || qualityLoading || dimLoading || webpLoading

  if (isLoading) {
    return <div className="flex justify-center py-8"><Spinner /></div>
  }

  const isEnabled = Boolean(optimizationEnabled?.value ?? true)
  const quality = Number(qualitySetting?.value ?? 85)
  const maxDimension = Number(maxDimensionSetting?.value ?? 1920)
  const convertToWebp = Boolean(convertWebpSetting?.value ?? false)

  return (
    <SettingsCard title="Изображения" icon={Puzzle}>
      <SettingsRows>
        <SettingsToggle
          title="Оптимизация изображений"
          description="Автоматически сжимать и оптимизировать загружаемые фотографии."
          checked={isEnabled}
          onChange={(checked) =>
            updateSetting.mutate({ key: 'image_optimization_enabled', value: checked })
          }
        />
        <SettingsField
          label="Качество изображения"
          help="Баланс между степенью сжатия и сохранением визуального качества файла."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(e) => updateSetting.mutate({ key: 'image_quality', value: e.target.value })}
              className="flex-1 accent-primary-500"
            />
            <span className="w-10 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">
              {quality}
            </span>
          </div>
        </SettingsField>
        <SettingsField
          label="Максимальный размер, px"
          help="Ограничение по наибольшей стороне загружаемых изображений."
          className="sm:max-w-xs"
        >
          <Input
            type="number"
            value={maxDimension}
            onChange={(e) =>
              updateSetting.mutate({ key: 'image_max_dimension', value: e.target.value })
            }
          />
        </SettingsField>
        <SettingsToggle
          title="Конвертация в WebP"
          description="Автоматически конвертировать загружаемые изображения в формат WebP."
          checked={convertToWebp}
          onChange={(checked) =>
            updateSetting.mutate({ key: 'image_convert_to_webp', value: checked })
          }
        />
      </SettingsRows>
    </SettingsCard>
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
    <div className={settingsTokens.stack}>
      <SettingsCard
        title="Автоматическое копирование"
        icon={HardDrive}
        action={
          !settingsLoading && (
            <Button size="sm" onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveSettingsMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          )
        }
      >
        {settingsLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <div className={settingsTokens.stack}>
            <SettingsToggle
              title="Автоматический бэкап"
              description="Ежедневное резервное копирование базы данных по расписанию."
              checked={autoBackup}
              onChange={setAutoBackup}
            />
            <div className="grid gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:grid-cols-2">
              <SettingsField label="Расписание" help="Частота автоматического создания копий.">
                <SettingsSelect value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                  <option value="daily">Ежедневно в 03:00</option>
                  <option value="weekly">Еженедельно (Вс, 03:00)</option>
                  <option value="manual">Только вручную</option>
                </SettingsSelect>
              </SettingsField>
              <SettingsField label="Срок хранения, дней" help="Через сколько дней удалять старые копии.">
                <Input
                  type="number"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                />
              </SettingsField>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="Резервные копии"
        icon={HardDrive}
        description="Снимки базы данных в каталоге backups."
        action={
          <Button
            size="sm"
            onClick={() => createBackupMutation.mutate()}
            disabled={createBackupMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            {createBackupMutation.isPending ? 'Создание...' : 'Создать'}
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : !backups?.length ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Нет резервных копий
          </p>
        ) : (
          <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {backups.map((backup) => (
              <div key={backup.name} className="flex items-center gap-2 py-1">
                <span
                  className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200"
                  title={backup.name}
                >
                  {backup.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                  {formatBytes(backup.size)} · {new Date(backup.created).toLocaleDateString('ru-RU')}
                </span>
                <div className="flex shrink-0 items-center">
                  <SettingsIconButton
                    title="Восстановить из этого бэкапа"
                    onClick={() => handleRestore(backup.name)}
                    disabled={restoreBackupMutation.isPending}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </SettingsIconButton>
                  <SettingsIconButton title="Скачать" onClick={() => handleDownload(backup.name)}>
                    <Download className="h-3.5 w-3.5" />
                  </SettingsIconButton>
                  <SettingsIconButton
                    title="Удалить"
                    onClick={() => handleDelete(backup.name)}
                    tone="danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </SettingsIconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
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
      const { data } = await apiClient.post<{ success: boolean; sent_fcm: number; failed_fcm: number; sent_ws: number }>('/notifications/test')
      return data
    },
    onSuccess: (data) => {
      const parts: string[] = []
      if (data.sent_fcm > 0) parts.push(`FCM: ${data.sent_fcm}`)
      if (data.sent_ws > 0) parts.push(`WebSocket: ${data.sent_ws}`)
      if (data.failed_fcm > 0) parts.push(`Ошибки FCM: ${data.failed_fcm}`)
      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : ''
      showApiSuccess(`Тестовое уведомление отправлено${detail}`)
    },
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
    <div className={settingsTokens.stack}>
      <SettingsCard title="Сценарии уведомлений" icon={Bell}>
        {settingsLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <SettingsRows>
              <SettingsToggle
                title="Push-уведомления"
                description="Отправлять push через Firebase на зарегистрированные устройства."
                checked={isPushEnabled}
                disabled={isSaving}
                onChange={(checked) =>
                  handleToggle('push_enabled', checked, 'Настройки push-уведомлений сохранены')
                }
              />
              <SettingsToggle
                title="При создании заявки"
                description="Уведомлять исполнителя о появлении новой назначенной заявки."
                checked={Boolean(notifyOnNewTask?.value ?? true)}
                disabled={isSaving}
                onChange={(checked) =>
                  handleToggle('notify_on_new_task', checked, 'Сценарий уведомлений о новых заявках сохранён')
                }
              />
              <SettingsToggle
                title="При смене статуса"
                description="Уведомлять диспетчера при изменении статуса заявки."
                checked={Boolean(notifyOnStatusChange?.value ?? true)}
                disabled={isSaving}
                onChange={(checked) =>
                  handleToggle('notify_on_status_change', checked, 'Сценарий уведомлений о смене статуса сохранён')
                }
              />
            </SettingsRows>
            <div className="mt-4">
              <CompactNotice tone="warning">
                Email-уведомления пока не поддерживаются сервером и не вынесены в сохраняемые системные параметры.
              </CompactNotice>
            </div>
          </>
        )}
      </SettingsCard>

      <SettingsCard
        title="Статус Firebase"
        icon={Bell}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => testPushMutation.mutate()}
            disabled={!isPushEnabled}
            isLoading={testPushMutation.isPending}
          >
            <Bell className="mr-2 h-4 w-4" />
            Отправить тест
          </Button>
        }
      >
        <div>
          <StatRow
            label="Push-канал"
            value={
              <Badge variant={isPushEnabled ? 'success' : 'danger'}>
                {isPushEnabled ? 'Включён' : 'Отключён'}
              </Badge>
            }
          />
          <StatRow label="Доставка" value={isPushEnabled ? 'На устройства' : 'Отключена'} />
        </div>
      </SettingsCard>
    </div>
  )
}

// ============= Security Settings Tab =============
function SecuritySettingsTab() {
  const { data: rateLimitAttempts, isLoading: attemptsLoading } = useSetting('rate_limit_attempts')
  const { data: rateLimitWindow, isLoading: windowLoading } = useSetting('rate_limit_window')
  const { data: sessionTimeoutHours, isLoading: sessionLoading } = useSetting('session_timeout_hours')
  const updateSettingMutation = useUpdateSetting()

  const serverAttempts = typeof rateLimitAttempts?.value === 'number' ? rateLimitAttempts.value : 5
  const serverWindow = typeof rateLimitWindow?.value === 'number' ? rateLimitWindow.value : 60
  const serverSession = typeof sessionTimeoutHours?.value === 'number' ? sessionTimeoutHours.value : 168

  const [attempts, setAttempts] = useState(serverAttempts)
  const [windowSeconds, setWindowSeconds] = useState(serverWindow)
  const [sessionHours, setSessionHours] = useState(serverSession)

  useEffect(() => setAttempts(serverAttempts), [serverAttempts])
  useEffect(() => setWindowSeconds(serverWindow), [serverWindow])
  useEffect(() => setSessionHours(serverSession), [serverSession])

  const settingsLoading = attemptsLoading || windowLoading || sessionLoading
  const dirty =
    attempts !== serverAttempts || windowSeconds !== serverWindow || sessionHours !== serverSession

  const handleReset = useCallback(() => {
    setAttempts(serverAttempts)
    setWindowSeconds(serverWindow)
    setSessionHours(serverSession)
  }, [serverAttempts, serverWindow, serverSession])

  const handleSave = useCallback(async () => {
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
  }, [attempts, windowSeconds, sessionHours, updateSettingMutation])

  useRegisterSettingsSave({
    dirty,
    saving: updateSettingMutation.isPending,
    onSave: handleSave,
    onReset: handleReset,
  })

  if (settingsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  return (
    <div className={settingsTokens.stack}>
      <SettingsCard
        title="Вход и сессии"
        icon={Shield}
        description="Защита от перебора паролей и срок жизни сессии."
      >
        <div className={settingsTokens.grid3}>
          <SettingsField
            label="Максимум попыток"
            help="После превышения лимита IP временно блокируется."
            htmlFor="sec-attempts"
          >
            <Input
              id="sec-attempts"
              type="number"
              value={attempts}
              onChange={(event) => setAttempts(Number(event.target.value) || 1)}
            />
          </SettingsField>
          <SettingsField
            label="Окно, сек"
            help="Интервал подсчёта неудачных попыток входа."
            htmlFor="sec-window"
          >
            <Input
              id="sec-window"
              type="number"
              value={windowSeconds}
              onChange={(event) => setWindowSeconds(Number(event.target.value) || 10)}
            />
          </SettingsField>
          <SettingsField
            label="Время жизни токена, ч"
            help="Сколько часов токен действителен после входа."
            htmlFor="sec-session"
          >
            <Input
              id="sec-session"
              type="number"
              value={sessionHours}
              onChange={(event) => setSessionHours(Number(event.target.value) || 1)}
            />
          </SettingsField>
        </div>
        <div className="mt-3">
          <CompactNotice>
            Парольная политика пока не хранится в системных настройках — появится, когда добавим
            backend-ключи.
          </CompactNotice>
        </div>
      </SettingsCard>

      <IpProtectionPanel />
    </div>
  )
}

// ============= Custom Fields Tab =============
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Текст',
  textarea: 'Многострочный',
  number: 'Число',
  select: 'Список',
  checkbox: 'Флажок',
  date: 'Дата',
}

function CustomFieldsTab() {
  const [showModal, setShowModal] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)

  const { data: fields, isLoading } = useCustomFields()
  const deleteField = useDeleteCustomField()
  const toggleField = useToggleCustomField()

  const handleDelete = (field: CustomField) => {
    if (!confirm(`Удалить поле «${field.label}»?`)) return
    deleteField.mutate(field.id, {
      onSuccess: () => showApiSuccess('Поле удалено'),
      onError: (error) => showApiError(error, 'Не удалось удалить поле'),
    })
  }

  const handleToggle = (field: CustomField) => {
    toggleField.mutate(field.id, {
      onError: (error) => showApiError(error, 'Не удалось изменить статус поля'),
    })
  }

  return (
    <>
      <SettingsCard
        title="Конструктор полей заявок"
        icon={Puzzle}
        description="Создавайте дополнительные поля для заявок — они появятся в форме создания и редактирования."
        action={
          <Button size="sm" onClick={() => { setEditingField(null); setShowModal(true) }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Добавить поле
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : !fields?.length ? (
          <CompactEmptyPanel title="Нет кастомных полей" description="Добавьте первое поле, чтобы расширить форму заявки." icon={Puzzle} />
        ) : (
          <div className="space-y-2">
            {fields.map((field) => (
              <div
                key={field.id}
                className={cn(
                  'flex items-center justify-between rounded-xl border border-gray-200 bg-slate-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/50',
                  !field.is_active && 'opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {field.label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {field.name} • {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5">
                    {!field.is_active && <Badge variant="gray">Выключено</Badge>}
                    {field.show_in_list && <Badge variant="info">В списке</Badge>}
                    {field.show_in_card && <Badge variant="success">В карточке</Badge>}
                  </div>
                  <div className="flex items-center">
                    <SettingsIconButton
                      title={field.is_active ? 'Выключить поле' : 'Включить поле'}
                      onClick={() => handleToggle(field)}
                      disabled={toggleField.isPending}
                    >
                      <Power className={cn('h-3.5 w-3.5', field.is_active && 'text-green-500')} />
                    </SettingsIconButton>
                    <SettingsIconButton
                      title="Редактировать"
                      onClick={() => {
                        setEditingField(field)
                        setShowModal(true)
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </SettingsIconButton>
                    <SettingsIconButton
                      title="Удалить"
                      tone="danger"
                      onClick={() => handleDelete(field)}
                      disabled={deleteField.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </SettingsIconButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {showModal && (
        <CustomFieldModal
          field={editingField}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

function CustomFieldModal({
  field,
  onClose,
}: {
  field: CustomField | null
  onClose: () => void
}) {
  const isEdit = field !== null
  const createField = useCreateCustomField()
  const updateField = useUpdateCustomField()
  const isSaving = createField.isPending || updateField.isPending

  const [formData, setFormData] = useState({
    name: field?.name || '',
    label: field?.label || '',
    field_type: field?.field_type || 'text',
    options: field?.options?.join('\n') || '',
    placeholder: field?.placeholder || '',
    default_value: field?.default_value || '',
    is_required: field?.is_required || false,
    show_in_list: field?.show_in_list || false,
    show_in_card: field?.show_in_card ?? true,
  })

  const handleSave = () => {
    const name = formData.name.trim()
    const label = formData.label.trim()
    if (!label) {
      toast.error('Укажите отображаемое название')
      return
    }
    if (!isEdit && !/^[a-z_][a-z0-9_]*$/.test(name)) {
      toast.error('Системное имя: латиница в нижнем регистре, цифры и _, начиная с буквы или _')
      return
    }

    const options =
      formData.field_type === 'select'
        ? formData.options
            .split('\n')
            .map((o) => o.trim())
            .filter(Boolean)
        : null
    const placeholder = formData.placeholder.trim() || null
    const default_value = formData.default_value.trim() || null

    if (isEdit) {
      const payload: CustomFieldUpdateData = {
        label,
        field_type: formData.field_type,
        options,
        placeholder,
        default_value,
        is_required: formData.is_required,
        show_in_list: formData.show_in_list,
        show_in_card: formData.show_in_card,
      }
      updateField.mutate(
        { id: field.id, payload },
        {
          onSuccess: () => {
            showApiSuccess('Поле обновлено')
            onClose()
          },
          onError: (error) => showApiError(error, 'Не удалось сохранить поле'),
        }
      )
      return
    }

    const payload: CustomFieldCreateData = {
      name,
      label,
      field_type: formData.field_type,
      options,
      placeholder,
      default_value,
      is_required: formData.is_required,
      show_in_list: formData.show_in_list,
      show_in_card: formData.show_in_card,
    }
    createField.mutate(payload, {
      onSuccess: () => {
        showApiSuccess('Поле создано')
        onClose()
      },
      onError: (error) => showApiError(error, 'Не удалось создать поле'),
    })
  }

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
            disabled={isEdit}
            className={isEdit ? 'opacity-60' : undefined}
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
            <SettingsSelect
              value={formData.field_type}
              onChange={(e) => setFormData({ ...formData, field_type: e.target.value })}
            >
              <option value="text">Текст (одна строка)</option>
              <option value="textarea">Текст (многострочный)</option>
              <option value="number">Число</option>
              <option value="select">Выпадающий список</option>
              <option value="checkbox">Флажок (да/нет)</option>
              <option value="date">Дата</option>
            </SettingsSelect>
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
                checked={formData.is_required}
                onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
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
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Отмена</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
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
    <SettingsCard
      title="Права доступа по ролям"
      icon={UserCog}
      description="Отметьте доступные действия для каждой роли. У администратора включено всё."
    >
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full">
            <thead className="bg-gray-50/80 dark:bg-gray-800/60">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Разрешение
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Админ
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Диспетчер
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Исполнитель
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                    {row.label}
                  </td>
                  {(['admin', 'dispatcher', 'worker'] as const).map((role) => {
                    const checked = permissions?.[role]?.[row.id] ?? (role === 'admin')
                    return (
                      <td key={role} className="px-4 py-1 text-center">
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
                          className="h-4 w-4 rounded border-gray-300 text-primary-500 disabled:opacity-50 dark:border-gray-600"
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
    </SettingsCard>
  )
}

function DevicesTab() {
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { data: devices, isLoading, refetch, isFetching } = useDevices()
  const sendNotification = useSendTestNotification()
  const deleteDevice = useDeleteDevice()

  const handleSendTest = async (userId?: number) => {
    try {
      const result = await sendNotification.mutateAsync(userId)
      const parts: string[] = []
      if (result.sent_fcm > 0) parts.push(`FCM: ${result.sent_fcm}`)
      if (result.sent_ws > 0) parts.push(`WebSocket: ${result.sent_ws}`)
      if (result.failed_fcm > 0) parts.push(`Ошибки FCM: ${result.failed_fcm}`)
      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : ''
      toast.success(userId ? `Тестовое уведомление отправлено${detail}` : `Уведомление отправлено всем устройствам${detail}`)
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
    <SettingsCard
      title="Устройства и push-канал"
      icon={Smartphone}
      bodyClassName="p-0"
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSendTest()}
            disabled={sendNotification.isPending}
          >
            <Bell className="mr-2 h-4 w-4" />
            Тест всем
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
    >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Пользователь
                </th>
                <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Устройство
                </th>
                <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  FCM токен
                </th>
                <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Последняя активность
                </th>
                <th className="px-4 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
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
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className="rounded bg-gray-100 px-2 py-1 text-sm font-mono dark:bg-gray-700">
                        {device.id}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {device.user_name || `User #${device.user_id}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {device.device_name || 'Unknown Device'}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span
                        className="cursor-help text-xs font-mono text-gray-500 dark:text-gray-400"
                        title={device.fcm_token}
                      >
                        {truncateToken(device.fcm_token, 30)}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {formatDate(device.last_active)}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-right">
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
          <div className="border-t border-gray-100 px-5 py-2.5 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Всего устройств: {devices.length}
            </p>
          </div>
        )}
    </SettingsCard>
  )
}

// ============= Telegram Bot Settings Tab =============
function TelegramBotSettingsTab() {
  const { data: botSettings, isLoading } = useTelegramBotSettings()
  const { data: users } = useUsers()
  const updateMutation = useUpdateTelegramBotSettings()

  const [enabled, setEnabled] = useState(true)
  const [dedupEnabled, setDedupEnabled] = useState(true)
  const [mappings, setMappings] = useState<TelegramGroupMapping[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [customGroupName, setCustomGroupName] = useState('')
  const [newUsername, setNewUsername] = useState('')

  // Фильтруем активных работников и диспетчеров
  const workers = (users ?? []).filter(
    (u) => u.is_active && (u.role === 'worker' || u.role === 'dispatcher')
  )

  // Известные группы бота, исключая уже добавленные в маппинг
  const knownGroups: TelegramKnownGroup[] = botSettings?.known_groups ?? []
  const availableGroups = knownGroups.filter(
    (g) => !mappings.some((m) => m.group_name.toLowerCase() === g.title.toLowerCase())
  )

  useEffect(() => {
    if (botSettings) {
      setEnabled(botSettings.enabled)
      setDedupEnabled(botSettings.dedup_enabled)
      setMappings(botSettings.group_worker_map)
    }
  }, [botSettings])

  const handleAddMapping = () => {
    const effectiveGroup = newGroupName === '__custom__' ? customGroupName : newGroupName
    const trimmedGroup = effectiveGroup.trim()
    const trimmedUsername = newUsername.trim()
    if (!trimmedGroup || !trimmedUsername) return
    if (mappings.some((m) => m.group_name.toLowerCase() === trimmedGroup.toLowerCase())) {
      toast.error('Маппинг для этой группы уже существует')
      return
    }
    setMappings([...mappings, { group_name: trimmedGroup, username: trimmedUsername }])
    setNewGroupName('')
    setCustomGroupName('')
    setNewUsername('')
  }

  const handleRemoveMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index))
  }

  const handleChangeWorker = (index: number, username: string) => {
    setMappings(mappings.map((m, i) => (i === index ? { ...m, username } : m)))
  }

  const handleSave = async () => {
    // Автоматически добавляем незавершённый маппинг, если пользователь заполнил поля но не нажал "+"
    let finalMappings = [...mappings]
    const effectiveGroup = newGroupName === '__custom__' ? customGroupName : newGroupName
    const pendingGroup = effectiveGroup.trim()
    const pendingUsername = newUsername.trim()
    if (pendingGroup && pendingUsername) {
      if (!finalMappings.some((m) => m.group_name.toLowerCase() === pendingGroup.toLowerCase())) {
        finalMappings = [...finalMappings, { group_name: pendingGroup, username: pendingUsername }]
        setMappings(finalMappings)
        setNewGroupName('')
        setCustomGroupName('')
        setNewUsername('')
      }
    }

    try {
      await updateMutation.mutateAsync({
        enabled,
        dedup_enabled: dedupEnabled,
        group_worker_map: finalMappings,
      })
      showApiSuccess('Настройки Telegram-бота сохранены')
    } catch (error) {
      showApiError(error, 'Не удалось сохранить настройки')
    }
  }

  const getUserDisplayName = (username: string) => {
    const user = workers.find((u) => u.username === username)
    return user ? `${user.full_name || user.username}` : username
  }

  return (
    <div className={settingsTokens.stack}>
      {isLoading ? (
        <SettingsCard>
          <div className="flex justify-center py-4"><Spinner /></div>
        </SettingsCard>
      ) : (
        <>
          <SettingsCard title="Основные настройки" icon={Bot}>
            <SettingsRows>
              <SettingsToggle
                title="Бот включён"
                description="Разрешить боту создавать заявки из Telegram-групп"
                checked={enabled}
                onChange={setEnabled}
              />
              <SettingsToggle
                title="Дедупликация заявок"
                description="При повторной заявке с тем же номером — добавлять комментарий вместо дубликата"
                checked={dedupEnabled}
                onChange={setDedupEnabled}
              />
            </SettingsRows>
          </SettingsCard>

          <SettingsCard
            title="Маппинг групп → работники"
            icon={User}
            action={
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            }
          >
            <div className="space-y-3">
              <CompactNotice>
                Подстрока названия Telegram-группы (в нижнем регистре) сопоставляется с username работника.
                Например: группа «Заявки Иванов» → работник «ivanov».
                {knownGroups.length > 0 && ' Группы, в которых бот уже работает, доступны для выбора.'}
              </CompactNotice>

          {mappings.length > 0 && (
            <div className="space-y-2">
              {mappings.map((m, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/70"
                >
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Группа</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{m.group_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Работник</p>
                    {workers.length > 0 ? (
                      <SettingsSelect
                        value={m.username}
                        onChange={(e) => handleChangeWorker(index, e.target.value)}
                      >
                        {workers.map((w) => (
                          <option key={w.id} value={w.username}>
                            {w.full_name || w.username} ({w.username})
                          </option>
                        ))}
                      </SettingsSelect>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{getUserDisplayName(m.username)}</p>
                    )}
                  </div>
                  <div className="self-center">
                    <SettingsIconButton title="Удалить" tone="danger" onClick={() => handleRemoveMapping(index)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </SettingsIconButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mappings.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-6 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <Bot className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Маппинги не настроены</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Добавьте соответствие Telegram-группы и работника</p>
            </div>
          )}

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/70">
            <div>
              {availableGroups.length > 0 ? (
                <SettingsSelect
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                >
                  <option value="">Выберите группу</option>
                  {availableGroups.map((g) => (
                    <option key={g.chat_id} value={g.title}>
                      {g.title}
                    </option>
                  ))}
                  <option value="__custom__">Ввести вручную...</option>
                </SettingsSelect>
              ) : (
                <Input
                  placeholder="Подстрока группы, напр. заявки иванов"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMapping()}
                />
              )}
              {newGroupName === '__custom__' && (
                <Input
                  className="mt-1"
                  placeholder="Подстрока группы, напр. заявки иванов"
                  value={customGroupName}
                  onChange={(e) => setCustomGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMapping()}
                  autoFocus
                />
              )}
            </div>
            <div>
              {workers.length > 0 ? (
                <SettingsSelect
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                >
                  <option value="">Выберите работника</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.username}>
                      {w.full_name || w.username} ({w.username})
                    </option>
                  ))}
                </SettingsSelect>
              ) : (
                <Input
                  placeholder="Username работника"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMapping()}
                />
              )}
            </div>
            <Button
              size="sm"
              onClick={handleAddMapping}
              disabled={!(newGroupName === '__custom__' ? customGroupName.trim() : newGroupName.trim()) || !newUsername.trim()}
              title="Добавить маппинг"
              className="self-center"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

            </div>
          </SettingsCard>
        </>
      )}
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
        <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/50">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowClearConfirm(false)}
            disabled={clearMutation.isPending}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => clearMutation.mutate()}
            isLoading={clearMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {clearMutation.isPending ? 'Удаление...' : 'Удалить все'}
          </Button>
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
  description,
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
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
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

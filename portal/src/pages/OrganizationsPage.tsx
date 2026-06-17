import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { mutationToast } from '@/utils/apiError'
import { formatDateOnly } from '@/utils/dateFormat'
import { buildAdminUsernameSeed, sanitizeUsername } from '@/utils/organization'
import { getLoginUrl } from '@/config/appConfig'
import {
  ArrowRight,
  Copy,
  ExternalLink,
  Plus,
  Printer,
  RefreshCw,
  Building2,
  Edit,
  Trash2,
  Wand2,
  X,
  Users,
  ClipboardList,
  MapPin,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react'
import {
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeactivateOrganization,
  useActivateOrganization,
} from '@/hooks/useOrganizations'
import type { Organization, CreateOrganizationData, UpdateOrganizationData } from '@/types/organization'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import Input from '@/components/Input'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import Modal from '@/components/Modal'

interface OrgFormData {
  name: string
  description: string
  email: string
  phone: string
  address: string
  max_users: number
  max_tasks: number
}

interface InitialAdminFormData {
  enabled: boolean
  username: string
  password: string
  full_name: string
  email: string
  phone: string
}

interface CreatedAdminCredentials {
  organizationId: number
  organizationName: string
  username: string
  password: string
  loginUrl: string
}

const initialFormData: OrgFormData = {
  name: '',
  description: '',
  email: '',
  phone: '',
  address: '',
  max_users: 50,
  max_tasks: 10000,
}

const initialAdminFormData: InitialAdminFormData = {
  enabled: true,
  username: '',
  password: '',
  full_name: '',
  email: '',
  phone: '',
}

function generateAdminPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const array = new Uint32Array(length)

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(array)
  } else {
    for (let index = 0; index < length; index += 1) {
      array[index] = Math.floor(Math.random() * alphabet.length)
    }
  }

  return Array.from(array, (value) => alphabet[value % alphabet.length]).join('')
}

export default function OrganizationsPage() {
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [formData, setFormData] = useState<OrgFormData>(initialFormData)
  const [initialAdmin, setInitialAdmin] = useState<InitialAdminFormData>(initialAdminFormData)
  const [isAdminUsernameDirty, setIsAdminUsernameDirty] = useState(false)
  const [showInitialAdminPassword, setShowInitialAdminPassword] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<CreatedAdminCredentials | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { data: organizations, isLoading, refetch, isFetching } = useOrganizations(showInactive)
  const createMutation = useCreateOrganization()
  const updateMutation = useUpdateOrganization()
  const deactivateMutation = useDeactivateOrganization()
  const activateMutation = useActivateOrganization()

  const handleOpenCreate = () => {
    setEditingOrg(null)
    setFormData(initialFormData)
    setInitialAdmin({
      ...initialAdminFormData,
      username: buildAdminUsernameSeed(initialFormData.name),
      password: generateAdminPassword(),
    })
    setIsAdminUsernameDirty(false)
    setShowInitialAdminPassword(false)
    setCreatedCredentials(null)
    setShowModal(true)
  }

  const handleOpenEdit = (org: Organization) => {
    setEditingOrg(org)
    setFormData({
      name: org.name,
      description: org.description ?? '',
      email: org.email ?? '',
      phone: org.phone ?? '',
      address: org.address ?? '',
      max_users: org.max_users,
      max_tasks: org.max_tasks,
    })
    setInitialAdmin(initialAdminFormData)
    setIsAdminUsernameDirty(false)
    setShowInitialAdminPassword(false)
    setCreatedCredentials(null)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingOrg(null)
    setFormData(initialFormData)
    setInitialAdmin(initialAdminFormData)
    setIsAdminUsernameDirty(false)
    setShowInitialAdminPassword(false)
    setCreatedCredentials(null)
  }

  const handleFormDataChange = (key: keyof OrgFormData, value: string | number) => {
    const nextFormData = { ...formData, [key]: value }
    setFormData(nextFormData)

    if (!editingOrg && initialAdmin.enabled && !isAdminUsernameDirty && key === 'name') {
      setInitialAdmin((current) => ({
        ...current,
        username: buildAdminUsernameSeed(String(value)),
      }))
    }
  }

  const handleInitialAdminToggle = (enabled: boolean) => {
    setInitialAdmin((current) => ({
      ...current,
      enabled,
      username:
        enabled && !isAdminUsernameDirty
          ? buildAdminUsernameSeed(formData.name)
          : current.username,
    }))
  }

  const handleInitialAdminUsernameChange = (value: string) => {
    setIsAdminUsernameDirty(true)
    setInitialAdmin((current) => ({ ...current, username: sanitizeUsername(value) }))
  }

  const handleGenerateAdminPassword = () => {
    setInitialAdmin((current) => ({
      ...current,
      password: generateAdminPassword(),
    }))
  }

  const handleResetAdminUsername = () => {
    setIsAdminUsernameDirty(false)
    setInitialAdmin((current) => ({
      ...current,
      username: buildAdminUsernameSeed(formData.name),
    }))
  }

  const handleCopyCredentials = async () => {
    if (!createdCredentials) {
      return
    }

    const payload = [
      `Организация: ${createdCredentials.organizationName}`,
      'Роль: Администратор организации',
      `Логин: ${createdCredentials.username}`,
      `Пароль: ${createdCredentials.password}`,
      `Вход: ${createdCredentials.loginUrl}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(payload)
      toast.success('Реквизиты скопированы')
    } catch {
      toast.error('Не удалось скопировать реквизиты')
    }
  }

  const handlePrintCredentials = () => {
    if (!createdCredentials || typeof window === 'undefined') {
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      toast.error('Не удалось открыть окно печати')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <title>Карточка доступа ${createdCredentials.organizationName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
            .card { max-width: 720px; border: 1px solid #d1d5db; border-radius: 20px; padding: 28px; }
            .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; }
            h1 { margin: 10px 0 8px; font-size: 28px; }
            p { margin: 0 0 18px; color: #4b5563; line-height: 1.6; }
            .grid { display: grid; gap: 14px; margin-top: 20px; }
            .row { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #6b7280; margin-bottom: 6px; }
            .value { font-size: 16px; word-break: break-word; }
            .mono { font-family: Consolas, Menlo, monospace; }
            .footer { margin-top: 22px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="eyebrow">FieldWorker access card</div>
            <h1>${createdCredentials.organizationName}</h1>
            <p>Первичный доступ администратора организации. Передайте эту карточку ответственному лицу и рекомендуйте сменить пароль после первого входа.</p>
            <div class="grid">
              <div class="row"><div class="label">Роль</div><div class="value">Администратор организации</div></div>
              <div class="row"><div class="label">Логин</div><div class="value mono">${createdCredentials.username}</div></div>
              <div class="row"><div class="label">Пароль</div><div class="value mono">${createdCredentials.password}</div></div>
              <div class="row"><div class="label">Ссылка входа</div><div class="value mono">${createdCredentials.loginUrl}</div></div>
            </div>
            <div class="footer">Сгенерировано из портала FieldWorker.</div>
          </div>
          <script>window.onload = function () { window.print(); };</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleShareCredentials = async () => {
    if (!createdCredentials || typeof navigator === 'undefined' || !('share' in navigator)) {
      return
    }

    const text = [
      `Организация: ${createdCredentials.organizationName}`,
      'Роль: Администратор организации',
      `Логин: ${createdCredentials.username}`,
      `Пароль: ${createdCredentials.password}`,
      `Вход: ${createdCredentials.loginUrl}`,
    ].join('\n')

    try {
      await navigator.share({
        title: `Доступ для ${createdCredentials.organizationName}`,
        text,
        url: createdCredentials.loginUrl,
      })
    } catch {
      // User cancellation should be silent.
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Введите название организации')
      return
    }

    if (!editingOrg && initialAdmin.enabled) {
      if (!initialAdmin.username.trim()) {
        toast.error('Введите логин администратора организации')
        return
      }
      if (!initialAdmin.password.trim() || initialAdmin.password.length < 4) {
        toast.error('Пароль администратора должен быть не короче 4 символов')
        return
      }
    }

    if (editingOrg) {
      const updateData: UpdateOrganizationData = {
        name: formData.name,
        description: formData.description || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        max_users: formData.max_users,
        max_tasks: formData.max_tasks,
      }

      updateMutation.mutate(
        { id: editingOrg.id, data: updateData },
        mutationToast({
          success: 'Организация обновлена',
          error: 'Ошибка обновления организации',
          onSuccess: handleCloseModal,
        })
      )
    } else {
      const createData: CreateOrganizationData = {
        name: formData.name,
        description: formData.description || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        max_users: formData.max_users,
        max_tasks: formData.max_tasks,
        initial_admin: initialAdmin.enabled
          ? {
              username: initialAdmin.username.trim(),
              password: initialAdmin.password,
              full_name: initialAdmin.full_name.trim(),
              email: initialAdmin.email.trim() || undefined,
              phone: initialAdmin.phone.trim() || undefined,
            }
          : undefined,
      }

      createMutation.mutate(
        createData,
        mutationToast({
          success: initialAdmin.enabled
            ? 'Организация и её администратор созданы'
            : 'Организация создана',
          error: 'Ошибка создания организации',
          onSuccess: (createdOrg) => {
            if (initialAdmin.enabled) {
              const loginUrl = typeof window !== 'undefined'
                ? `${window.location.origin}${getLoginUrl()}?org=${encodeURIComponent(createdOrg.name)}`
                : getLoginUrl()

              setCreatedCredentials({
                organizationId: createdOrg.id,
                organizationName: createdOrg.name,
                username: initialAdmin.username.trim(),
                password: initialAdmin.password,
                loginUrl,
              })
              return
            }

            handleCloseModal()
            navigate(`/admin/organizations/${createdOrg.id}`)
          },
        })
      )
    }
  }

  const handleDeactivate = (id: number) => {
    deactivateMutation.mutate(
      id,
      mutationToast({
        success: 'Организация деактивирована',
        error: 'Ошибка деактивации',
        onSuccess: () => setDeleteConfirm(null),
      })
    )
  }

  const isMutating = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Организации"
        description="Управление организациями (multi-tenant)"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              title={showInactive ? 'Скрыть неактивные' : 'Показать неактивные'}
            >
              {showInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showInactive ? 'Скрыть неактивные' : 'Показать неактивные'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Добавить
            </Button>
          </>
        }
      />

      {/* Stats cards */}
      {organizations && organizations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Всего организаций</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {organizations.filter(o => o.is_active).length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Всего пользователей</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {organizations.reduce((sum, o) => sum + o.user_count, 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <ClipboardList className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Всего заявок</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {organizations.reduce((sum, o) => sum + o.task_count, 0)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={5} columns={7} />
        ) : !organizations || organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Нет организаций"
            description="Создайте первую организацию для начала работы"
            action={
              <Button onClick={handleOpenCreate}>
                <Plus className="w-4 h-4 mr-1" />
                Добавить организацию
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Организация
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <Users className="w-4 h-4 inline" /> Польз.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <ClipboardList className="w-4 h-4 inline" /> Заявки
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <MapPin className="w-4 h-4 inline" /> Адреса
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Создана
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {organizations.map((org) => (
                  <tr
                    key={org.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      !org.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <button
                          onClick={() => navigate(`/admin/organizations/${org.id}`)}
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                        >
                          {org.name}
                        </button>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {org.slug}
                          {org.email && ` · ${org.email}`}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={org.is_active ? 'success' : 'gray'}>
                        {org.is_active ? 'Активна' : 'Неактивна'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {org.user_count}
                        <span className="text-gray-400"> / {org.max_users}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {org.task_count}
                        <span className="text-gray-400"> / {org.max_tasks}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                      {org.address_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {org.created_at ? formatDateOnly(org.created_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(org)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {org.is_active ? (
                          deleteConfirm === org.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeactivate(org.id)}
                                className="p-1.5 text-red-600 hover:text-red-700 transition-colors"
                                title="Подтвердить деактивацию"
                                disabled={deactivateMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Отмена"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(org.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                              title="Деактивировать"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => activateMutation.mutate(org.id, mutationToast({
                              success: 'Организация активирована',
                              error: 'Ошибка активации',
                            }))}
                            className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                            title="Активировать"
                            disabled={activateMutation.isPending}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={createdCredentials ? 'Организация и администратор созданы' : editingOrg ? 'Редактировать организацию' : 'Новая организация'}
        size="lg"
      >
        {createdCredentials ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
                    Новый tenant готов к входу
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-300/90">
                    Сохраните реквизиты первичного администратора перед закрытием окна. Пароль повторно из API не возвращается.
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
              <div className="border-b border-gray-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-5 py-5 text-white dark:border-gray-700">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Карточка доступа</div>
                <h3 className="mt-2 text-xl font-semibold">{createdCredentials.organizationName}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  Передайте карточку ответственному лицу. После первого входа рекомендуется сменить пароль администратора.
                </p>
              </div>
              <div className="grid gap-3 bg-gray-50/70 p-4 dark:bg-gray-900/30">
                <CredentialRow label="Роль" value="Администратор организации" />
                <CredentialRow label="Логин" value={createdCredentials.username} monospace />
                <CredentialRow label="Пароль" value={createdCredentials.password} monospace highlight />
                <CredentialRow label="Ссылка входа" value={createdCredentials.loginUrl} monospace />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button variant="outline" type="button" onClick={handleCopyCredentials}>
                <Copy className="mr-2 h-4 w-4" />
                Скопировать реквизиты
              </Button>
              {'share' in navigator && (
                <Button variant="outline" type="button" onClick={handleShareCredentials}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Поделиться
                </Button>
              )}
              <Button variant="outline" type="button" onClick={handlePrintCredentials}>
                <Printer className="mr-2 h-4 w-4" />
                Печать карточки
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const organizationId = createdCredentials.organizationId
                  handleCloseModal()
                  navigate(`/admin/organizations/${organizationId}`)
                }}
              >
                Перейти в организацию
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Название *"
            value={formData.name}
            onChange={(e) => handleFormDataChange('name', e.target.value)}
            placeholder="ООО «Компания»"
            required
          />

          <Input
            label="Описание"
            value={formData.description}
            onChange={(e) => handleFormDataChange('description', e.target.value)}
            placeholder="Краткое описание организации"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleFormDataChange('email', e.target.value)}
              placeholder="org@example.com"
            />
            <Input
              label="Телефон"
              value={formData.phone}
              onChange={(e) => handleFormDataChange('phone', e.target.value)}
              placeholder="+7 (999) 123-45-67"
            />
          </div>

          <Input
            label="Адрес"
            value={formData.address}
            onChange={(e) => handleFormDataChange('address', e.target.value)}
            placeholder="г. Москва, ул. Примерная, д. 1"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Макс. пользователей"
              type="number"
              value={String(formData.max_users)}
              onChange={(e) => handleFormDataChange('max_users', Number(e.target.value) || 50)}
              min={1}
              max={10000}
            />
            <Input
              label="Макс. заявок"
              type="number"
              value={String(formData.max_tasks)}
              onChange={(e) => handleFormDataChange('max_tasks', Number(e.target.value) || 10000)}
              min={1}
              max={1000000}
            />
          </div>

          {!editingOrg && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    Первичный администратор организации
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Можно сразу создать отдельную admin-учётку для новой организации. Это основной onboarding для нового tenant.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={initialAdmin.enabled}
                    onChange={(e) => handleInitialAdminToggle(e.target.checked)}
                  />
                  Создать admin
                </label>
              </div>

              {initialAdmin.enabled && (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Логин администратора *"
                    value={initialAdmin.username}
                    onChange={(e) => handleInitialAdminUsernameChange(e.target.value)}
                    placeholder="acme_admin"
                    autoComplete="off"
                  />
                  <div className="w-full">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Пароль *
                    </label>
                    <div className="relative">
                      <Input
                        type={showInitialAdminPassword ? 'text' : 'password'}
                        value={initialAdmin.password}
                        onChange={(e) => setInitialAdmin({ ...initialAdmin, password: e.target.value })}
                        placeholder="Минимум 4 символа"
                        autoComplete="new-password"
                        className="pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInitialAdminPassword((current) => !current)}
                        className="absolute inset-y-0 right-3 inline-flex items-center text-gray-400 transition hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                        aria-label={showInitialAdminPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      >
                        {showInitialAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-2 -mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Логин генерируется латиницей. Разрешены буквы a-z, цифры и символы `.`, `_`, `-`.</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleResetAdminUsername}
                        className="font-medium text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        Сбросить логин
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateAdminPassword}
                        className="inline-flex items-center gap-1 font-medium text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Сгенерировать пароль
                      </button>
                    </div>
                  </div>
                  <Input
                    label="Имя администратора"
                    value={initialAdmin.full_name}
                    onChange={(e) => setInitialAdmin({ ...initialAdmin, full_name: e.target.value })}
                    placeholder="Иван Иванов"
                  />
                  <Input
                    label="Email администратора"
                    type="email"
                    value={initialAdmin.email}
                    onChange={(e) => setInitialAdmin({ ...initialAdmin, email: e.target.value })}
                    placeholder="admin@org.example"
                  />
                  <Input
                    label="Телефон администратора"
                    value={initialAdmin.phone}
                    onChange={(e) => setInitialAdmin({ ...initialAdmin, phone: e.target.value })}
                    placeholder="+7 (999) 123-45-67"
                    className="md:col-span-2"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="ghost" onClick={handleCloseModal} type="button">
              Отмена
            </Button>
            <Button type="submit" disabled={isMutating}>
              {isMutating ? 'Сохранение...' : editingOrg ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
        )}
      </Modal>
    </div>
  )
}

function CredentialRow({
  label,
  value,
  monospace = false,
  highlight = false,
}: {
  label: string
  value: string
  monospace?: boolean
  highlight?: boolean
}) {
  return (
    <div className={`grid gap-1 rounded-lg border px-3 py-2 ${highlight ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/70'}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={monospace ? 'break-all font-mono text-sm text-gray-900 dark:text-white' : 'text-sm text-gray-900 dark:text-white'}>
        {value}
      </span>
    </div>
  )
}

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Edit,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  User,
  Users as UsersIcon,
  X,
} from 'lucide-react'
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '@/hooks/useUsers'
import { useOrganizations } from '@/hooks/useOrganizations'
import { useAuthStore } from '@/store/authStore'
import {
  isSuperadminRole,
  type CreateUserData,
  type UpdateUserData,
  type User as UserType,
  type UserRole,
} from '@/types/user'
import { mutationToast } from '@/utils/apiError'
import { formatDateOnly as formatDate } from '@/utils/dateFormat'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import Input from '@/components/Input'
import Select from '@/components/Select'
import { SkeletonTable } from '@/components/Skeleton'

const roleOptions = [
  { value: 'superadmin', label: 'Супер-админ' },
  { value: 'admin', label: 'Администратор' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'dispatcher', label: 'Диспетчер' },
  { value: 'worker', label: 'Работник' },
]

const roleConfig: Record<UserRole, { label: string; variant: 'info' | 'warning' | 'danger'; icon: typeof User }> = {
  superadmin: { label: 'Супер-админ', variant: 'danger', icon: Shield },
  admin: { label: 'Администратор', variant: 'danger', icon: Shield },
  manager: { label: 'Менеджер', variant: 'warning', icon: UsersIcon },
  dispatcher: { label: 'Диспетчер', variant: 'warning', icon: UsersIcon },
  worker: { label: 'Работник', variant: 'info', icon: Briefcase },
}

interface UserFormData {
  username: string
  password: string
  full_name: string
  email: string
  phone: string
  role: UserRole
}

interface UserGroup {
  key: string
  organizationId: number | null
  organizationName: string
  isOrganizationActive: boolean | null
  users: UserType[]
}

const initialFormData: UserFormData = {
  username: '',
  password: '',
  full_name: '',
  email: '',
  phone: '',
  role: 'worker',
}

function getUserDisplayName(user: UserType) {
  return user.full_name?.trim() || user.username
}

export default function UsersPage() {
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [formData, setFormData] = useState<UserFormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([])

  const currentUser = useAuthStore((state) => state.user)
  const isSuperadmin = isSuperadminRole(currentUser?.role, currentUser?.organizationId)

  const { data: users, isLoading, refetch, isFetching } = useUsers()
  const {
    data: organizations,
    refetch: refetchOrganizations,
    isFetching: isFetchingOrganizations,
  } = useOrganizations(true, isSuperadmin)
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const deleteMutation = useDeleteUser()

  const organizationMap = useMemo(
    () => new Map((organizations ?? []).map((organization) => [organization.id, organization])),
    [organizations],
  )

  const groupedUsers = useMemo<UserGroup[]>(() => {
    if (!users) return []

    const groups = new Map<string, UserGroup>()
    const sortedUsers = [...users].sort((left, right) => {
      const leftName = getUserDisplayName(left)
      const rightName = getUserDisplayName(right)

      return leftName.localeCompare(rightName, 'ru', { sensitivity: 'base' })
        || left.username.localeCompare(right.username, 'ru', { sensitivity: 'base' })
    })

    sortedUsers.forEach((user) => {
      const organizationId = user.organization_id ?? null
      const organization = organizationId != null ? organizationMap.get(organizationId) : undefined
      const organizationName = organization?.name
        ?? (organizationId != null && organizationId === currentUser?.organizationId
          ? currentUser.organizationName
          : null)
        ?? (organizationId == null ? 'Без организации' : `Организация #${organizationId}`)
      const key = organizationId == null ? 'org:none' : `org:${organizationId}`
      const existingGroup = groups.get(key)

      if (existingGroup) {
        existingGroup.users.push(user)
        return
      }

      groups.set(key, {
        key,
        organizationId,
        organizationName,
        isOrganizationActive: organization?.is_active ?? null,
        users: [user],
      })
    })

    return [...groups.values()].sort((left, right) => {
      if (left.organizationId == null && right.organizationId == null) {
        return left.organizationName.localeCompare(right.organizationName, 'ru', { sensitivity: 'base' })
      }
      if (left.organizationId == null) return 1
      if (right.organizationId == null) return -1

      return left.organizationName.localeCompare(right.organizationName, 'ru', { sensitivity: 'base' })
    })
  }, [
    currentUser?.organizationId,
    currentUser?.organizationName,
    organizationMap,
    users,
  ])

  const collapsedCount = groupedUsers.filter((group) => collapsedGroupKeys.includes(group.key)).length
  const isRefreshing = isFetching || isFetchingOrganizations
  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const availableRoleOptions = useMemo(() => {
    const baseOptions = roleOptions.filter(
      (option) => isSuperadmin || (option.value !== 'superadmin' && option.value !== 'admin'),
    )

    if (baseOptions.some((option) => option.value === formData.role)) {
      return baseOptions
    }

    const currentRoleOption = roleOptions.find((option) => option.value === formData.role)
    return currentRoleOption ? [currentRoleOption, ...baseOptions] : baseOptions
  }, [formData.role, isSuperadmin])

  const handleOpenCreate = () => {
    setEditingUser(null)
    setFormData(initialFormData)
    setShowModal(true)
  }

  const handleOpenEdit = (user: UserType) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
    })
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setFormData(initialFormData)
  }

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroupKeys((current) => (
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey]
    ))
  }

  const handleExpandAll = () => {
    setCollapsedGroupKeys([])
  }

  const handleCollapseAll = () => {
    setCollapsedGroupKeys(groupedUsers.map((group) => group.key))
  }

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      isSuperadmin ? refetchOrganizations() : Promise.resolve(),
    ])
    toast.success('Список обновлён')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.username.trim()) {
      toast.error('Введите имя пользователя')
      return
    }

    if (!editingUser && !formData.password) {
      toast.error('Введите пароль')
      return
    }

    if (editingUser) {
      const updateData: UpdateUserData = {
        username: formData.username,
        full_name: formData.full_name || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        role: formData.role,
      }

      if (formData.password) {
        updateData.password = formData.password
      }

      updateMutation.mutate(
        { id: editingUser.id, data: updateData },
        mutationToast({
          success: 'Пользователь обновлён',
          error: 'Ошибка обновления',
          onSuccess: () => handleCloseModal(),
        }),
      )
      return
    }

    const createData: CreateUserData = {
      username: formData.username,
      password: formData.password,
      full_name: formData.full_name || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      role: formData.role,
    }

    createMutation.mutate(
      createData,
      mutationToast({
        success: 'Пользователь создан',
        error: 'Ошибка создания',
        onSuccess: () => handleCloseModal(),
      }),
    )
  }

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      id,
      mutationToast({
        success: 'Пользователь удалён',
        error: 'Ошибка удаления',
        onSuccess: () => setDeleteConfirm(null),
      }),
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Пользователи</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {users ? `Всего: ${users.length} • групп: ${groupedUsers.length || 1}` : 'Загрузка...'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить
          </Button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable rows={4} columns={5} />
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Пользователей нет"
          description="Добавьте первого пользователя"
          action={(
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить пользователя
            </Button>
          )}
        />
      ) : (
        <div className="space-y-4">
          {groupedUsers.length > 1 && (
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Badge variant="info">Организаций: {groupedUsers.length}</Badge>
                <Badge variant="gray">Свернуто: {collapsedCount}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExpandAll}
                  disabled={collapsedGroupKeys.length === 0}
                >
                  Развернуть все
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCollapseAll}
                  disabled={collapsedCount === groupedUsers.length}
                >
                  Свернуть все
                </Button>
              </div>
            </div>
          )}

          {groupedUsers.map((group) => {
            const isCollapsed = collapsedGroupKeys.includes(group.key)
            const activeUsersCount = group.users.filter((user) => user.is_active).length

            return (
              <section
                key={group.key}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:bg-gray-900/70"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {group.organizationName}
                        </h2>
                        {group.organizationId == null && <Badge variant="gray">Без организации</Badge>}
                        {group.isOrganizationActive === false && <Badge variant="warning">Неактивна</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Пользователей: {group.users.length}</span>
                        <span>Активных: {activeUsersCount}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {group.users.length}
                    </span>
                    {isCollapsed ? (
                      <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                            Пользователь
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                            Роль
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                            Контакты
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                            Заявок
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                            Статус
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                            Последний вход
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                            Действия
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {group.users.map((user) => {
                          const role = roleConfig[user.role]
                          const RoleIcon = role.icon

                          return (
                            <tr key={user.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700">
                                    <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{user.username}</p>
                                    {user.full_name && (
                                      <p className="text-sm text-gray-500 dark:text-gray-400">{user.full_name}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={role.variant}>
                                  <RoleIcon className="mr-1 h-3 w-3" />
                                  {role.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm">
                                  {user.email && <p className="text-gray-600 dark:text-gray-300">{user.email}</p>}
                                  {user.phone && <p className="text-gray-500 dark:text-gray-400">{user.phone}</p>}
                                  {!user.email && !user.phone && <span className="text-gray-400 dark:text-gray-500">—</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                  {user.assigned_tasks_count}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {user.is_active ? (
                                  <Badge variant="success">
                                    <Check className="mr-1 h-3 w-3" />
                                    Активен
                                  </Badge>
                                ) : (
                                  <Badge variant="gray">Неактивен</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {user.last_login ? formatDate(user.last_login) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEdit(user)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  {deleteConfirm === user.id ? (
                                    <>
                                      <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => handleDelete(user.id)}
                                        isLoading={deleteMutation.isPending}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeleteConfirm(null)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDeleteConfirm(user.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-6 py-4">
                <Input
                  label="Имя пользователя *"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="username"
                />
                <Input
                  type="password"
                  label={editingUser ? 'Новый пароль' : 'Пароль *'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? 'Оставьте пустым, чтобы не менять' : '••••••••'}
                />
                <Input
                  label="Полное имя"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Иван Иванов"
                />
                <Input
                  type="email"
                  label="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
                <Input
                  label="Телефон"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+7 (999) 123-45-67"
                />
                <Select
                  label="Роль"
                  options={availableRoleOptions}
                  value={formData.role}
                  onChange={(value) => setFormData({ ...formData, role: value as UserRole })}
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/50">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Отмена
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  {editingUser ? 'Сохранить' : 'Создать'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

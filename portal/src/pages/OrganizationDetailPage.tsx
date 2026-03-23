import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { mutationToast } from '@/utils/apiError'
import { formatDateOnly } from '@/utils/dateFormat'
import {
  ArrowLeft,
  Building2,
  Users,
  ClipboardList,
  MapPin,
  Mail,
  Phone,
  Edit,
  UserPlus,
  UserMinus,
  RefreshCw,
  Power,
  PowerOff,
} from 'lucide-react'
import {
  useOrganization,
  useOrganizationUsers,
  useUpdateOrganization,
  useActivateOrganization,
  useDeactivateOrganization,
  useAssignUser,
  useUnassignUser,
} from '@/hooks/useOrganizations'
import { useCreateUser } from '@/hooks/useUsers'
import type { UpdateOrganizationData } from '@/types/organization'
import type { OrgUser } from '@/api/organizations'
import { getRoleLabel, isSuperadminRole, type UserRole } from '@/types/user'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

type Tab = 'info' | 'users'
type AddUserMode = 'create' | 'assign'

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orgId = Number(id)

  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [addUserMode, setAddUserMode] = useState<AddUserMode>('create')
  const [assignUserId, setAssignUserId] = useState('')
  const [newUserData, setNewUserData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    phone: '',
    role: 'worker' as UserRole,
  })
  const [unassignConfirm, setUnassignConfirm] = useState<number | null>(null)
  const currentUser = useAuthStore((state) => state.user)
  const canCreateAdminRole = isSuperadminRole(currentUser?.role, currentUser?.organizationId)

  const { data: org, isLoading: orgLoading, refetch: refetchOrg } = useOrganization(orgId)
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useOrganizationUsers(orgId)

  const updateMutation = useUpdateOrganization()
  const activateMutation = useActivateOrganization()
  const deactivateMutation = useDeactivateOrganization()
  const assignMutation = useAssignUser()
  const unassignMutation = useUnassignUser()
  const createUserMutation = useCreateUser()

  const [editData, setEditData] = useState({
    name: '',
    description: '',
    email: '',
    phone: '',
    address: '',
    max_users: 50,
    max_tasks: 10000,
  })

  const handleOpenEdit = () => {
    if (!org) return
    setEditData({
      name: org.name,
      description: org.description ?? '',
      email: org.email ?? '',
      phone: org.phone ?? '',
      address: org.address ?? '',
      max_users: org.max_users,
      max_tasks: org.max_tasks,
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editData.name.trim()) {
      toast.error('Введите название')
      return
    }

    const data: UpdateOrganizationData = {
      name: editData.name,
      description: editData.description || undefined,
      email: editData.email || undefined,
      phone: editData.phone || undefined,
      address: editData.address || undefined,
      max_users: editData.max_users,
      max_tasks: editData.max_tasks,
    }

    updateMutation.mutate(
      { id: orgId, data },
      mutationToast({
        success: 'Организация обновлена',
        error: 'Ошибка обновления',
        onSuccess: () => setShowEditModal(false),
      })
    )
  }

  const handleAssignUser = (e: React.FormEvent) => {
    e.preventDefault()
    const userId = Number(assignUserId)
    if (!userId) {
      toast.error('Введите ID пользователя')
      return
    }

    assignMutation.mutate(
      { user_id: userId, organization_id: orgId },
      mutationToast({
        success: 'Пользователь добавлен',
        error: 'Ошибка добавления пользователя',
        onSuccess: () => {
          setShowAssignModal(false)
          setAssignUserId('')
        },
      })
    )
  }

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserData.username.trim()) {
      toast.error('Введите логин')
      return
    }
    if (!newUserData.password.trim() || newUserData.password.length < 4) {
      toast.error('Пароль минимум 4 символа')
      return
    }

    createUserMutation.mutate(
      {
        username: newUserData.username.trim(),
        password: newUserData.password,
        full_name: newUserData.full_name.trim() || undefined,
        email: newUserData.email.trim() || undefined,
        phone: newUserData.phone.trim() || undefined,
        role: newUserData.role,
        organization_id: orgId,
      },
      mutationToast({
        success: 'Пользователь создан и добавлен в организацию',
        error: 'Ошибка создания пользователя',
        onSuccess: () => {
          setShowAssignModal(false)
          setNewUserData({ username: '', password: '', full_name: '', email: '', phone: '', role: 'worker' })
          setActiveTab('users')
          refetchUsers()
          refetchOrg()
        },
      })
    )
  }

  const handleOpenAddUser = () => {
    setAddUserMode('create')
    setAssignUserId('')
    setNewUserData({ username: '', password: '', full_name: '', email: '', phone: '', role: 'worker' })
    setShowAssignModal(true)
  }

  const handleUnassignUser = (userId: number) => {
    unassignMutation.mutate(
      { orgId, userId },
      mutationToast({
        success: 'Пользователь убран из организации',
        error: 'Ошибка',
        onSuccess: () => setUnassignConfirm(null),
      })
    )
  }

  const handleToggleActive = () => {
    if (!org) return
    if (org.is_active) {
      deactivateMutation.mutate(
        orgId,
        mutationToast({
          success: 'Организация деактивирована',
          error: 'Ошибка деактивации',
        })
      )
    } else {
      activateMutation.mutate(
        orgId,
        mutationToast({
          success: 'Организация активирована',
          error: 'Ошибка активации',
        })
      )
    }
  }

  if (orgLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 animate-pulse" />
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    )
  }

  if (!org) {
    return (
      <EmptyState
        icon={Building2}
        title="Организация не найдена"
        description="Организация с таким ID не существует"
        action={<Button onClick={() => navigate('/admin/organizations')}>Назад к списку</Button>}
      />
    )
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Информация', icon: Building2 },
    { key: 'users', label: `Пользователи (${org.user_count})`, icon: Users },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/organizations')}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {org.name}
              </h1>
              <Badge variant={org.is_active ? 'success' : 'gray'}>
                {org.is_active ? 'Активна' : 'Неактивна'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {org.slug}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { refetchOrg(); refetchUsers() }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggleActive}>
            {org.is_active ?
              <><PowerOff className="w-4 h-4 mr-1" />Деактивировать</> :
              <><Power className="w-4 h-4 mr-1" />Активировать</>
            }
          </Button>
          <Button size="sm" onClick={handleOpenEdit}>
            <Edit className="w-4 h-4 mr-1" />
            Редактировать
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Пользователи</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {org.user_count} <span className="text-sm font-normal text-gray-400">/ {org.max_users}</span>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Заявки</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {org.task_count} <span className="text-sm font-normal text-gray-400">/ {org.max_tasks}</span>
              </p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <MapPin className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Адреса</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{org.address_count}</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <p>Создана: {org.created_at ? formatDateOnly(org.created_at) : '—'}</p>
            {org.updated_at && <p>Обновлена: {formatDateOnly(org.updated_at)}</p>}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <Card>
          <div className="p-6 space-y-4">
            {org.description && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Описание</h3>
                <p className="mt-1 text-gray-900 dark:text-white">{org.description}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {org.email && (
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {org.email}
                </div>
              )}
              {org.phone && (
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {org.phone}
                </div>
              )}
              {org.address && (
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {org.address}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Лимит пользователей:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">{org.max_users}</span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Лимит заявок:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">{org.max_tasks}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'users' && (
        <Card>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-medium text-gray-900 dark:text-white">
              Пользователи организации
            </h3>
            <Button size="sm" onClick={handleOpenAddUser}>
              <UserPlus className="w-4 h-4 mr-1" />
              Добавить
            </Button>
          </div>
          {usersLoading ? (
            <SkeletonTable rows={3} columns={5} />
          ) : !users || users.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Users}
                title="Нет пользователей"
                description="Назначьте пользователей в эту организацию"
                action={
                  <Button size="sm" onClick={handleOpenAddUser}>
                    <UserPlus className="w-4 h-4 mr-1" />
                    Добавить пользователя
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Пользователь</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Роль</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Заявки</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Статус</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((u: OrgUser) => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {u.id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{u.full_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {u.username}
                          {u.email && ` · ${u.email}`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === 'manager' || u.role === 'dispatcher' ? 'warning' : u.role === 'worker' ? 'gray' : 'info'}>
                          {getRoleLabel(u.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                        {u.assigned_tasks_count}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.is_active ? 'success' : 'gray'}>
                          {u.is_active ? 'Активен' : 'Неактивен'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {unassignConfirm === u.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleUnassignUser(u.id)}
                              disabled={unassignMutation.isPending}
                            >
                              Убрать
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setUnassignConfirm(null)}>
                              Отмена
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setUnassignConfirm(u.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Убрать из организации"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Редактировать организацию"
        size="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Название *"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            required
          />
          <Input
            label="Описание"
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={editData.email}
              onChange={(e) => setEditData({ ...editData, email: e.target.value })}
            />
            <Input
              label="Телефон"
              value={editData.phone}
              onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
            />
          </div>
          <Input
            label="Адрес"
            value={editData.address}
            onChange={(e) => setEditData({ ...editData, address: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Макс. пользователей"
              type="number"
              value={String(editData.max_users)}
              onChange={(e) => setEditData({ ...editData, max_users: Number(e.target.value) || 50 })}
              min={1}
              max={10000}
            />
            <Input
              label="Макс. заявок"
              type="number"
              value={String(editData.max_tasks)}
              onChange={(e) => setEditData({ ...editData, max_tasks: Number(e.target.value) || 10000 })}
              min={1}
              max={1000000}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="ghost" onClick={() => setShowEditModal(false)} type="button">
              Отмена
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add User Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Добавить пользователя"
      >
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              addUserMode === 'create'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
            onClick={() => setAddUserMode('create')}
          >
            Создать нового
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              addUserMode === 'assign'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
            onClick={() => setAddUserMode('assign')}
          >
            Привязать существующего
          </button>
        </div>

        {addUserMode === 'create' ? (
          <form onSubmit={handleCreateUser} className="space-y-4">
            <Input
              label="Логин *"
              value={newUserData.username}
              onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
              placeholder="Введите логин"
              required
            />
            <Input
              label="Пароль *"
              type="password"
              value={newUserData.password}
              onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
              placeholder="Минимум 4 символа"
              required
            />
            <Input
              label="ФИО"
              value={newUserData.full_name}
              onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
              placeholder="Иванов Иван Иванович"
            />
            <Input
              label="Email"
              type="email"
              value={newUserData.email}
              onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              placeholder="user@example.com"
            />
            <Input
              label="Телефон"
              value={newUserData.phone}
              onChange={(e) => setNewUserData({ ...newUserData, phone: e.target.value })}
              placeholder="+7 999 123-45-67"
            />
            <Select
              label="Роль *"
              value={newUserData.role}
              onChange={(value) => setNewUserData({ ...newUserData, role: value as UserRole })}
              options={[
                ...(canCreateAdminRole ? [{ value: 'admin', label: 'Администратор' }] : []),
                { value: 'worker', label: 'Исполнитель' },
                { value: 'manager', label: 'Менеджер' },
                { value: 'dispatcher', label: 'Диспетчер' },
              ]}
            />
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="ghost" onClick={() => setShowAssignModal(false)} type="button">
                Отмена
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? 'Создание...' : 'Создать'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAssignUser} className="space-y-4">
            <Input
              label="ID пользователя"
              type="number"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              placeholder="Введите ID существующего пользователя"
              required
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Введите ID пользователя из раздела «Пользователи» для добавления в организацию.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="ghost" onClick={() => setShowAssignModal(false)} type="button">
                Отмена
              </Button>
              <Button type="submit" disabled={assignMutation.isPending}>
                {assignMutation.isPending ? 'Добавление...' : 'Добавить'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import toast from 'react-hot-toast'
import { 
  Plus, 
  RefreshCw, 
  User, 
  Shield, 
  Briefcase, 
  Users as UsersIcon,
  Edit,
  Trash2,
  X,
  Check
} from 'lucide-react'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/useUsers'
import type { User as UserType, UserRole, CreateUserData, UpdateUserData } from '@/types/user'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'

const roleOptions = [
  { value: 'worker', label: 'Работник' },
  { value: 'dispatcher', label: 'Диспетчер' },
  { value: 'admin', label: 'Администратор' },
]

const roleConfig: Record<UserRole, { label: string; variant: 'info' | 'warning' | 'danger'; icon: typeof User }> = {
  worker: { label: 'Работник', variant: 'info', icon: Briefcase },
  dispatcher: { label: 'Диспетчер', variant: 'warning', icon: UsersIcon },
  admin: { label: 'Администратор', variant: 'danger', icon: Shield },
}

interface UserFormData {
  username: string
  password: string
  full_name: string
  email: string
  phone: string
  role: UserRole
}

const initialFormData: UserFormData = {
  username: '',
  password: '',
  full_name: '',
  email: '',
  phone: '',
  role: 'worker',
}

export default function UsersPage() {
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [formData, setFormData] = useState<UserFormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { data: users, isLoading, refetch, isFetching } = useUsers()
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const deleteMutation = useDeleteUser()

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
      // Update
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
        {
          onSuccess: () => {
            toast.success('Пользователь обновлён')
            handleCloseModal()
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Ошибка обновления')
          },
        }
      )
    } else {
      // Create
      const createData: CreateUserData = {
        username: formData.username,
        password: formData.password,
        full_name: formData.full_name || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        role: formData.role,
      }

      createMutation.mutate(createData, {
        onSuccess: () => {
          toast.success('Пользователь создан')
          handleCloseModal()
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Ошибка создания')
        },
      })
    }
  }

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Пользователь удалён')
        setDeleteConfirm(null)
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Ошибка удаления')
      },
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Пользователи</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {users ? `Всего: ${users.length}` : 'Загрузка...'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch().then(() => toast.success('Список обновлён'))}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner size="lg" />
        </div>
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Пользователей нет"
          description="Добавьте первого пользователя"
          action={
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить пользователя
            </Button>
          }
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Пользователь
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Роль
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Контакты
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Заявок
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Статус
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Последний вход
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => {
                  const role = roleConfig[user.role]
                  const RoleIcon = role.icon
                  
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
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
                          <RoleIcon className="h-3 w-3 mr-1" />
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
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300">
                          {user.assigned_tasks_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.is_active ? (
                          <Badge variant="success">
                            <Check className="h-3 w-3 mr-1" />
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
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
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
              <div className="px-6 py-4 space-y-4">
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
                  options={roleOptions}
                  value={formData.role}
                  onChange={(value) => setFormData({ ...formData, role: value as UserRole })}
                />
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
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

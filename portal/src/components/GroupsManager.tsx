import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Edit2, Plus, Trash2, UserCog, X } from 'lucide-react'
import apiClient from '@/api/client'
import { useCreateGroup, useDeleteGroup, useGroups, useUpdateGroup } from '@/hooks/useGroups'
import { useOrganizations } from '@/hooks/useOrganizations'
import type { UserGroup } from '@/types/user'
import { mutationToast } from '@/utils/apiError'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import Spinner from '@/components/Spinner'
import { SettingsCard } from '@/components/settings/SettingsSection'

// Управление группами (кастомными ролями) и матрицей их прав. Бэкенд скоупит
// группы по организации вызывающего, поэтому компонент переиспользуется как
// суперадмином (Система), так и орг-админом (страница Пользователи).

const PERMISSION_ROWS = [
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

const BASE_ACCESS_LABELS: Record<string, string> = {
  admin: 'Админ',
  dispatcher: 'Диспетчер',
  worker: 'Исполнитель',
}

interface GroupFormState {
  name: string
  label: string
  description: string
  base_access: string
}

const emptyGroupForm: GroupFormState = { name: '', label: '', description: '', base_access: 'worker' }

// ?organization_id= для сырых вызовов матрицы прав (хуки групп делают это сами).
function orgParams(organizationId?: number) {
  return organizationId != null ? { params: { organization_id: organizationId } } : undefined
}

interface GroupsManagerProps {
  // На странице «Система» суперадмин не привязан к организации, поэтому выбирает
  // её здесь; на странице «Пользователи» орг-админ скоупится бэкендом, селектор
  // не нужен.
  showOrgSelector?: boolean
}

export default function GroupsManager({ showOrgSelector = false }: GroupsManagerProps) {
  const queryClient = useQueryClient()
  const { data: organizations = [] } = useOrganizations(false, showOrgSelector)
  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>(undefined)
  // Орг-админ (без селектора) опускает скоуп — бэкенд берёт его организацию.
  const orgId = showOrgSelector ? selectedOrgId : undefined
  // Кастомные группы принадлежат организации: суперадмину нужно её выбрать.
  const canCreate = !showOrgSelector || selectedOrgId != null

  const { data: groups = [], isLoading: groupsLoading } = useGroups(orgId)
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['role-permissions', orgId ?? null],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, Record<string, boolean>>>(
        '/admin/permissions',
        orgParams(orgId),
      )
      return response.data
    },
  })
  const updatePermissionsMutation = useMutation({
    mutationFn: ({ role, permission, value }: { role: string; permission: string; value: boolean }) =>
      apiClient.patch(
        `/admin/permissions/${role}`,
        { permissions: { [permission]: value } },
        orgParams(orgId),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', orgId ?? null] })
      toast.success('Права обновлены')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления прав')
    },
  })

  const createGroup = useCreateGroup(orgId)
  const updateGroup = useUpdateGroup(orgId)
  const deleteGroup = useDeleteGroup(orgId)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<UserGroup | null>(null)
  const [form, setForm] = useState<GroupFormState>(emptyGroupForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  // Имя группы-источника при дублировании (для копирования её прав в новую).
  const [duplicateSource, setDuplicateSource] = useState<string | null>(null)

  const isDisabled = (group: string) => group === 'admin' || updatePermissionsMutation.isPending
  const isSavingGroup = createGroup.isPending || updateGroup.isPending

  const openCreate = () => {
    setEditing(null)
    setDuplicateSource(null)
    setForm(emptyGroupForm)
    setShowModal(true)
  }

  const openEdit = (group: UserGroup) => {
    setEditing(group)
    setDuplicateSource(null)
    setForm({
      name: group.name,
      label: group.label,
      description: group.description ?? '',
      base_access: group.base_access,
    })
    setShowModal(true)
  }

  const openDuplicate = (group: UserGroup) => {
    setEditing(null)
    setDuplicateSource(group.name)
    setForm({
      name: '',
      label: `${group.label} (копия)`,
      description: group.description ?? '',
      base_access: group.base_access === 'admin' ? 'dispatcher' : group.base_access,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setDuplicateSource(null)
    setForm(emptyGroupForm)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.label.trim()) {
      toast.error('Укажите название группы')
      return
    }

    if (editing) {
      const data: { name?: string; label: string; description: string; base_access?: string } = {
        label: form.label.trim(),
        description: form.description.trim(),
      }
      if (!editing.is_system) {
        data.base_access = form.base_access
        // Переименование slug (если изменён)
        if (form.name.trim() && form.name.trim() !== editing.name) {
          if (!/^[a-z][a-z0-9_]*$/.test(form.name.trim())) {
            toast.error('Идентификатор: латиница в нижнем регистре, цифры и _')
            return
          }
          data.name = form.name.trim()
        }
      }
      updateGroup.mutate(
        { name: editing.name, data },
        mutationToast({ success: 'Группа обновлена', error: 'Ошибка сохранения', onSuccess: closeModal }),
      )
      return
    }

    const newName = form.name.trim()
    if (!/^[a-z][a-z0-9_]*$/.test(newName)) {
      toast.error('Идентификатор: латиница в нижнем регистре, цифры и _')
      return
    }
    const source = duplicateSource
    createGroup.mutate(
      {
        name: newName,
        label: form.label.trim(),
        description: form.description.trim(),
        base_access: form.base_access,
        sort_order: 0,
      },
      {
        onSuccess: async () => {
          // Дублирование: копируем матрицу прав из группы-источника.
          if (source && permissions?.[source]) {
            try {
              await apiClient.patch(
                `/admin/permissions/${newName}`,
                { permissions: permissions[source] },
                orgParams(orgId),
              )
              queryClient.invalidateQueries({ queryKey: ['role-permissions', orgId ?? null] })
            } catch {
              toast.error('Группа создана, но права не скопированы')
            }
          }
          toast.success('Группа создана')
          closeModal()
        },
        onError: (error: Error) => toast.error(error.message || 'Ошибка создания'),
      },
    )
  }

  const handleDelete = (name: string) => {
    deleteGroup.mutate(
      name,
      mutationToast({
        success: 'Группа удалена',
        error: 'Ошибка удаления',
        onSuccess: () => setDeleteConfirm(null),
      }),
    )
  }

  return (
    <SettingsCard
      title="Группы и права доступа"
      icon={UserCog}
      description="Создавайте группы пользователей (роли) и настраивайте их права. У администратора включено всё."
    >
      {showOrgSelector && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Организация
          </label>
          <select
            value={selectedOrgId ?? ''}
            onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Глобальные (встроенные роли)</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Кастомные группы принадлежат организации — выберите её, чтобы создавать
            и настраивать группы. «Глобальные» — встроенные роли для всех организаций.
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <span
              key={group.name}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800/60"
            >
              <span className="font-medium text-gray-700 dark:text-gray-200">{group.label}</span>
              <Badge variant="gray">{BASE_ACCESS_LABELS[group.base_access] ?? group.base_access}</Badge>
              <button
                type="button"
                onClick={() => openDuplicate(group)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Дублировать"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {group.is_system ? (
                <Badge variant="info">Системная</Badge>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openEdit(group)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Изменить"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  {deleteConfirm === group.name ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(group.name)}
                        className="text-red-500 hover:text-red-600"
                        title="Подтвердить удаление"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(null)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Отмена"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(group.name)}
                      className="text-gray-400 hover:text-red-500"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </span>
          ))}
        </div>
        <Button
          size="sm"
          onClick={openCreate}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Выберите организацию, чтобы создавать группы'}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Добавить группу
        </Button>
      </div>

      {isLoading || groupsLoading ? (
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
                {groups.map((group) => (
                  <th
                    key={group.name}
                    className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    {group.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                    {row.label}
                  </td>
                  {groups.map((group) => {
                    const checked = permissions?.[group.name]?.[row.id] ?? (group.name === 'admin')
                    return (
                      <td key={group.name} className="px-4 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isDisabled(group.name)}
                          onChange={(event) =>
                            updatePermissionsMutation.mutate({
                              role: group.name,
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Редактировать группу' : 'Новая группа'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-6 py-4">
                {(!editing || !editing.is_system) && (
                  <Input
                    label="Идентификатор *"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
                    placeholder="accountant"
                  />
                )}
                <Input
                  label="Название *"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Бухгалтер"
                />
                <Textarea
                  label="Описание"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Базовый доступ
                  </label>
                  <select
                    value={form.base_access}
                    disabled={editing?.is_system}
                    onChange={(e) => setForm({ ...form, base_access: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="dispatcher">Диспетчер (управление заявками)</option>
                    <option value="worker">Исполнитель</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Определяет навигацию портала. Точные права настраиваются в матрице ниже.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/50">
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Отмена
                </Button>
                <Button type="submit" isLoading={isSavingGroup}>
                  {editing ? 'Сохранить' : 'Создать'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}

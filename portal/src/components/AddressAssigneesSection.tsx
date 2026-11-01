/**
 * Раздел «Доступ / ответственные» карточки адреса.
 *
 * Назначение пользователей на адрес: назначенные видят адрес в мобильном
 * разделе «Мои адреса» и могут открывать двери панелей этого объекта.
 * Управление доступно только admin/dispatcher.
 */
import { useState } from 'react'
import { Plus, Trash2, UserCheck, X } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Spinner from '@/components/Spinner'
import { useAssignees, useAddAssignee, useRemoveAssignee } from '@/hooks/useAddressCard'
import { useUsers } from '@/hooks/useUsers'
import { showApiError, showApiSuccess } from '@/utils/apiError'

export default function AddressAssigneesSection({ addressId }: { addressId: number }) {
  const { data: assignees = [], isLoading } = useAssignees(addressId)
  const { data: users = [] } = useUsers()
  const addAssignee = useAddAssignee(addressId)
  const removeAssignee = useRemoveAssignee(addressId)

  const [addModal, setAddModal] = useState(false)

  const assignedIds = new Set(assignees.map((a) => a.user_id))
  const availableUsers = users.filter((u) => !assignedIds.has(u.id))

  const handleAdd = async (userId: number) => {
    try {
      await addAssignee.mutateAsync(userId)
      showApiSuccess('Пользователь назначен')
      setAddModal(false)
    } catch (err) {
      showApiError(err, 'Не удалось назначить пользователя')
    }
  }

  const handleRemove = async (userId: number) => {
    try {
      await removeAssignee.mutateAsync(userId)
      showApiSuccess('Доступ снят')
    } catch (err) {
      showApiError(err, 'Не удалось снять доступ')
    }
  }

  return (
    <Card
      flush
      title="Доступ"
      action={
        <button
          type="button"
          onClick={() => setAddModal(true)}
          title="Назначить сотрудника"
          aria-label="Назначить сотрудника"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <Plus className="h-4 w-4" />
        </button>
      }
    >
      {isLoading ? (
        <div className="py-4 flex justify-center">
          <Spinner />
        </div>
      ) : assignees.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Никто не назначен</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {assignees.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-4 py-2">
              <UserCheck className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {a.full_name || a.username || `#${a.user_id}`}
                </p>
                {a.role_label && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{a.role_label}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(a.user_id)}
                title="Снять доступ"
                aria-label="Снять доступ"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Видят адрес в «Мои адреса» и открывают двери панелей.
      </p>

      <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="Назначить на адрес">
        {availableUsers.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
            Все пользователи уже назначены.
          </div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {availableUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => handleAdd(u.id)}
                disabled={addAssignee.isPending}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                <p className="font-medium text-gray-900 dark:text-white">
                  {u.full_name || u.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {u.role_label || u.username}
                </p>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={() => setAddModal(false)}>
            <X className="h-4 w-4 mr-1" /> Закрыть
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

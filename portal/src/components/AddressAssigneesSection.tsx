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
      title="Доступ к адресу"
      action={
        <Button size="sm" onClick={() => setAddModal(true)}>
          <Plus className="h-4 w-4 mr-1" /> Назначить
        </Button>
      }
    >
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Назначенные сотрудники видят этот адрес в мобильном разделе «Мои адреса»
        и могут открывать двери его сетевых панелей.
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Spinner />
        </div>
      ) : assignees.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          Никто не назначен на этот адрес.
        </div>
      ) : (
        <div className="space-y-2">
          {assignees.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                  <UserCheck className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {a.full_name || a.username || `#${a.user_id}`}
                  </p>
                  {a.role_label && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{a.role_label}</p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(a.user_id)}
                title="Снять доступ"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

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

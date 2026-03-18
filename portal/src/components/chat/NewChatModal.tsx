import { useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types/user'
import type { ConversationType } from '@/types/chat'
import { cn } from '@/utils/cn'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (type: ConversationType, name: string, userIds: number[]) => void
  isLoading?: boolean
}

export default function NewChatModal({ isOpen, onClose, onSubmit, isLoading }: Props) {
  const { user } = useAuthStore()
  const currentUserId = user?.id ?? null
  const [chatType, setChatType] = useState<'direct' | 'group'>('direct')
  const [groupName, setGroupName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [search, setSearch] = useState('')

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'chat-picker'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: User[] } | User[]>('/admin/users')
      return Array.isArray(data) ? data : data.items
    },
    enabled: isOpen,
  })

  const filteredUsers = users.filter((u) => {
    if (!u.is_active) return false
    if (currentUserId != null && u.id === currentUserId) return false

    return u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())
  })

  const selectedUsers = users.filter((candidate) => selectedUserIds.includes(candidate.id))

  const toggleUser = (id: number) => {
    if (chatType === 'direct') {
      setSelectedUserIds([id])
    } else {
      setSelectedUserIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
    }
  }

  const handleSubmit = () => {
    if (selectedUserIds.length === 0) return
    onSubmit(chatType, groupName, selectedUserIds)
    // Reset
    setChatType('direct')
    setGroupName('')
    setSelectedUserIds([])
    setSearch('')
  }

  const handleClose = () => {
    setChatType('direct')
    setGroupName('')
    setSelectedUserIds([])
    setSearch('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Новый чат" size="md">
      <div className="space-y-4">
        {/* Type switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => { setChatType('direct'); setSelectedUserIds([]) }}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition',
              chatType === 'direct'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
            )}
          >
            Личный чат
          </button>
          <button
            onClick={() => { setChatType('group'); setSelectedUserIds([]) }}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition',
              chatType === 'group'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
            )}
          >
            Групповой
          </button>
        </div>

        {/* Group name */}
        {chatType === 'group' && (
          <div className="space-y-2">
            <Input
              placeholder="Название группы"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Название поможет отличать группу от личных и task-чатов.
            </p>
          </div>
        )}

        {/* User search */}
        <Input
          placeholder="Поиск пользователей..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {selectedUsers.length > 0 && (
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {chatType === 'direct' ? 'Выбран собеседник' : `Выбрано участников: ${selectedUsers.length}`}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map((selectedUser) => (
                <button
                  key={selectedUser.id}
                  type="button"
                  onClick={() => toggleUser(selectedUser.id)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
                >
                  <span className="max-w-40 truncate">{selectedUser.full_name}</span>
                  <span className="text-gray-400 dark:text-gray-300">×</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User list */}
        <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => toggleUser(user.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition border-b border-gray-100 dark:border-gray-700 last:border-0',
                selectedUserIds.includes(user.id)
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
              )}
            >
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.full_name}
                </p>
                <p className="text-xs text-gray-500">@{user.username}</p>
              </div>
              {selectedUserIds.includes(user.id) && (
                <span className="text-primary-500 text-sm font-bold">✓</span>
              )}
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <p className="text-center py-6 text-sm text-gray-400">Пользователи не найдены</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              selectedUserIds.length === 0 ||
              (chatType === 'group' && !groupName.trim())
            }
          >
            Создать
          </Button>
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import Input from '@/components/Input'
import UserAvatar from '@/components/UserAvatar'
import { cn } from '@/utils/cn'
import { formatDatePretty } from '@/utils/dateFormat'
import { useUsers } from '@/hooks/useUsers'
import type { ConversationDetail, ConversationMemberRole, MemberInfo } from '@/types/chat'

type PendingAction =
  | { type: 'remove'; member: MemberInfo }
  | { type: 'transfer'; member: MemberInfo }
  | { type: 'role'; member: MemberInfo; nextRole: Exclude<ConversationMemberRole, 'owner'> }

interface Props {
  isOpen: boolean
  conversation: ConversationDetail | null | undefined
  currentUserId: number
  isSavingName?: boolean
  isUploadingAvatar?: boolean
  isAddingMembers?: boolean
  removingUserId?: number | null
  updatingRoleUserId?: number | null
  transferringOwnershipUserId?: number | null
  onClose: () => void
  onSaveName: (name: string) => void
  onUploadAvatar: (file: File) => void
  onAddMembers: (userIds: number[]) => void
  onRemoveMember: (userId: number) => void
  onUpdateMemberRole: (userId: number, role: Exclude<ConversationMemberRole, 'owner'>) => void
  onTransferOwnership: (userId: number) => void
}

export default function ChatSettingsModal({
  isOpen,
  conversation,
  currentUserId,
  isSavingName,
  isUploadingAvatar,
  isAddingMembers,
  removingUserId,
  updatingRoleUserId,
  transferringOwnershipUserId,
  onClose,
  onSaveName,
  onUploadAvatar,
  onAddMembers,
  onRemoveMember,
  onUpdateMemberRole,
  onTransferOwnership,
}: Props) {
  const [name, setName] = useState(conversation?.name ?? '')
  const [search, setSearch] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [actionMenuUserId, setActionMenuUserId] = useState<number | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const { data: users = [] } = useUsers()

  useEffect(() => {
    setName(conversation?.name ?? '')
  }, [conversation?.id, conversation?.name, isOpen])

  useEffect(() => {
    if (!isOpen) {
      setActionMenuUserId(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (actionMenuUserId == null) return

    const handlePointerDown = (event: MouseEvent) => {
      if (actionMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setActionMenuUserId(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionMenuUserId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionMenuUserId])

  const memberIds = useMemo(
    () => new Set((conversation?.members ?? []).map((member) => member.user_id)),
    [conversation],
  )
  const currentMember = conversation?.members.find((member) => member.user_id === currentUserId)
  const canManageOthers = currentMember?.role === 'owner' || currentMember?.role === 'admin'
  const canRenameConversation = currentMember?.role === 'owner' || currentMember?.role === 'admin'
  const canTransferOwnership = currentMember?.role === 'owner' && (conversation?.members.length ?? 0) > 1

  const sortedMembers = useMemo(() => {
    const roleWeight: Record<ConversationMemberRole, number> = {
      owner: 0,
      admin: 1,
      member: 2,
    }

    const members = conversation?.members ?? []

    return [...members].sort((left, right) => {
      if (left.user_id === currentUserId) return -1
      if (right.user_id === currentUserId) return 1

      const roleDiff = roleWeight[left.role] - roleWeight[right.role]
      if (roleDiff !== 0) return roleDiff

      return left.full_name.localeCompare(right.full_name, 'ru')
    })
  }, [conversation?.members, currentUserId])

  const membersSummary = useMemo(() => {
    return sortedMembers.reduce(
      (accumulator, member) => {
        if (member.role === 'owner') accumulator.owners += 1
        if (member.role === 'admin') accumulator.admins += 1
        if (member.role === 'member') accumulator.members += 1
        return accumulator
      },
      { owners: 0, admins: 0, members: 0 },
    )
  }, [sortedMembers])

  const availableUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return users.filter((user) => {
      if (memberIds.has(user.id)) return false
      if (!normalizedSearch) return true
      return user.full_name.toLowerCase().includes(normalizedSearch)
        || user.username.toLowerCase().includes(normalizedSearch)
    })
  }, [memberIds, search, users])

  const handleClose = () => {
    setName(conversation?.name ?? '')
    setSearch('')
    setSelectedUserIds([])
    setPendingAction(null)
    setActionMenuUserId(null)
    onClose()
  }

  const handleToggleUser = (userId: number) => {
    setSelectedUserIds((prev) => prev.includes(userId)
      ? prev.filter((id) => id !== userId)
      : [...prev, userId])
  }

  const handleSaveName = () => {
    if (!canRenameConversation) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === (conversation?.name ?? '').trim()) return
    onSaveName(trimmed)
  }

  const handleAddMembers = () => {
    if (selectedUserIds.length === 0) return
    onAddMembers(selectedUserIds)
    setSelectedUserIds([])
    setSearch('')
  }

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    onUploadAvatar(file)
  }

  const handleConfirmAction = () => {
    if (!pendingAction) return

    switch (pendingAction.type) {
      case 'remove':
        onRemoveMember(pendingAction.member.user_id)
        break
      case 'transfer':
        onTransferOwnership(pendingAction.member.user_id)
        break
      case 'role':
        onUpdateMemberRole(pendingAction.member.user_id, pendingAction.nextRole)
        break
    }

    setPendingAction(null)
  }

  if (!conversation) return null

  const pendingActionTitle = pendingAction
    ? pendingAction.type === 'remove'
      ? pendingAction.member.user_id === currentUserId
        ? 'Выйти из группы'
        : 'Удалить участника'
      : pendingAction.type === 'transfer'
        ? 'Передать ownership'
        : 'Изменить роль'
    : ''

  const pendingActionDescription = pendingAction
    ? pendingAction.type === 'remove'
      ? pendingAction.member.user_id === currentUserId
        ? 'Вы выйдете из этой группы и потеряете доступ к её истории, если вас не добавят повторно.'
        : `Пользователь ${pendingAction.member.full_name} будет удалён из группы.`
      : pendingAction.type === 'transfer'
        ? `После подтверждения ${pendingAction.member.full_name} станет owner, а вы получите роль admin.`
        : `Пользователь ${pendingAction.member.full_name} получит роль ${getRoleLabel(pendingAction.nextRole)}.`
    : ''

  const pendingActionConfirmLabel = pendingAction
    ? pendingAction.type === 'remove'
      ? pendingAction.member.user_id === currentUserId
        ? 'Выйти'
        : 'Удалить'
      : pendingAction.type === 'transfer'
        ? 'Передать'
        : 'Подтвердить'
    : 'Подтвердить'

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Настройки чата" size="lg">
        <div className="space-y-6">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Профиль чата</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canRenameConversation
                ? 'Название и фото можно менять без пересоздания чата.'
                : 'Изменение названия и фото доступно только owner и admin.'}
            </p>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <UserAvatar
                fullName={conversation.name ?? 'Групповой чат'}
                avatarUrl={conversation.avatar_url}
                sizeClassName="h-16 w-16"
                textClassName="text-lg"
                className="ring-1 ring-gray-200 dark:ring-gray-700"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {conversation.name ?? 'Без названия'}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Фото используется в списке чатов и в шапке разговора.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                variant="secondary"
                onClick={() => avatarInputRef.current?.click()}
                isLoading={isUploadingAvatar}
                disabled={!canRenameConversation}
              >
                Загрузить фото
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название чата"
              disabled={!canRenameConversation}
            />
            <Button onClick={handleSaveName} isLoading={isSavingName} disabled={!name.trim() || !canRenameConversation}>
              Сохранить
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Текущие участники</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Owner/admin может удалять участников, любой пользователь может выйти сам.</p>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
              <span className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                Всего: {sortedMembers.length}
              </span>
              <span className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                Владельцы: {membersSummary.owners}
              </span>
              <span className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                Админы: {membersSummary.admins}
              </span>
              <span className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                Участники: {membersSummary.members}
              </span>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900/40">
            {sortedMembers.map((member) => {
              const canRemove = member.user_id === currentUserId || canManageOthers
              const canChangeRole = canManageOthers && member.user_id !== currentUserId && member.role !== 'owner'
              const canTransfer = canTransferOwnership && member.user_id !== currentUserId && member.role !== 'owner'
              return (
                <div
                  key={member.user_id}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar
                        fullName={member.full_name}
                        avatarUrl={member.avatar_url}
                        sizeClassName="h-11 w-11"
                        textClassName="text-sm"
                        className={cn(
                          member.role === 'owner'
                            ? 'ring-2 ring-primary-200 dark:ring-primary-800/60'
                            : member.role === 'admin'
                              ? 'ring-2 ring-sky-200 dark:ring-sky-800/60'
                              : 'ring-1 ring-gray-200 dark:ring-gray-700',
                        )}
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{member.full_name}</div>
                          {member.user_id === currentUserId && (
                            <span className="inline-flex rounded-md border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-200">
                              Вы
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">@{member.username}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold',
                              member.role === 'owner'
                                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                                : member.role === 'admin'
                                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
                            )}
                          >
                            {getRoleLabel(member.role)}
                          </span>
                          <span className="inline-flex rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            В чате с {formatDatePretty(member.joined_at)}
                          </span>
                          {member.is_muted && (
                            <span className="inline-flex rounded-md border border-amber-200 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-900/40 dark:text-amber-300">
                              Без звука
                            </span>
                          )}
                          {member.is_archived && (
                            <span className="inline-flex rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Архив
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {(canTransfer || canChangeRole || canRemove) && (
                      <div className="relative self-start lg:self-center" ref={actionMenuUserId === member.user_id ? actionMenuRef : null}>
                        <button
                          type="button"
                          onClick={() => setActionMenuUserId((current) => current === member.user_id ? null : member.user_id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                          aria-haspopup="menu"
                          aria-expanded={actionMenuUserId === member.user_id}
                          aria-label={`Действия для ${member.full_name}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                          Действия
                        </button>

                        {actionMenuUserId === member.user_id && (
                          <div className="absolute right-0 top-full z-30 mt-2 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm dark:border-gray-600 dark:bg-gray-800">
                            {canChangeRole && (
                              <>
                                <div className="px-3 py-2 text-xs font-medium text-gray-400 dark:text-gray-500">
                                  Роль участника
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (member.role !== 'member') {
                                      setPendingAction({ type: 'role', member, nextRole: 'member' })
                                    }
                                    setActionMenuUserId(null)
                                  }}
                                  disabled={member.role === 'member' || updatingRoleUserId === member.user_id}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                  <span>Сделать участником</span>
                                  {member.role === 'member' && <span className="text-xs text-gray-400 dark:text-gray-500">Текущая</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (member.role !== 'admin') {
                                      setPendingAction({ type: 'role', member, nextRole: 'admin' })
                                    }
                                    setActionMenuUserId(null)
                                  }}
                                  disabled={member.role === 'admin' || updatingRoleUserId === member.user_id}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                  <span>Сделать администратором</span>
                                  {member.role === 'admin' && <span className="text-xs text-gray-400 dark:text-gray-500">Текущая</span>}
                                </button>
                              </>
                            )}

                            {canTransfer && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingAction({ type: 'transfer', member })
                                  setActionMenuUserId(null)
                                }}
                                disabled={transferringOwnershipUserId === member.user_id}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
                              >
                                <span>Передать ownership</span>
                                {transferringOwnershipUserId === member.user_id && <span className="text-xs text-gray-400 dark:text-gray-500">...</span>}
                              </button>
                            )}

                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingAction({ type: 'remove', member })
                                  setActionMenuUserId(null)
                                }}
                                disabled={removingUserId === member.user_id}
                                className={cn(
                                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                  member.user_id === currentUserId
                                    ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20'
                                    : 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20',
                                )}
                              >
                                <span>{member.user_id === currentUserId ? 'Выйти из группы' : 'Удалить участника'}</span>
                                {removingUserId === member.user_id && <span className="text-xs text-gray-400 dark:text-gray-500">...</span>}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        </section>

        {canTransferOwnership && (
          <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/70 dark:bg-amber-950/20">
            <div>
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Передача ownership</h3>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                После передачи новый owner получит полный контроль над группой, а вы станете admin.
              </p>
            </div>
          </section>
        )}

        {canManageOthers ? (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Добавить участников</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Показываются только пользователи, которых ещё нет в этом чате.</p>
            </div>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск пользователя..."
            />

            {selectedUserIds.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                {users
                  .filter((candidate) => selectedUserIds.includes(candidate.id))
                  .map((selectedUser) => (
                    <button
                      key={selectedUser.id}
                      type="button"
                      onClick={() => handleToggleUser(selectedUser.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      <span className="max-w-40 truncate">{selectedUser.full_name}</span>
                      <span className="text-gray-400 dark:text-gray-300">×</span>
                    </button>
                  ))}
              </div>
            )}

            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
              {availableUsers.map((user) => {
                const selected = selectedUserIds.includes(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleToggleUser(user.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 dark:border-gray-700',
                      selected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{user.full_name}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">@{user.username}</div>
                    </div>
                    {selected && <span className="text-sm font-bold text-primary-500">✓</span>}
                  </button>
                )
              })}
              {availableUsers.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  Нет доступных пользователей
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleClose}>Закрыть</Button>
              <Button onClick={handleAddMembers} isLoading={isAddingMembers} disabled={selectedUserIds.length === 0}>
                Добавить
              </Button>
            </div>
          </section>
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>Закрыть</Button>
          </div>
        )}
        </div>
      </Modal>

      <Modal
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingActionTitle}
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{pendingActionDescription}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingAction(null)}>
              Отмена
            </Button>
            <Button
              variant={pendingAction?.type === 'remove' ? 'danger' : 'primary'}
              onClick={handleConfirmAction}
              isLoading={
                pendingAction?.type === 'remove'
                  ? removingUserId === pendingAction.member.user_id
                  : pendingAction?.type === 'transfer'
                    ? transferringOwnershipUserId === pendingAction.member.user_id
                    : pendingAction?.type === 'role'
                      ? updatingRoleUserId === pendingAction.member.user_id
                      : false
              }
            >
              {pendingActionConfirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function getRoleLabel(role: ConversationMemberRole): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'admin':
      return 'Администратор'
    default:
      return 'Участник'
  }
}


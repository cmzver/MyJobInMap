import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { MessageSquare, Plus, Search, ArrowLeft, MoreVertical, VolumeX, Volume2, Archive, Inbox, Users } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/store/authStore'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import UserAvatar from '@/components/UserAvatar'
import ConversationList from '@/components/chat/ConversationList'
import MessageBubble from '@/components/chat/MessageBubble'
import MessageInput from '@/components/chat/MessageInput'
import NewChatModal from '@/components/chat/NewChatModal'
import ChatSettingsModal from '@/components/chat/ChatSettingsModal'
import {
  useConversations,
  useConversation,
  useMessages,
  useSendMessage,
  useUploadAttachment,
  useUpdateConversation,
  useAddChatMembers,
  useRemoveChatMember,
  useUpdateChatMemberRole,
  useTransferChatOwnership,
  useUploadConversationAvatar,
  useEditMessage,
  useDeleteMessage,
  useToggleReaction,
  useMarkAsRead,
  useCreateConversation,
  useMuteConversation,
  useArchiveConversation,
} from '@/hooks/useChat'
import { sendWsMessage, onChatRead, onChatTyping } from '@/hooks/useWebSocket'
import { chatApi } from '@/api/chat'
import { buildChatTimelineItems } from '@/utils/chatTimeline'
import type { MessageResponse, ConversationType, AttachmentResponse, ConversationMemberRole } from '@/types/chat'
import toast from 'react-hot-toast'

type ConversationScope = 'active' | 'archived'

type MentionCandidate = {
  userId: number
  username: string
  fullName: string
}

export default function ChatPage() {
  const { user } = useAuthStore()
  const currentUserId = user?.id ?? 0

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [debouncedMessageSearchQuery, setDebouncedMessageSearchQuery] = useState('')
  const [searchedMessages, setSearchedMessages] = useState<MessageResponse[]>([])
  const [isSearchingMessages, setIsSearchingMessages] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageResponse | null>(null)
  const [editingMessage, setEditingMessage] = useState<MessageResponse | null>(null)
  const [showConvMenu, setShowConvMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [conversationScope, setConversationScope] = useState<ConversationScope>('active')
  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map())
  const [readReceipts, setReadReceipts] = useState<Map<number, number>>(new Map())
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null)
  const typingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const isTypingRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const { data: conversations = [], isLoading: convLoading } = useConversations(true)
  const { data: activeDetail } = useConversation(activeConversationId)
  const {
    data: messagesData,
    isLoading: msgsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(activeConversationId)

  const sendMessage = useSendMessage()
  const uploadAttachment = useUploadAttachment()
  const updateConversation = useUpdateConversation()
  const addChatMembers = useAddChatMembers()
  const removeChatMember = useRemoveChatMember()
  const updateChatMemberRole = useUpdateChatMemberRole()
  const transferChatOwnership = useTransferChatOwnership()
  const uploadConversationAvatar = useUploadConversationAvatar()
  const editMessage = useEditMessage()
  const deleteMessage = useDeleteMessage()
  const toggleReaction = useToggleReaction()
  const markAsRead = useMarkAsRead()
  const createConversation = useCreateConversation()
  const muteConversation = useMuteConversation()
  const archiveConversation = useArchiveConversation()

  const allMessages = useMemo(() => {
    if (!messagesData?.pages) return []
    const messages: MessageResponse[] = []
    for (const page of messagesData.pages) {
      messages.push(...page.items)
    }
    return messages.sort((a, b) => a.id - b.id)
  }, [messagesData])

  const isMessageSearchActive = debouncedMessageSearchQuery.trim().length > 0

  const displayedMessages = useMemo(() => {
    return isMessageSearchActive ? searchedMessages : allMessages
  }, [allMessages, isMessageSearchActive, searchedMessages])

  const timelineItems = useMemo(() => {
    return buildChatTimelineItems(displayedMessages)
  }, [displayedMessages])

  const imageGalleryAttachments = useMemo(() => {
    return displayedMessages
      .flatMap((message) => message.attachments)
      .filter((attachment) => attachment.mime_type.startsWith('image/'))
      .filter((attachment, index, list) => list.findIndex((item) => item.id === attachment.id) === index)
  }, [displayedMessages])

  const imageGalleryAttachmentMessageIds = useMemo(() => {
    return displayedMessages.reduce<Record<number, number>>((accumulator, message) => {
      message.attachments.forEach((attachment) => {
        if (attachment.mime_type.startsWith('image/')) {
          accumulator[attachment.id] = message.id
        }
      })
      return accumulator
    }, {})
  }, [displayedMessages])

  const handleJumpToMessage = useCallback((messageId: number) => {
    setHighlightedMessageId(messageId)
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`chat-message-${messageId}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  useEffect(() => {
    if (highlightedMessageId == null) return

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === highlightedMessageId ? null : current))
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [highlightedMessageId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayedMessages.length])

  useEffect(() => {
    if (activeConversationId && allMessages.length > 0) {
      const lastMsg = allMessages[allMessages.length - 1]
      if (lastMsg && lastMsg.sender_id !== currentUserId) {
        markAsRead.mutate({
          conversationId: activeConversationId,
          lastMessageId: lastMsg.id,
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, allMessages.length])

  const filteredConversations = useMemo(() => {
    const q = conversationSearchQuery.trim().toLowerCase()
    const scoped = conversations.filter((conversation) => conversationScope === 'archived'
      ? conversation.is_archived
      : !conversation.is_archived)

    const filtered = !q
      ? scoped
      : scoped.filter((c) => {
        const name = (c.display_name ?? c.name ?? '').toLowerCase()
        return name.includes(q)
      })

    return [...filtered].sort((left, right) => {
      if (left.unread_mention_count !== right.unread_mention_count) {
        return right.unread_mention_count - left.unread_mention_count
      }
      if (left.unread_count !== right.unread_count) {
        return right.unread_count - left.unread_count
      }

      const leftTime = left.last_message_at ? Date.parse(left.last_message_at) : 0
      const rightTime = right.last_message_at ? Date.parse(right.last_message_at) : 0
      return rightTime - leftTime
    })
  }, [conversationScope, conversationSearchQuery, conversations])

  useEffect(() => {
    if (activeConversationId == null) return
    const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId)
    if (!activeConversation) return

    const hiddenByScope = conversationScope === 'archived'
      ? !activeConversation.is_archived
      : activeConversation.is_archived

    if (hiddenByScope) {
      setActiveConversationId(null)
      setShowConvMenu(false)
      setShowSettings(false)
    }
  }, [activeConversationId, conversationScope, conversations])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedMessageSearchQuery(messageSearchQuery.trim())
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [messageSearchQuery])

  useEffect(() => {
    setIsMessageSearchOpen(false)
    setMessageSearchQuery('')
    setDebouncedMessageSearchQuery('')
    setSearchedMessages([])
    setReadReceipts(new Map())
  }, [activeConversationId])

  const canOpenSettings = activeDetail?.type === 'group' || activeDetail?.type === 'org_general'

  useEffect(() => {
    if (!activeDetail) return
    const next = new Map<number, number>()
    for (const member of activeDetail.members) {
      if (member.user_id === currentUserId || member.last_read_message_id == null) continue
      next.set(member.user_id, member.last_read_message_id)
    }
    setReadReceipts(next)
  }, [activeDetail, currentUserId])

  useEffect(() => {
    if (!activeConversationId || !debouncedMessageSearchQuery) {
      setIsSearchingMessages(false)
      setSearchedMessages([])
      return
    }

    let cancelled = false
    setIsSearchingMessages(true)

    chatApi.searchMessages(activeConversationId, debouncedMessageSearchQuery)
      .then((messages) => {
        if (cancelled) return
        setSearchedMessages(messages.sort((a, b) => a.id - b.id))
      })
      .catch(() => {
        if (cancelled) return
        setSearchedMessages([])
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearchingMessages(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeConversationId, debouncedMessageSearchQuery])

  useEffect(() => {
    const unsub = onChatTyping((conversationId, userId, isTyping) => {
      if (conversationId !== activeConversationId) return
      setTypingUsers((prev) => {
        const next = new Map(prev)
        if (isTyping) {
          const member = activeDetail?.members.find((m) => m.user_id === userId)
          next.set(userId, member?.full_name ?? member?.username ?? `#${userId}`)
          const old = typingTimeoutsRef.current.get(userId)
          if (old) clearTimeout(old)
          typingTimeoutsRef.current.set(userId, setTimeout(() => {
            setTypingUsers((p) => {
              const n = new Map(p)
              n.delete(userId)
              return n
            })
            typingTimeoutsRef.current.delete(userId)
          }, 4000))
        } else {
          next.delete(userId)
          const old = typingTimeoutsRef.current.get(userId)
          if (old) {
            clearTimeout(old)
            typingTimeoutsRef.current.delete(userId)
          }
        }
        return next
      })
    })

    return () => {
      unsub()
      typingTimeoutsRef.current.forEach(clearTimeout)
      typingTimeoutsRef.current.clear()
      setTypingUsers(new Map())
    }
  }, [activeConversationId, activeDetail])

  useEffect(() => {
    const unsub = onChatRead((conversationId, userId, lastMessageId) => {
      if (conversationId !== activeConversationId || userId === currentUserId) return
      setReadReceipts((prev) => {
        const next = new Map(prev)
        const previous = next.get(userId) ?? 0
        next.set(userId, Math.max(previous, lastMessageId))
        return next
      })
    })

    return () => unsub()
  }, [activeConversationId, currentUserId])

  const handleTyping = useCallback(() => {
    if (!activeConversationId || isTypingRef.current) return
    isTypingRef.current = true
    sendWsMessage({ type: 'chat_typing', conversation_id: activeConversationId, is_typing: true })
    setTimeout(() => {
      isTypingRef.current = false
    }, 3000)
  }, [activeConversationId])

  const typingText = useMemo(() => {
    const names = [...typingUsers.values()]
    if (names.length === 0) return null
    if (names.length === 1) return `${names[0]} печатает...`
    return `${names.slice(0, 2).join(', ')} печатают...`
  }, [typingUsers])

  const handleSend = useCallback((text: string, replyToId?: number) => {
    if (!activeConversationId) return
    sendMessage.mutate(
      { conversationId: activeConversationId, text, replyToId },
      { onError: () => toast.error('Ошибка отправки') },
    )
  }, [activeConversationId, sendMessage])

  const handleEdit = useCallback((messageId: number, text: string) => {
    if (!activeConversationId) return
    editMessage.mutate(
      { messageId, text },
      { onError: () => toast.error('Ошибка редактирования') },
    )
  }, [activeConversationId, editMessage])

  const handleUpload = useCallback((file: File) => {
    if (!activeConversationId) return
    const replyToId = replyTo?.id

    uploadAttachment.mutate(
      { conversationId: activeConversationId, file, replyToId },
      {
        onSuccess: () => {
          setReplyTo(null)
        },
        onError: () => toast.error('Ошибка загрузки файла'),
      },
    )
  }, [activeConversationId, replyTo, uploadAttachment])

  const handleDelete = useCallback((messageId: number) => {
    if (!activeConversationId) return
    deleteMessage.mutate(
      { messageId, conversationId: activeConversationId },
      { onError: () => toast.error('Ошибка удаления') },
    )
  }, [activeConversationId, deleteMessage])

  const handleDownloadAttachment = useCallback(async (attachment: AttachmentResponse) => {
    try {
      const blob = await chatApi.downloadAttachment(attachment.id)
      const blobUrl = window.URL.createObjectURL(blob)

      if (attachment.mime_type.startsWith('image/') || attachment.mime_type === 'application/pdf') {
        window.open(blobUrl, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000)
        return
      }

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = attachment.file_name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5_000)
    } catch {
      toast.error('Ошибка скачивания файла')
    }
  }, [])

  const handleReaction = useCallback((messageId: number, emoji: string) => {
    if (!activeConversationId) return
    toggleReaction.mutate({ messageId, emoji, conversationId: activeConversationId })
  }, [activeConversationId, toggleReaction])

  const handleCreateChat = useCallback((type: ConversationType, name: string, userIds: number[]) => {
    createConversation.mutate(
      { type, name: type === 'group' ? name : undefined, member_user_ids: userIds },
      {
        onSuccess: (conv) => {
          setShowNewChat(false)
          setActiveConversationId(conv.id)
        },
        onError: () => toast.error('Ошибка создания чата'),
      },
    )
  }, [createConversation])

  const handleMute = useCallback(async () => {
    if (!activeConversationId || !activeDetail) return
    const member = activeDetail.members.find((m) => m.user_id === currentUserId)
    muteConversation.mutate(
      { conversationId: activeConversationId, isMuted: !member?.is_muted },
      {
        onSuccess: () => {
          toast.success(member?.is_muted ? 'Уведомления включены' : 'Уведомления отключены')
        },
        onError: () => toast.error('Ошибка изменения уведомлений'),
      },
    )
    setShowConvMenu(false)
  }, [activeConversationId, activeDetail, currentUserId, muteConversation])

  const handleArchive = useCallback(async () => {
    if (!activeConversationId || !activeDetail) return
    const member = activeDetail.members.find((m) => m.user_id === currentUserId)
    const nextArchived = !member?.is_archived

    archiveConversation.mutate(
      { conversationId: activeConversationId, isArchived: nextArchived },
      {
        onSuccess: () => {
          if (nextArchived || conversationScope === 'archived') {
            setActiveConversationId(null)
          }
          toast.success(nextArchived ? 'Чат архивирован' : 'Чат возвращён из архива')
        },
        onError: () => toast.error('Ошибка изменения архива'),
      },
    )
    setShowConvMenu(false)
  }, [activeConversationId, activeDetail, archiveConversation, conversationScope, currentUserId])

  const handleSaveConversationName = useCallback((name: string) => {
    if (!activeConversationId) return
    updateConversation.mutate(
      { conversationId: activeConversationId, name },
      {
        onSuccess: () => toast.success('Название обновлено'),
        onError: () => toast.error('Не удалось обновить название'),
      },
    )
  }, [activeConversationId, updateConversation])

  const handleUploadConversationAvatar = useCallback((file: File) => {
    if (!activeConversationId) return

    uploadConversationAvatar.mutate(
      { conversationId: activeConversationId, file },
      {
        onSuccess: () => toast.success('Аватар чата обновлён'),
        onError: () => toast.error('Не удалось загрузить аватар чата'),
      },
    )
  }, [activeConversationId, uploadConversationAvatar])

  const handleAddMembers = useCallback((userIds: number[]) => {
    if (!activeConversationId) return
    addChatMembers.mutate(
      { conversationId: activeConversationId, userIds },
      {
        onSuccess: () => toast.success('Участники добавлены'),
        onError: () => toast.error('Не удалось добавить участников'),
      },
    )
  }, [activeConversationId, addChatMembers])

  const handleRemoveMember = useCallback((userId: number) => {
    if (!activeConversationId) return
    removeChatMember.mutate(
      { conversationId: activeConversationId, userId },
      {
        onSuccess: () => {
          if (userId === currentUserId) {
            setShowSettings(false)
            setActiveConversationId(null)
            toast.success('Вы вышли из чата')
            return
          }
          toast.success('Участник удалён')
        },
        onError: () => toast.error('Не удалось изменить состав чата'),
      },
    )
  }, [activeConversationId, currentUserId, removeChatMember])

  const handleUpdateMemberRole = useCallback((userId: number, role: Exclude<ConversationMemberRole, 'owner'>) => {
    if (!activeConversationId) return
    updateChatMemberRole.mutate(
      { conversationId: activeConversationId, userId, role },
      {
        onSuccess: () => toast.success('Роль обновлена'),
        onError: () => toast.error('Не удалось обновить роль'),
      },
    )
  }, [activeConversationId, updateChatMemberRole])

  const handleTransferOwnership = useCallback((userId: number) => {
    if (!activeConversationId) return
    transferChatOwnership.mutate(
      { conversationId: activeConversationId, userId },
      {
        onSuccess: () => toast.success('Ownership передан'),
        onError: () => toast.error('Не удалось передать ownership'),
      },
    )
  }, [activeConversationId, transferChatOwnership])

  const handleScroll = useCallback(() => {
    if (isMessageSearchActive) return
    const el = messagesContainerRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    if (el.scrollTop < 100) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isMessageSearchActive])

  const toggleMessageSearch = useCallback(() => {
    setIsMessageSearchOpen((prev) => {
      if (prev) {
        setMessageSearchQuery('')
        setDebouncedMessageSearchQuery('')
        setSearchedMessages([])
      }
      return !prev
    })
  }, [])

  const activeConvName = useMemo(() => {
    if (!activeConversationId) return ''
    const conv = conversations.find((c) => c.id === activeConversationId)
    return conv?.display_name ?? conv?.name ?? `Чат #${activeConversationId}`
  }, [activeConversationId, conversations])

  const headerParticipants = useMemo(() => {
    if (!activeDetail || activeDetail.type === 'direct') {
      return []
    }

    const otherMembers = activeDetail.members.filter((member) => member.user_id !== currentUserId)
    const members = otherMembers.length > 0 ? otherMembers : activeDetail.members

    return [...members].sort((left, right) => left.full_name.localeCompare(right.full_name, 'ru'))
  }, [activeDetail, currentUserId])

  const headerParticipantLabel = useMemo(() => {
    if (headerParticipants.length === 0) {
      return null
    }

    const visibleNames = headerParticipants.slice(0, 3).map((member) => member.full_name)
    const suffix = headerParticipants.length > 3 ? ` +${headerParticipants.length - 3}` : ''
    return `${visibleNames.join(', ')}${suffix}`
  }, [headerParticipants])

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!activeDetail) return []

    return activeDetail.members
      .filter((member) => member.user_id !== currentUserId)
      .map((member) => ({
        userId: member.user_id,
        username: member.username,
        fullName: member.full_name,
      }))
  }, [activeDetail, currentUserId])

  const memberAvatarByUserId = useMemo(() => {
    return (activeDetail?.members ?? []).reduce<Record<number, string | null>>((accumulator, member) => {
      accumulator[member.user_id] = member.avatar_url ?? null
      return accumulator
    }, {})
  }, [activeDetail])

  const memberIsMuted = activeDetail?.members.find((m) => m.user_id === currentUserId)?.is_muted
  const memberIsArchived = activeDetail?.members.find((m) => m.user_id === currentUserId)?.is_archived
  const recipientCount = (activeDetail?.members.filter((m) => m.user_id !== currentUserId).length ?? 0)

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white dark:bg-gray-900">
      <div className={cn(
        'flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
        'w-full md:w-80 lg:w-96 flex-shrink-0',
        activeConversationId ? 'hidden md:flex' : 'flex',
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Чаты</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-primary-500"
            title="Новый чат"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={conversationSearchQuery}
              onChange={(e) => setConversationSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/70">
            <button
              onClick={() => setConversationScope('active')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                conversationScope === 'active'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 dark:text-gray-300',
              )}
            >
              <MessageSquare className="h-4 w-4" />
              Активные
            </button>
            <button
              onClick={() => setConversationScope('archived')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                conversationScope === 'archived'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 dark:text-gray-300',
              )}
            >
              <Archive className="h-4 w-4" />
              Архив
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              activeId={activeConversationId}
              onSelect={setActiveConversationId}
            />
          )}
        </div>
      </div>

      <div className={cn(
        'flex flex-col flex-1 min-w-0',
        !activeConversationId ? 'hidden md:flex' : 'flex',
      )}>
        {activeConversationId ? (
          <>
            <div className="relative z-30 flex items-center gap-2.5 border-b border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => setActiveConversationId(null)}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500" />
              </button>

              <div className="flex-1 min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {activeConvName}
                </h2>
                {headerParticipants.length > 0 && headerParticipantLabel && (
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <div className="flex flex-shrink-0 -space-x-2">
                      {headerParticipants.slice(0, 4).map((member, index) => (
                        <div key={member.user_id} style={{ zIndex: 10 - index }} title={member.full_name}>
                          <UserAvatar
                            fullName={member.full_name}
                            avatarUrl={member.avatar_url}
                            sizeClassName="h-6 w-6"
                            textClassName="text-[10px]"
                            className="border-2 border-white dark:border-gray-800"
                          />
                        </div>
                      ))}
                      {headerParticipants.length > 4 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary-100 text-[10px] font-bold text-primary-700 dark:border-gray-800 dark:bg-primary-900/40 dark:text-primary-200">
                          +{headerParticipants.length - 4}
                        </div>
                      )}
                    </div>
                    <div className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      {headerParticipantLabel}
                    </div>
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {activeDetail && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {activeDetail.members.length} участник(ов)
                    </span>
                  )}
                  {memberIsMuted && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      Без звука
                    </span>
                  )}
                  {memberIsArchived && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      В архиве
                    </span>
                  )}
                  {typingText && (
                    <span className="truncate font-medium text-primary-600 dark:text-primary-300">
                      {typingText}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={toggleMessageSearch}
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  isMessageSearchOpen
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400',
                )}
                title="Поиск по сообщениям"
              >
                <Search className="h-5 w-5" />
              </button>

              <div className="relative z-40">
                <button
                  onClick={() => setShowConvMenu(!showConvMenu)}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MoreVertical className="h-5 w-5 text-gray-500" />
                </button>
                {showConvMenu && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-600 dark:bg-gray-800">
                    <button
                      onClick={handleMute}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {memberIsMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                      {memberIsMuted ? 'Включить звук' : 'Отключить звук'}
                    </button>
                    <button
                      onClick={handleArchive}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {memberIsArchived ? <Inbox className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      {memberIsArchived ? 'Вернуть из архива' : 'Архивировать'}
                    </button>
                    {canOpenSettings && (
                      <button
                        onClick={() => {
                          setShowSettings(true)
                          setShowConvMenu(false)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Users className="h-4 w-4" />
                        Настройки чата
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isMessageSearchOpen && (
              <div className="border-b border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Поиск по сообщениям..."
                    value={messageSearchQuery}
                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                    className="w-full rounded-xl bg-gray-100 py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
            )}

            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 dark:bg-gray-900"
            >
              {!isMessageSearchActive && isFetchingNextPage && (
                <div className="flex justify-center py-2"><Spinner size="sm" /></div>
              )}
              {isSearchingMessages ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : msgsLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : displayedMessages.length === 0 ? (
                <EmptyState
                  icon={isMessageSearchActive ? Search : MessageSquare}
                  title={isMessageSearchActive ? 'Ничего не найдено' : 'Нет сообщений'}
                  description={isMessageSearchActive
                    ? 'Попробуйте изменить поисковый запрос'
                    : 'Начните общение — отправьте первое сообщение'}
                />
              ) : (
                timelineItems.map((item) => {
                  if (item.type === 'date') {
                    return (
                      <div key={item.key} className="my-4 flex items-center gap-3 px-3">
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700">
                          {item.label}
                        </span>
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                      </div>
                    )
                  }

                  const msg = item.message
                  const readCount = [...readReceipts.values()].filter((lastReadMessageId) => lastReadMessageId >= msg.id).length
                  return (
                    <MessageBubble
                      key={item.key}
                      message={msg}
                      galleryAttachments={imageGalleryAttachments}
                      galleryAttachmentMessageIds={imageGalleryAttachmentMessageIds}
                      isHighlighted={highlightedMessageId === msg.id}
                      isOwn={msg.sender_id === currentUserId}
                      senderAvatarUrl={memberAvatarByUserId[msg.sender_id] ?? null}
                      groupedWithPrevious={item.groupedWithPrevious}
                      groupedWithNext={item.groupedWithNext}
                      readCount={readCount}
                      recipientCount={recipientCount}
                      onDownloadAttachment={handleDownloadAttachment}
                      onJumpToMessage={handleJumpToMessage}
                      onReply={setReplyTo}
                      onEdit={setEditingMessage}
                      onDelete={handleDelete}
                      onReaction={handleReaction}
                      currentUserId={currentUserId}
                    />
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {typingText && (
              <div className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                {typingText}
              </div>
            )}

            <MessageInput
              onSend={handleSend}
              onUpload={handleUpload}
              replyTo={replyTo}
              editingMessage={editingMessage}
              mentionCandidates={mentionCandidates}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => setEditingMessage(null)}
              onSaveEdit={handleEdit}
              disabled={sendMessage.isPending || uploadAttachment.isPending}
              onTyping={handleTyping}
            />

            <ChatSettingsModal
              isOpen={showSettings}
              conversation={activeDetail}
              currentUserId={currentUserId}
              isSavingName={updateConversation.isPending}
              isUploadingAvatar={uploadConversationAvatar.isPending}
              isAddingMembers={addChatMembers.isPending}
              removingUserId={removeChatMember.variables?.userId ?? null}
              updatingRoleUserId={updateChatMemberRole.variables?.userId ?? null}
              transferringOwnershipUserId={transferChatOwnership.variables?.userId ?? null}
              onClose={() => setShowSettings(false)}
              onSaveName={handleSaveConversationName}
              onUploadAvatar={handleUploadConversationAvatar}
              onAddMembers={handleAddMembers}
              onRemoveMember={handleRemoveMember}
              onUpdateMemberRole={handleUpdateMemberRole}
              onTransferOwnership={handleTransferOwnership}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Выберите чат"
              description="Выберите существующий чат или создайте новый"
              action={
                <button
                  onClick={() => setShowNewChat(true)}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                  Новый чат
                </button>
              }
            />
          </div>
        )}
      </div>

      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onSubmit={handleCreateChat}
        isLoading={createConversation.isPending}
      />
    </div>
  )
}

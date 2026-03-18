import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { chatApi } from '@/api/chat'
import type { ConversationCreate } from '@/types/chat'

export const chatKeys = {
  all: ['chat'] as const,
  conversationsRoot: () => [...chatKeys.all, 'conversations'] as const,
  conversations: (includeArchived = false) => [...chatKeys.conversationsRoot(), includeArchived] as const,
  conversation: (id: number) => [...chatKeys.all, 'conversation', id] as const,
  messages: (conversationId: number) => [...chatKeys.all, 'messages', conversationId] as const,
}

// ─── Conversations ──────────────────────────────────────────────

export function useConversations(includeArchived = false) {
  return useQuery({
    queryKey: chatKeys.conversations(includeArchived),
    queryFn: () => chatApi.getConversations(includeArchived),
    refetchInterval: 15_000,
  })
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: chatKeys.conversation(id!),
    queryFn: () => chatApi.getConversation(id!),
    enabled: id != null,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ConversationCreate) => chatApi.createConversation(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
    },
  })
}

export function useUpdateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, name, avatarUrl }: { conversationId: number; name?: string; avatarUrl?: string | null }) =>
      chatApi.updateConversation(conversationId, { name, avatar_url: avatarUrl }),
    onSuccess: (conversation) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversation.id) })
    },
  })
}

export function useUploadConversationAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, file }: { conversationId: number; file: File }) =>
      chatApi.uploadConversationAvatar(conversationId, file),
    onSuccess: (conversation) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversation.id) })
    },
  })
}

export function useAddChatMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, userIds }: { conversationId: number; userIds: number[] }) =>
      chatApi.addMembers(conversationId, userIds),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

export function useRemoveChatMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: number; userId: number }) =>
      chatApi.removeMember(conversationId, userId),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

export function useUpdateChatMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, userId, role }: { conversationId: number; userId: number; role: 'admin' | 'member' | 'owner' }) =>
      chatApi.updateMemberRole(conversationId, userId, role),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

export function useTransferChatOwnership() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: number; userId: number }) =>
      chatApi.transferOwnership(conversationId, userId),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

export function useMuteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, isMuted }: { conversationId: number; isMuted: boolean }) =>
      chatApi.muteConversation(conversationId, isMuted),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
    },
  })
}

export function useArchiveConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, isArchived }: { conversationId: number; isArchived: boolean }) =>
      chatApi.archiveConversation(conversationId, isArchived),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

// ─── Messages (infinite scroll) ─────────────────────────────────

export function useMessages(conversationId: number | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId!),
    queryFn: ({ pageParam }) =>
      chatApi.getMessages(conversationId!, pageParam as number | undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more || lastPage.items.length === 0) return undefined
      return lastPage.items[0]?.id
    },
    enabled: conversationId != null,
    refetchInterval: 10_000,
  })
}

// ─── Message Actions ────────────────────────────────────────────

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, text, replyToId, messageType }: {
      conversationId: number
      text?: string | null
      replyToId?: number
      messageType?: 'text' | 'image' | 'file' | 'system'
    }) => chatApi.sendMessage(conversationId, {
      text,
      reply_to_id: replyToId,
      message_type: messageType,
    }),
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(msg.conversation_id) })
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
    },
  })
}

export function useUploadAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversationId, file, replyToId }: {
      conversationId: number
      file: File
      replyToId?: number
    }) => {
      const draft = await chatApi.sendMessage(conversationId, {
        text: null,
        reply_to_id: replyToId,
        message_type: file.type.startsWith('image/') ? 'image' : 'file',
      })

      return chatApi.uploadAttachment(draft.id, file)
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(msg.conversation_id) })
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
    },
  })
}

export function useEditMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: number; text: string }) =>
      chatApi.editMessage(messageId, text),
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(msg.conversation_id) })
    },
  })
}

export function useDeleteMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId }: { messageId: number; conversationId: number }) =>
      chatApi.deleteMessage(messageId),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
    },
  })
}

export function useToggleReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: number; emoji: string; conversationId: number }) =>
      chatApi.toggleReaction(messageId, emoji),
    onSuccess: (_, { conversationId }) => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

export function useMarkAsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, lastMessageId }: { conversationId: number; lastMessageId: number }) =>
      chatApi.markAsRead(conversationId, lastMessageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
    },
  })
}

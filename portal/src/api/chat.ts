import apiClient from './client'
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationCreate,
  ConversationMemberRole,
  MessageResponse,
  MessageListResponse,
  ReactionInfo,
  MessageCreate,
} from '@/types/chat'

export const chatApi = {
  // Conversations
  async getConversations(includeArchived = false): Promise<ConversationListItem[]> {
    const params = includeArchived ? { include_archived: true } : {}
    const { data } = await apiClient.get<ConversationListItem[]>('/chat/conversations', { params })
    return data
  },

  async getConversation(id: number): Promise<ConversationDetail> {
    const { data } = await apiClient.get<ConversationDetail>(`/chat/conversations/${id}`)
    return data
  },

  async createConversation(payload: ConversationCreate): Promise<ConversationDetail> {
    const { data } = await apiClient.post<ConversationDetail>('/chat/conversations', payload)
    return data
  },

  async updateConversation(id: number, payload: { name?: string; avatar_url?: string | null }): Promise<ConversationDetail> {
    const { data } = await apiClient.patch<ConversationDetail>(`/chat/conversations/${id}`, payload)
    return data
  },

  async uploadConversationAvatar(id: number, file: File): Promise<ConversationDetail> {
    const formData = new FormData()
    formData.append('avatar', file)

    const { data } = await apiClient.post<ConversationDetail>(`/chat/conversations/${id}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    return data
  },

  // Members
  async addMembers(conversationId: number, userIds: number[]): Promise<void> {
    await apiClient.post(`/chat/conversations/${conversationId}/members`, { user_ids: userIds })
  },

  async removeMember(conversationId: number, userId: number): Promise<void> {
    await apiClient.delete(`/chat/conversations/${conversationId}/members/${userId}`)
  },

  async updateMemberRole(conversationId: number, userId: number, role: ConversationMemberRole): Promise<void> {
    await apiClient.patch(`/chat/conversations/${conversationId}/members/${userId}`, { role })
  },

  async transferOwnership(conversationId: number, userId: number): Promise<void> {
    await apiClient.post(`/chat/conversations/${conversationId}/transfer-ownership`, { user_id: userId })
  },

  async muteConversation(id: number, isMuted: boolean): Promise<void> {
    await apiClient.patch(`/chat/conversations/${id}/mute`, { is_muted: isMuted })
  },

  async archiveConversation(id: number, isArchived: boolean): Promise<void> {
    await apiClient.patch(`/chat/conversations/${id}/archive`, { is_archived: isArchived })
  },

  // Messages
  async getMessages(conversationId: number, beforeId?: number, limit = 30): Promise<MessageListResponse> {
    const params: Record<string, number> = { limit }
    if (beforeId) params.before_id = beforeId
    const { data } = await apiClient.get<MessageListResponse>(
      `/chat/conversations/${conversationId}/messages`,
      { params },
    )
    return data
  },

  async sendMessage(conversationId: number, payload: MessageCreate): Promise<MessageResponse> {
    const { data } = await apiClient.post<MessageResponse>(
      `/chat/conversations/${conversationId}/messages`,
      payload,
    )
    return data
  },

  async editMessage(messageId: number, text: string): Promise<MessageResponse> {
    const { data } = await apiClient.patch<MessageResponse>(
      `/chat/messages/${messageId}`,
      { text },
    )
    return data
  },

  async deleteMessage(messageId: number): Promise<void> {
    await apiClient.delete(`/chat/messages/${messageId}`)
  },

  // Search
  async searchMessages(conversationId: number, query: string): Promise<MessageResponse[]> {
    const { data } = await apiClient.post<MessageResponse[]>(
      `/chat/conversations/${conversationId}/messages/search`,
      { query },
    )
    return data
  },

  // Reactions
  async toggleReaction(messageId: number, emoji: string): Promise<ReactionInfo[]> {
    const { data } = await apiClient.post<ReactionInfo[]>(
      `/chat/messages/${messageId}/reactions`,
      { emoji },
    )
    return data
  },

  // Read receipts
  async markAsRead(conversationId: number, lastMessageId: number): Promise<void> {
    await apiClient.post(`/chat/conversations/${conversationId}/read`, {
      last_message_id: lastMessageId,
    })
  },

  // Attachments
  async uploadAttachment(messageId: number, file: File): Promise<MessageResponse> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post<MessageResponse>(`/chat/messages/${messageId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async downloadAttachment(attachmentId: number): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`/chat/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    })

    return data instanceof Blob ? data : new Blob([data as unknown as ArrayBuffer])
  },

  async downloadAttachmentThumbnail(attachmentId: number): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`/chat/attachments/${attachmentId}/thumbnail`, {
      responseType: 'blob',
    })

    return data instanceof Blob ? data : new Blob([data as unknown as ArrayBuffer])
  },

  // Task chat shortcut
  async getTaskChat(taskId: number): Promise<ConversationDetail> {
    const { data } = await apiClient.get<ConversationDetail>(`/chat/task/${taskId}`)
    return data
  },
}

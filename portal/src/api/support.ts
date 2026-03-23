import apiClient from '@/api/client'
import type {
  CreateSupportTicketCommentData,
  CreateSupportTicketData,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketComment,
  SupportTicketDetail,
  SupportTicketScope,
  SupportTicketStatus,
  UpdateSupportTicketData,
} from '@/types/support'

export const supportApi = {
  async getTickets(params: {
    scope?: SupportTicketScope
    status?: SupportTicketStatus
    category?: SupportTicketCategory
  } = {}): Promise<SupportTicket[]> {
    const searchParams = new URLSearchParams()

    if (params.scope) searchParams.set('scope', params.scope)
    if (params.status) searchParams.set('status', params.status)
    if (params.category) searchParams.set('category', params.category)

    const query = searchParams.toString()
    const { data } = await apiClient.get<SupportTicket[]>(`/support/tickets${query ? `?${query}` : ''}`)
    return data
  },

  async getTicket(ticketId: number): Promise<SupportTicketDetail> {
    const { data } = await apiClient.get<SupportTicketDetail>(`/support/tickets/${ticketId}`)
    return data
  },

  async createTicket(payload: CreateSupportTicketData): Promise<SupportTicket> {
    const { data } = await apiClient.post<SupportTicket>('/support/tickets', payload)
    return data
  },

  async updateTicket(ticketId: number, payload: UpdateSupportTicketData): Promise<SupportTicket> {
    const { data } = await apiClient.patch<SupportTicket>(`/support/tickets/${ticketId}`, payload)
    return data
  },

  async createComment(ticketId: number, payload: CreateSupportTicketCommentData): Promise<SupportTicketComment> {
    const { data } = await apiClient.post<SupportTicketComment>(`/support/tickets/${ticketId}/comments`, payload)
    return data
  },
}

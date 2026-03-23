import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supportApi } from '@/api/support'
import type {
  CreateSupportTicketCommentData,
  CreateSupportTicketData,
  SupportTicketCategory,
  SupportTicketScope,
  SupportTicketStatus,
  UpdateSupportTicketData,
} from '@/types/support'

export const supportKeys = {
  all: ['support'] as const,
  tickets: () => [...supportKeys.all, 'tickets'] as const,
  list: (params: { scope: SupportTicketScope; status?: SupportTicketStatus; category?: SupportTicketCategory }) =>
    [...supportKeys.tickets(), params] as const,
  detail: (ticketId: number) => [...supportKeys.all, 'detail', ticketId] as const,
}

export function useSupportTickets(params: {
  scope: SupportTicketScope
  status?: SupportTicketStatus
  category?: SupportTicketCategory
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: supportKeys.list(params),
    queryFn: () => supportApi.getTickets(params),
    enabled: options?.enabled ?? true,
  })
}

export function useSupportTicket(ticketId: number) {
  return useQuery({
    queryKey: supportKeys.detail(ticketId),
    queryFn: () => supportApi.getTicket(ticketId),
    enabled: Number.isFinite(ticketId),
  })
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateSupportTicketData) => supportApi.createTicket(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supportKeys.tickets() })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useUpdateSupportTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ticketId, payload }: { ticketId: number; payload: UpdateSupportTicketData }) =>
      supportApi.updateTicket(ticketId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: supportKeys.tickets() })
      queryClient.invalidateQueries({ queryKey: supportKeys.detail(variables.ticketId) })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useCreateSupportComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ticketId, payload }: { ticketId: number; payload: CreateSupportTicketCommentData }) =>
      supportApi.createComment(ticketId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: supportKeys.tickets() })
      queryClient.invalidateQueries({ queryKey: supportKeys.detail(variables.ticketId) })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

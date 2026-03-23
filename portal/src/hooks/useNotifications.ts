import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import apiClient from '@/api/client'

export type NotificationType = 'task' | 'system' | 'alert' | 'support'

export interface Notification {
  id: number
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  created_at: string
  task_id?: number
  support_ticket_id?: number
}

async function getUnreadNotifications() {
  const response = await apiClient.get<Notification[]>('/notifications?is_read=false')
  return response.data
}

export function useUnreadNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadNotifications,
    enabled: options?.enabled ?? true,
  })
}

export function useUnreadSupportNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadNotifications,
    select: (notifications) => notifications.filter((notification) => notification.type === 'support'),
    enabled: options?.enabled ?? true,
  })
}

export function useUnreadTaskNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadNotifications,
    select: (notifications) => notifications.filter((notification) => notification.task_id != null),
    enabled: options?.enabled ?? true,
  })
}

export function useMarkSupportTicketNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ticketId: number) => {
      await apiClient.patch(`/notifications/support-ticket/${ticketId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['support'] })
    },
  })
}

export function useMarkTaskNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: number) => {
      await apiClient.patch(`/notifications/task/${taskId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })
}

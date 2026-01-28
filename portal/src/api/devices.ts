import apiClient from './client'

export interface Device {
  id: number
  user_id: number
  user_name?: string
  device_name?: string
  fcm_token: string
  last_active: string
}

export interface SendTestNotificationPayload {
  title: string
  body: string
  user_ids?: number[]
}

export const devicesApi = {
  list: async (): Promise<Device[]> => {
    const { data } = await apiClient.get<Device[]>('/devices/all')
    return data
  },

  sendTestNotification: async (userId?: number): Promise<{ success: boolean }> => {
    const payload: SendTestNotificationPayload = {
      title: 'Test notification',
      body: 'Push notification check',
      user_ids: userId ? [userId] : undefined,
    }
    const { data } = await apiClient.post<{ success: boolean }>('/notifications/send', payload)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/devices/${id}`)
  },
}

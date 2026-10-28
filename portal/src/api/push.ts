import apiClient from './client'

export interface VapidKeyResponse {
  public_key: string
  enabled: boolean
}

export const pushApi = {
  async getVapidPublicKey(): Promise<VapidKeyResponse> {
    const { data } = await apiClient.get<VapidKeyResponse>('/push/vapid-public-key')
    return data
  },

  async subscribe(subscription: PushSubscriptionJSON): Promise<void> {
    await apiClient.post('/push/subscribe', {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    })
  },

  async unsubscribe(endpoint: string): Promise<void> {
    await apiClient.post('/push/unsubscribe', { endpoint })
  },
}

import axios, { type InternalAxiosRequestConfig } from 'axios'

const apiClient = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json' } })
let refreshPromise: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { useAuthStore } = await import('@/store/authStore')
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) throw new Error('Сессия истекла')
      const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
        '/api/auth/refresh', { refresh_token: refreshToken },
      )
      if (useAuthStore.getState().refreshToken !== refreshToken) throw new Error('Сессия изменена')
      useAuthStore.setState({ token: data.access_token, refreshToken: data.refresh_token })
      return data.access_token
    })().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

apiClient.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('@/store/authStore')
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use((response) => response, async (error) => {
  const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
  if (error.response?.status !== 401 || !config ||
      ['/auth/login', '/auth/refresh'].includes(config.url ?? '')) return Promise.reject(error)
  const { useAuthStore } = await import('@/store/authStore')
  if (config._retried) {
    if (config.headers.Authorization === `Bearer ${useAuthStore.getState().token}`) useAuthStore.getState().logout()
    return Promise.reject(error)
  }
  const originalRefresh = useAuthStore.getState().refreshToken
  const latestToken = useAuthStore.getState().token
  config._retried = true
  try {
    const token = latestToken && config.headers.Authorization !== `Bearer ${latestToken}`
      ? latestToken : await refreshAccessToken()
    config.headers.Authorization = `Bearer ${token}`
    return apiClient(config)
  } catch (refreshError) {
    const invalidRefresh = axios.isAxiosError(refreshError) && refreshError.response?.status === 401
    if ((!originalRefresh || invalidRefresh) && useAuthStore.getState().refreshToken === originalRefresh) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(refreshError)
  }
})

export default apiClient

import axios, { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../client'

let auth: typeof import('@/store/authStore')['useAuthStore']

beforeAll(async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  auth = (await import('@/store/authStore')).useAuthStore
})

beforeEach(() => {
  vi.restoreAllMocks()
  auth.setState({ token: 'expired', refreshToken: 'refresh-1', isAuthenticated: true })
})

const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse =>
  ({ config, data, status, statusText: '', headers: new AxiosHeaders() })

describe('session refresh', () => {
  it('shares one rotating refresh across parallel 401s and retries both requests', async () => {
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'fresh', refresh_token: 'refresh-2' } })
    apiClient.defaults.adapter = async (config) => {
      if (config.headers.Authorization === 'Bearer expired') {
        throw new AxiosError('expired', 'ERR_BAD_REQUEST', config, undefined, response(config, {}, 401))
      }
      return response(config, { ok: true })
    }
    const results = await Promise.all([apiClient.get('/tasks'), apiClient.get('/notifications')])
    expect(results.every((result) => result.data.ok)).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(auth.getState().refreshToken).toBe('refresh-2')
  })

  it('keeps the session when refresh fails because of the network', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('offline', 'ERR_NETWORK'))
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError('expired', 'ERR_BAD_REQUEST', config, undefined, response(config, {}, 401))
    }
    await expect(apiClient.get('/tasks')).rejects.toThrow('offline')
    expect(auth.getState().isAuthenticated).toBe(true)
    expect(auth.getState().refreshToken).toBe('refresh-1')
  })

  it('preserves spaces in the password sent to login', async () => {
    let body = ''
    apiClient.defaults.adapter = async (config) => {
      body = String(config.data)
      return response(config, { access_token: 'token', refresh_token: 'refresh', user_id: 1, username: 'user', role: 'worker' })
    }
    await auth.getState().login(' user ', ' password ')
    expect(new URLSearchParams(body).get('username')).toBe('user')
    expect(new URLSearchParams(body).get('password')).toBe(' password ')
  })
})

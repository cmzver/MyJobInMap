// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/api/client', () => ({ refreshAccessToken: vi.fn() }))

import { refreshAccessToken } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { useWebSocket } from '../useWebSocket'

class FakeSocket {
  static OPEN = 1
  static all: FakeSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeSocket.all.push(this)
  }
  send() {}
  close() {
    queueMicrotask(() => this.onclose?.())
  }
}

const tokens = () => FakeSocket.all.map((s) => new URL(s.url).searchParams.get('token'))

function render() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useWebSocket(), { wrapper })
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.all = []
  vi.stubGlobal('WebSocket', FakeSocket)
  useAuthStore.setState({ token: 'old', refreshToken: 'r1', isAuthenticated: true, user: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.mocked(refreshAccessToken).mockReset()
})

describe('useWebSocket: реконнект после отказа', () => {
  it('отвергнутое рукопожатие → обновление токена → соединение со свежим токеном', async () => {
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      useAuthStore.setState({ token: 'fresh', refreshToken: 'r2' })
      return 'fresh'
    })
    render()
    expect(tokens()).toEqual(['old'])

    act(() => FakeSocket.all[0]?.onclose?.()) // 403 до accept: onopen не было
    await act(() => vi.advanceTimersByTimeAsync(3000))

    expect(refreshAccessToken).toHaveBeenCalledOnce()
    expect(tokens()).toEqual(['old', 'fresh'])
  })

  it('обрыв открытого сокета — обычный реконнект без обновления токена', async () => {
    render()
    act(() => {
      FakeSocket.all[0]?.onopen?.()
      FakeSocket.all[0]?.onclose?.()
    })
    await act(() => vi.advanceTimersByTimeAsync(3000))

    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(tokens()).toEqual(['old', 'old'])
  })

  it('смена токена: закрытый эффектом сокет не планирует реконнект со старым токеном', async () => {
    render()
    act(() => FakeSocket.all[0]?.onopen?.())

    act(() => useAuthStore.setState({ token: 'fresh' }))
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(tokens()).toEqual(['old', 'fresh'])
  })
})

// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTER_FUTURE } from '@/config/routerFuture'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import CalendarPage from '../CalendarPage'

const fetchAllTaskPages = vi.fn()

vi.mock('@/api/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/api/tasks')>('@/api/tasks')
  return { ...actual, fetchAllTaskPages: (...args: unknown[]) => fetchAllTaskPages(...args) }
})

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1, username: 'disp', fullName: 'Диспетчер', role: 'dispatcher', baseAccess: 'dispatcher', organizationId: 1 },
    token: 't',
    isAuthenticated: true,
  } as never)
  vi.spyOn(usersApi, 'getActiveUsers').mockResolvedValue([])
  fetchAllTaskPages.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

describe('CalendarPage', () => {
  it('перечитывает месяц по событию заявок (инвалидация префикса tasks)', async () => {
    fetchAllTaskPages.mockResolvedValue([])
    const client = renderPage()
    await screen.findByText('На этот день заявок нет')
    expect(fetchAllTaskPages).toHaveBeenCalledTimes(1)

    // Так делает useWebSocket на task_created / task_updated / task_status_changed
    await act(() => client.invalidateQueries({ queryKey: ['tasks'] }))
    await waitFor(() => expect(fetchAllTaskPages).toHaveBeenCalledTimes(2))
  })

  it('сбой загрузки не выдаётся за пустой день', async () => {
    fetchAllTaskPages.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('На этот день заявок нет')).toBeNull()
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeTruthy()
  })
})

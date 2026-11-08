// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { financeApi } from '@/api/finance'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import FinancePage from '../FinancePage'

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1, username: 'admin', fullName: 'Админ', role: 'admin', baseAccess: 'admin', organizationId: 1 },
    token: 't',
    isAuthenticated: true,
  } as never)
  vi.spyOn(usersApi, 'getUsers').mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <FinancePage />
    </QueryClientProvider>,
  )
}

describe('FinancePage', () => {
  it('сбой загрузки — ошибка вместо нулей', async () => {
    vi.spyOn(financeApi, 'getStats').mockRejectedValue(new Error('boom'))
    vi.spyOn(financeApi, 'getWorkerStats').mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('Не удалось загрузить статистику')).toBeTruthy()
    expect(screen.queryByText('Выполнено заявок')).toBeNull()
    expect(screen.queryByText('0 ₽')).toBeNull()
  })
})

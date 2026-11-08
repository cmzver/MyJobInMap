// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import apiClient from '@/api/client'
import { ROUTER_FUTURE } from '@/config/routerFuture'
import NotificationsPage from '../NotificationsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NotificationsPage', () => {
  it('сбой загрузки — ошибка, а не «У вас пока нет уведомлений»', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('boom'))
    renderPage()

    expect(await screen.findByText('Не удалось загрузить уведомления')).toBeTruthy()
    expect(screen.queryByText('У вас пока нет уведомлений')).toBeNull()
    expect(screen.queryByText('Все прочитано')).toBeNull()
  })

  it('пустой список — пустое состояние', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] })
    renderPage()

    expect(await screen.findByText('У вас пока нет уведомлений')).toBeTruthy()
    expect(screen.getByText('Все прочитано')).toBeTruthy()
  })
})

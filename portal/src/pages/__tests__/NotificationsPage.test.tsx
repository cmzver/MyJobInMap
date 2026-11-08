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

  it('ссылка на заявку — по номеру, а без номера — без внутреннего id', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [
        { id: 1, title: 'Назначена', message: 'a', type: 'task', is_read: false, created_at: '2026-11-08T10:00:00Z', task_id: 42, task_number: '1190557' },
        { id: 2, title: 'Изменена', message: 'b', type: 'task', is_read: true, created_at: '2026-11-08T09:00:00Z', task_id: 43 },
      ],
    })
    renderPage()

    const numbered = await screen.findByRole('link', { name: 'Открыть заявку №1190557' })
    expect(numbered.getAttribute('href')).toBe('/tasks/42')
    const plain = screen.getByRole('link', { name: 'Открыть заявку' })
    expect(plain.getAttribute('href')).toBe('/tasks/43')
    expect(screen.queryByText(/#43/)).toBeNull()
  })

  it('пустой список — пустое состояние', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] })
    renderPage()

    expect(await screen.findByText('У вас пока нет уведомлений')).toBeTruthy()
    expect(screen.getByText('Все прочитано')).toBeTruthy()
  })
})

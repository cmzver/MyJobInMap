// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { updatesApi } from '@/api/updates'
import { ROUTER_FUTURE } from '@/config/routerFuture'
import { UpdatesManagementSection } from '../UpdatesPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('UpdatesManagementSection', () => {
  it('сбой загрузки — ошибка, а не «Нет загруженных обновлений»', async () => {
    vi.spyOn(updatesApi, 'history').mockRejectedValue(new Error('boom'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={ROUTER_FUTURE}>
          <UpdatesManagementSection embedded />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Не удалось загрузить обновления')).toBeTruthy()
    expect(screen.queryByText('Нет загруженных обновлений')).toBeNull()
  })
})

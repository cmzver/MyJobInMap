// @vitest-environment jsdom
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import apiClient from '@/api/client'
import PublicTaskPage from '../PublicTaskPage'
import { ROUTER_FUTURE } from '@/config/routerFuture'

const task = {
  number: 'Z-00042',
  title: 'Не работает трубка',
  address: 'ул. Невская, д. 9',
  status: 'IN_PROGRESS',
  status_label: 'В работе',
  created_at: '2026-11-03T10:00:00Z',
  planned_date: '2026-11-07T09:00:00Z',
  completed_at: null,
  events: [
    { at: '2026-11-03T10:00:00Z', text: 'Заявка принята' },
    { at: '2026-11-04T08:00:00Z', text: 'В работе' },
  ],
  acts: [],
  organization: 'Техно-Демо',
  organization_phone: '+7 812 555-12-12',
  telegram_url: 'https://t.me/fw_bot?start=token',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/t/abcdefghijklmnopqrstuvwx']}>
        <Routes>
          <Route path="/t/:token" element={<PublicTaskPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('public task status page', () => {
  it('shows status, planned date and the Telegram subscription', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: task })
    renderPage()
    expect(await screen.findByText('Не работает трубка')).toBeTruthy()
    expect(get).toHaveBeenCalledWith('/public/tasks/abcdefghijklmnopqrstuvwx')
    expect(screen.getByText('Мастер приедет')).toBeTruthy()
    const telegram = screen.getByRole('link', { name: /Уведомлять в Telegram/ })
    expect(telegram.getAttribute('href')).toBe(task.telegram_url)
  })

  it('hides the subscription once the task is done', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { ...task, status: 'DONE', status_label: 'Выполнена', completed_at: '2026-11-07T12:00:00Z' },
    })
    renderPage()
    expect(await screen.findAllByText('Выполнена')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Уведомлять в Telegram/ })).toBeNull()
    expect(screen.queryByText('Мастер приедет')).toBeNull()
  })

  it('explains a dead link', async () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
    vi.spyOn(apiClient, 'get').mockRejectedValue(new AxiosError('404', 'ERR_BAD_REQUEST', config))
    renderPage()
    expect(await screen.findByText('Ссылка не работает')).toBeTruthy()
  })
})

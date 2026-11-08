// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addressesApi } from '@/api/addresses'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types/user'
import AddressAssigneesSection from '../AddressAssigneesSection'

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1, username: 'disp', fullName: 'Диспетчер', role: 'dispatcher', baseAccess: 'dispatcher', organizationId: 1 },
    token: 't',
    isAuthenticated: true,
  } as never)
  vi.spyOn(usersApi, 'getActiveUsers').mockResolvedValue([
    { id: 2, username: 'ivanov', full_name: 'Иванов', is_active: true } as unknown as User,
    { id: 3, username: 'petrov', full_name: 'Петров (уволен)', is_active: false } as unknown as User,
  ])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AddressAssigneesSection addressId={5} />
    </QueryClientProvider>,
  )
}

describe('AddressAssigneesSection', () => {
  it('сбой загрузки — не «Никто не назначен»', async () => {
    vi.spyOn(addressesApi, 'getAssignees').mockRejectedValue(new Error('boom'))
    renderSection()

    expect(await screen.findByText(/Не удалось загрузить список/)).toBeTruthy()
    expect(screen.queryByText('Никто не назначен')).toBeNull()
  })

  it('неактивных сотрудников назначить нельзя', async () => {
    vi.spyOn(addressesApi, 'getAssignees').mockResolvedValue([])
    renderSection()
    await screen.findByText('Никто не назначен')

    fireEvent.click(screen.getByRole('button', { name: 'Назначить сотрудника' }))
    expect(await screen.findByText('Иванов')).toBeTruthy()
    expect(screen.queryByText('Петров (уволен)')).toBeNull()
  })
})

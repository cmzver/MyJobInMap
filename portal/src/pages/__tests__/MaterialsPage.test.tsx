// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { materialsApi } from '@/api/materials'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types/user'
import MaterialsPage from '../MaterialsPage'

const material = {
  id: 5,
  name: 'Трубка УКП-12М',
  unit: 'шт.',
  unit_cost: '350.00',
  min_quantity: '5',
  active: true,
  warehouse_quantity: '3',
}

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1, username: 'disp', fullName: 'Диспетчер', role: 'dispatcher', baseAccess: 'dispatcher', organizationId: 1 },
    token: 't',
    isAuthenticated: true,
  } as never)
  vi.spyOn(materialsApi, 'list').mockResolvedValue([material])
  vi.spyOn(materialsApi, 'balances').mockResolvedValue([
    {
      material_id: 5,
      name: material.name,
      unit: material.unit,
      unit_cost: '350.00',
      active: true,
      warehouse_quantity: '3',
      min_quantity: '5',
      low: true,
      holders: [{ user_id: 9, name: 'Петров', quantity: '-1' }],
      total_quantity: '2',
      total_cost: '700.00',
    },
  ])
  vi.spyOn(usersApi, 'getActiveUsers').mockResolvedValue([
    { id: 9, username: 'petrov', full_name: 'Петров', is_active: true } as unknown as User,
  ])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MaterialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('materials page', () => {
  it('highlights low stock and shortage on the balances tab', async () => {
    renderPage()
    expect(await screen.findByText('Пора закупать: 1')).toBeTruthy()
    expect(screen.getByTitle('Недостача: списано больше, чем было выдано').textContent).toContain('−1')
  })

  it('issues material to a worker with a one-time operation key', async () => {
    const operate = vi.spyOn(materialsApi, 'operate').mockResolvedValue({} as never)
    renderPage()
    await screen.findByText('Пора закупать: 1')
    await userEvent.click(screen.getByRole('button', { name: /Операция/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Материал'), '5')
    await userEvent.selectOptions(await within(dialog).findByLabelText('Исполнитель'), '9')
    await userEvent.type(within(dialog).getByLabelText('Количество'), '2,5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Провести' }))

    expect(operate).toHaveBeenCalledTimes(1)
    const payload = operate.mock.calls[0]![0]
    expect(payload).toMatchObject({ kind: 'issue', material_id: 5, user_id: 9, quantity: '2.5' })
    expect(payload.operation_id).toMatch(/[0-9a-f-]{36}/)
  })
})

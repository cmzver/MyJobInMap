// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTER_FUTURE } from '@/config/routerFuture'
import TaskFormPage from '../TaskFormPage'

const updateMutate = vi.fn()

const paidTask = {
  id: 42,
  task_number: 'З-42',
  title: 'Ленина 1',
  raw_address: 'Москва, ул. Ленина, д. 1',
  description: 'Не открывается дверь',
  customer_name: '',
  customer_phone: '',
  priority: 'CURRENT',
  assigned_user_id: null,
  planned_date: null,
  system_id: null,
  system_type: null,
  defect_type: null,
  is_paid: true,
  payment_amount: 1500,
}

vi.mock('@/hooks/useTasks', () => ({
  useTask: () => ({ data: paidTask, isLoading: false }),
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTask: () => ({ mutate: updateMutate, isPending: false }),
  useAssignTask: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useSettings', () => ({ usePortalInterfaceSettings: () => ({ data: undefined }) }))
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/api/addresses', () => ({ addressesApi: { findByComponents: vi.fn(async () => null) } }))
vi.mock('@/components/AddressForm', () => ({ default: () => null }))
vi.mock('@/components/SystemSelector', () => ({ default: () => null }))
vi.mock('@/components/DefectTypeSelector', () => ({ default: () => null }))
vi.mock('@/components/tasks/RelatedTasksHint', () => ({ default: () => null }))
vi.mock('@/components/addresses/AddressCreateModal', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaskFormPage — редактирование', () => {
  it('не обнуляет оплату, которой нет в форме', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/42/edit']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/tasks/:id/edit" element={<TaskFormPage mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }))

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const [{ id, data }] = updateMutate.mock.calls[0] as [{ id: number; data: Record<string, unknown> }]
    expect(id).toBe(42)
    expect(data.description).toBe('Не открывается дверь')
    expect(data).not.toHaveProperty('is_paid')
    expect(data).not.toHaveProperty('payment_amount')
  })
})

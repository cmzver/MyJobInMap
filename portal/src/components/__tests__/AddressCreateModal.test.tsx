// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AddressCreateModal from '../addresses/AddressCreateModal'
import { addressesApi } from '@/api/addresses'

const mutate = vi.fn()

vi.mock('@/api/addresses', () => ({
  addressesApi: {
    composeAddress: vi.fn(async () => ({ address: 'Санкт-Петербург, пр-кт Ветеранов, д. 46' })),
    parseAddress: vi.fn(),
    suggestAddress: vi.fn(async () => []),
    getAddresses: vi.fn(async () => ({ items: [] })),
    autocompleteCities: vi.fn(async () => []),
    autocompleteStreets: vi.fn(async () => []),
    autocompleteBuildings: vi.fn(async () => []),
  },
}))
vi.mock('@/hooks/useAddresses', () => ({
  useCreateAddress: () => ({ mutate, isPending: false }),
}))
vi.mock('@/hooks/useCounterparties', () => ({
  useCounterparties: () => ({ data: [] }),
}))

describe('AddressCreateModal из формы заявки', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('собирает строку дома из частей и сохраняет один дом без «и следующий»', async () => {
    render(
      <MemoryRouter>
        <AddressCreateModal
          isOpen
          onClose={vi.fn()}
          initial={{ city: 'Санкт-Петербург', street: 'пр-кт Ветеранов', building: '46', corpus: '' }}
          allowBatch={false}
        />
      </MemoryRouter>,
    )

    const input = screen.getByRole('combobox', { name: 'Полный адрес *' }) as HTMLInputElement
    await vi.waitFor(() => expect(input.value).toBe('Санкт-Петербург, пр-кт Ветеранов, д. 46'))
    expect(addressesApi.composeAddress).toHaveBeenCalledWith({
      city: 'Санкт-Петербург',
      street: 'пр-кт Ветеранов',
      building: '46',
      corpus: '',
    })
    // Собранную строку не разбираем обратно
    expect(addressesApi.parseAddress).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Добавить и следующий' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'Санкт-Петербург, пр-кт Ветеранов, д. 46',
        street: 'пр-кт Ветеранов',
        building: '46',
        entrance: undefined,
      }),
      expect.anything(),
    )
  })
})

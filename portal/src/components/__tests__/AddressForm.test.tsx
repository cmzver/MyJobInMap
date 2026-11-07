// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AddressForm from '../AddressForm'
import { addressesApi } from '@/api/addresses'

vi.mock('@/api/addresses', () => ({
  addressesApi: {
    suggestAddress: vi.fn(),
    parseAddress: vi.fn(),
    autocompleteCities: vi.fn(async () => []),
    autocompleteStreets: vi.fn(async () => []),
  },
}))

const empty = { city: '', street: '', building: '', corpus: '', entrance: '4', apartment: '99' }

describe('AddressForm (заявка)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('finds the house without entrance/apartment and fills them from the phrase', async () => {
    vi.mocked(addressesApi.suggestAddress).mockResolvedValue([
      {
        value: 'г Санкт-Петербург, пр-кт Ветеранов, д 46',
        unrestricted_value: '',
        city: 'Санкт-Петербург',
        street: 'пр-кт Ветеранов',
        building: '46',
        corpus: '',
        lat: null,
        lon: null,
        source: 'dadata',
        address_id: null,
      },
    ])
    const onChange = vi.fn()
    render(
      <MemoryRouter>
        <AddressForm value={empty} onChange={onChange} />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Найти адрес' }), {
      target: { value: 'ветеранов 46 под 2 кв 15' },
    })
    const option = await screen.findByRole('option', { name: /Ветеранов/ }, { timeout: 2000 })
    fireEvent.mouseDown(option)
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())

    expect(addressesApi.suggestAddress).toHaveBeenCalledWith('ветеранов 46')
    // Подъезд 4 и квартира 99 прошлого адреса заменены значениями из фразы
    expect(onChange).toHaveBeenLastCalledWith({
      city: 'Санкт-Петербург',
      street: 'пр-кт Ветеранов',
      building: '46',
      corpus: '',
      entrance: '2',
      apartment: '15',
    })
  })

  it('offers entrance buttons for a known object', () => {
    const onChange = vi.fn()
    render(
      <MemoryRouter>
        <AddressForm
          value={{ ...empty, city: 'СПб', street: 'Невская ул.', building: '9', entrance: '' }}
          onChange={onChange}
          matched={{ id: 7, address: 'ул. Невская, д. 9', entrance_count: 3, floor_count: 5, intercom_code: '12#3' }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText(/код домофона: 12#3/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '3' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ entrance: '3' }))
  })
})

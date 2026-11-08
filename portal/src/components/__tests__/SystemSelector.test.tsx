// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { addressesApi } from '@/api/addresses'
import type { AddressSystem } from '@/types/address'
import SystemSelector from '../SystemSelector'

const system = (id: number, name: string) =>
  ({ id, name, system_type: 'intercom', status: 'active' }) as unknown as AddressSystem

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SystemSelector', () => {
  it('поздний ответ по прежнему дому не подменяет системы нового', async () => {
    let resolveFirst: (value: AddressSystem[]) => void = () => undefined
    vi.spyOn(addressesApi, 'getSystems').mockImplementation((buildingId: number) =>
      buildingId === 1
        ? new Promise<AddressSystem[]>((resolve) => {
            resolveFirst = resolve
          })
        : Promise.resolve([system(20, 'Домофон дома 2')]),
    )
    const onChange = vi.fn()
    const { rerender } = render(<SystemSelector buildingId={1} buildingAddress="Дом 1" value="" onChange={onChange} />)
    rerender(<SystemSelector buildingId={2} buildingAddress="Дом 2" value="" onChange={onChange} />)
    fireEvent.click(await screen.findByRole('button', { name: /Выберите систему/ }))
    expect(screen.getByText('Домофон дома 2')).toBeTruthy()

    await act(async () => resolveFirst([system(10, 'Домофон дома 1')]))
    expect(screen.queryByText('Домофон дома 1')).toBeNull()
    expect(screen.getByText('Домофон дома 2')).toBeTruthy()
  })
})

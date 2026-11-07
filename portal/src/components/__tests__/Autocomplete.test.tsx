// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Autocomplete } from '../Autocomplete'

type Item = { value: string; city: string; source: string }

const items: Item[] = [
  { value: 'пр-кт Ветеранов, д. 46, СПб', city: 'Санкт-Петербург', source: 'dadata' },
  { value: 'ул. Ленина, 10', city: 'Санкт-Петербург', source: 'base' },
]

function Harness({ onSelect }: { onSelect: (item: Item) => void }) {
  const [value, setValue] = useState('')
  return (
    <Autocomplete<Item>
      id="addr"
      label="Полный адрес"
      value={value}
      onChange={setValue}
      fetchSuggestions={async () => items}
      getLabel={(item) => item.value}
      getHint={(item) => (item.source === 'base' ? 'уже есть в базе' : undefined)}
      onSelect={onSelect}
      debounceMs={0}
      minChars={3}
    />
  )
}

describe('Autocomplete', () => {
  afterEach(cleanup)

  it('shows object suggestions with hints and hands the picked item to onSelect', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ветеранов' } })

    expect(await screen.findByRole('option', { name: /Ветеранов/ })).toBeTruthy()
    expect(screen.getByText('уже есть в базе')).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('option', { name: /Ветеранов/ }))

    expect(onSelect).toHaveBeenCalledWith(items[0])
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('picks with arrows + Enter and closes the list on Escape without bubbling', async () => {
    const onSelect = vi.fn()
    const documentKeydown = vi.fn()
    document.addEventListener('keydown', documentKeydown)
    render(<Harness onSelect={onSelect} />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'ленина' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(documentKeydown).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'ленина 1' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(items[1])
    document.removeEventListener('keydown', documentKeydown)
  })
})

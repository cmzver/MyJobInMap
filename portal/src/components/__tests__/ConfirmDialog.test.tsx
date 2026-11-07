// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmProvider } from '../ConfirmDialog'
import Modal from '../Modal'
import { useConfirm } from '@/hooks/useConfirm'

function DeleteButton({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button
      type="button"
      onClick={async () => onResult(await confirm({ title: 'Удалить фото?', message: 'Без возврата', danger: true }))}
    >
      Удалить фото
    </button>
  )
}

describe('useConfirm', () => {
  afterEach(cleanup)

  it('resolves true on confirm and false on cancel', async () => {
    const onResult = vi.fn()
    render(
      <ConfirmProvider>
        <DeleteButton onResult={onResult} />
      </ConfirmProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }))
    expect(screen.getByRole('dialog', { name: 'Удалить фото?' })).toBeTruthy()
    expect(screen.getByText('Без возврата')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Удалить' })))
    expect(onResult).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Отмена' })))
    expect(onResult).toHaveBeenLastCalledWith(false)
  })

  it('Escape closes only the confirmation, not the window under it', async () => {
    const onResult = vi.fn()
    function Outer() {
      const [open, setOpen] = useState(true)
      return (
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Ссылка на статус">
          <DeleteButton onResult={onResult} />
        </Modal>
      )
    }
    render(
      <ConfirmProvider>
        <Outer />
      </ConfirmProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }))
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }))

    expect(onResult).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('dialog', { name: 'Удалить фото?' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Ссылка на статус' })).toBeTruthy()
  })
})

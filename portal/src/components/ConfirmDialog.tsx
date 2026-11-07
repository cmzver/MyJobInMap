import { useCallback, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import { ConfirmContext, type Confirm, type ConfirmOptions } from '@/hooks/useConfirm'

/** Окно подтверждения для useConfirm() — один экземпляр на всё приложение. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    // Новое подтверждение поверх незакрытого — прежнее считаем отменённым
    resolveRef.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const close = (result: boolean) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal isOpen={options !== null} onClose={() => close(false)} title={options?.title ?? ''} size="sm">
        {options?.message && (
          <div className="whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{options.message}</div>
        )}
        <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${options?.message ? 'mt-5' : ''}`}>
          <Button type="button" variant="secondary" onClick={() => close(false)}>
            {options?.cancelText ?? 'Отмена'}
          </Button>
          <Button
            type="button"
            variant={options?.danger ? 'danger' : 'primary'}
            onClick={() => close(true)}
          >
            {options?.confirmText ?? (options?.danger ? 'Удалить' : 'Подтвердить')}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

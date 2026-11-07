import { createContext, useContext } from 'react'

/**
 * Подтверждение действия в стиле портала вместо системного confirm():
 * тот на тёмной теме — белое окно браузера с адресом сайта в заголовке.
 * Окно рисует ConfirmProvider (components/ConfirmDialog).
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Удалить фото?', danger: true }))) return
 */

export interface ConfirmOptions {
  title: string
  message?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** Необратимое действие — красная кнопка */
  danger?: boolean
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | null>(null)

/** Без провайдера (изолированные тесты компонентов) — системный confirm. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  return (
    confirm ??
    ((options) =>
      Promise.resolve(
        window.confirm(
          [options.title, typeof options.message === 'string' ? options.message : ''].filter(Boolean).join('\n\n'),
        ),
      ))
  )
}

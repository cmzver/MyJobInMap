import type { Act, ActStatus } from '@/api/acts'

export const ACT_STATUS: Record<ActStatus, { label: string; variant: 'warning' | 'success' | 'danger' | 'gray' }> = {
  pending_signature: { label: 'Ждёт подписи', variant: 'warning' },
  signed: { label: 'Подписан', variant: 'success' },
  refused: { label: 'Отказ от подписи', variant: 'danger' },
  cancelled: { label: 'Аннулирован', variant: 'gray' },
}

export const CUSTOMER_ROLE_OPTIONS = [
  { value: 'resident', label: 'Жилец' },
  { value: 'chairman', label: 'Председатель' },
  { value: 'uk_rep', label: 'Представитель УК' },
  { value: 'other', label: 'Другое' },
]

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'none', label: 'Без оплаты' },
  { value: 'cash', label: 'Наличными' },
  { value: 'card', label: 'Картой' },
  { value: 'transfer', label: 'Переводом' },
  { value: 'contract', label: 'По договору' },
]

export const LINE_TYPE_OPTIONS = [
  { value: 'work', label: 'Работа' },
  { value: 'material', label: 'Материал' },
]

const rub = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** «1 500,00 ₽» */
export function formatRub(value: number): string {
  return `${rub.format(value)} ₽`
}

/** Активна ли выданная клиенту ссылка (сама ссылка показывается один раз). */
export function hasActiveLink(act: Act): boolean {
  return !!act.public_link_expires_at && new Date(act.public_link_expires_at).getTime() > Date.now()
}

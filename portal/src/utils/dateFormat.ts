/**
 * Утилиты форматирования дат и SLA-расчётов.
 *
 * Заменяет ≈ 8 дублированных `formatDate` и 2 `getSla` по всему порталу.
 */

import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

/** Полный формат: «25.01.2026 14:30» */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy HH:mm', { locale: ru })
  } catch {
    return dateStr ?? '—'
  }
}

/** Только дата: «25.01.2026» */
export function formatDateOnly(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy', { locale: ru })
  } catch {
    return dateStr ?? '—'
  }
}

/** Красивый формат: «25 янв 2026, 14:30» */
export function formatDatePretty(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'd MMM yyyy, HH:mm', { locale: ru })
  } catch {
    return dateStr ?? '—'
  }
}

/** Относительное время: «3 часа назад» */
export function formatDateRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = parseISO(dateStr)
    return formatDistanceToNow(date, { addSuffix: true, locale: ru })
  } catch {
    return dateStr ?? '—'
  }
}

/** Короткий день недели: «Пн» */
export function formatWeekday(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE', { locale: ru })
  } catch {
    return dateStr
  }
}

/** Краткая дата: «25 янв» */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'd MMM', { locale: ru })
  } catch {
    return dateStr ?? '—'
  }
}


// ============================================================================
// SLA
// ============================================================================

type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'

export interface SlaResult {
  label: string
  tone: string
}

/**
 * Рассчитать SLA-статус заявки.
 *
 * @returns label — текст вроде «Осталось 2д 5ч» и tone — CSS-класс цвета.
 */
export function getSla(
  plannedDate?: string | null,
  status?: TaskStatus | string,
): SlaResult {
  if (!plannedDate) {
    return { label: 'Нет срока', tone: 'text-gray-500 dark:text-gray-400' }
  }
  if (status === 'DONE' || status === 'CANCELLED') {
    return { label: 'Закрыта', tone: 'text-gray-500 dark:text-gray-400' }
  }

  const deadline = new Date(plannedDate).getTime()
  const now = Date.now()
  const diffMs = deadline - now
  const diffHours = Math.round(Math.abs(diffMs) / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  const hoursRemainder = diffHours % 24

  const label =
    diffMs < 0
      ? `Просрочено на ${diffDays > 0 ? `${diffDays}д ` : ''}${hoursRemainder}ч`
      : `Осталось ${diffDays > 0 ? `${diffDays}д ` : ''}${hoursRemainder}ч`

  const tone =
    diffMs < 0
      ? 'text-red-600 dark:text-red-400'
      : diffHours <= 24
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-green-600 dark:text-green-400'

  return { label, tone }
}

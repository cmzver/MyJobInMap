/**
 * Константы для заявок (статусы, приоритеты, метки)
 * Централизованное место для всех констант, связанных с задачами
 */
import type { TaskStatus, TaskPriority } from '@/types/task'
import taskStatusTransitions from './taskStatusTransitions.json'

// =====================================================
// Опции для Select компонентов
// =====================================================

export const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'NEW', label: 'Новые' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'DONE', label: 'Выполненные' },
  { value: 'CANCELLED', label: 'Отменённые' },
] as const

export const PRIORITY_OPTIONS = [
  { value: '', label: 'Все приоритеты' },
  { value: 'EMERGENCY', label: 'Аварийные' },
  { value: 'URGENT', label: 'Срочные' },
  { value: 'CURRENT', label: 'Текущие' },
  { value: 'PLANNED', label: 'Плановые' },
] as const

// Без "Все" опции для форм создания/редактирования
export const PRIORITY_OPTIONS_FOR_FORM = [
  { value: 'PLANNED', label: 'Плановая' },
  { value: 'CURRENT', label: 'Текущая' },
  { value: 'URGENT', label: 'Срочная' },
  { value: 'EMERGENCY', label: 'Аварийная' },
]

// =====================================================
// Метки для отображения
// =====================================================

export const STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнена',
  CANCELLED: 'Отменена',
}

export const STATUS_TRANSITIONS = taskStatusTransitions as Record<TaskStatus, TaskStatus[]>

export interface StatusCommentCopy {
  title: string
  description: string
  label: string
  placeholder: string
  submitText: string
  error: string
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  PLANNED: 'Плановая',
  CURRENT: 'Текущая',
  URGENT: 'Срочная',
  EMERGENCY: 'Аварийная',
}

// Маппинг числовых приоритетов (для совместимости со старым API)
export const PRIORITY_FROM_NUMBER: Record<number, TaskPriority> = {
  1: 'PLANNED',
  2: 'CURRENT',
  3: 'URGENT',
  4: 'EMERGENCY',
}

// =====================================================
// Цвета для Badge компонентов
// =====================================================

export const STATUS_COLORS: Record<TaskStatus, 'danger' | 'warning' | 'success' | 'gray'> = {
  NEW: 'danger',
  IN_PROGRESS: 'warning',
  DONE: 'success',
  CANCELLED: 'gray',
}

export const PRIORITY_COLORS: Record<TaskPriority, 'danger' | 'warning' | 'info' | 'success'> = {
  EMERGENCY: 'danger',
  URGENT: 'warning',
  CURRENT: 'info',
  PLANNED: 'success',
}

// =====================================================
// Хелпер функции
// =====================================================

/**
 * Нормализует приоритет из числа или строки в TaskPriority
 */
export function normalizePriority(value?: TaskPriority | number | string | null): TaskPriority {
  if (value === null || value === undefined) return 'CURRENT'
  
  if (typeof value === 'number') {
    return PRIORITY_FROM_NUMBER[value] || 'CURRENT'
  }
  
  if (typeof value === 'string') {
    // Если это числовая строка
    const numeric = Number(value)
    if (!Number.isNaN(numeric) && PRIORITY_FROM_NUMBER[numeric]) {
      return PRIORITY_FROM_NUMBER[numeric]
    }
    // Если это уже валидный приоритет
    if (value in PRIORITY_LABELS) {
      return value as TaskPriority
    }
  }
  
  return 'CURRENT'
}

/**
 * Получить метку приоритета по значению (число или строка)
 */
export function getPriorityLabel(value?: TaskPriority | number | string | null): string {
  const normalized = normalizePriority(value)
  return PRIORITY_LABELS[normalized] || String(value || '')
}

/**
 * Получить метку статуса
 */
export function getStatusLabel(status?: TaskStatus | string | null): string {
  if (!status) return 'Не указан'
  return STATUS_LABELS[status as TaskStatus] || String(status)
}

export function getAvailableStatusTransitions(status?: TaskStatus | string | null): TaskStatus[] {
  if (!status) return []
  return STATUS_TRANSITIONS[status as TaskStatus] || []
}

export function isStatusTransitionAllowed(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  if (fromStatus === toStatus) return false
  return getAvailableStatusTransitions(fromStatus).includes(toStatus)
}

export function requiresStatusComment(status: TaskStatus): boolean {
  return status === 'DONE' || status === 'CANCELLED'
}

export function getStatusCommentCopy(status: TaskStatus | null, options?: { plural?: boolean }): StatusCommentCopy {
  const plural = options?.plural ?? false

  if (status === 'DONE') {
    return {
      title: plural ? 'Комментарий к завершению заявок' : 'Комментарий к завершению заявки',
      description: plural
        ? 'Опишите, какие работы выполнены по выбранным заявкам.'
        : 'Опишите, какие работы выполнены и чем завершилась заявка.',
      label: 'Что выполнено',
      placeholder: 'Кратко опишите выполненные работы',
      submitText: plural ? 'Завершить заявки' : 'Завершить заявку',
      error: plural ? 'Заполните комментарий, чтобы завершить заявки' : 'Заполните комментарий, чтобы завершить заявку',
    }
  }

  if (status === 'CANCELLED') {
    return {
      title: plural ? 'Комментарий к отмене заявок' : 'Комментарий к отмене заявки',
      description: plural
        ? 'Укажите причину, по которой выбранные заявки отменяются.'
        : 'Укажите причину, по которой заявка была отменена.',
      label: 'Причина отмены',
      placeholder: 'Кратко опишите причину отмены',
      submitText: plural ? 'Отменить заявки' : 'Отменить заявку',
      error: plural ? 'Заполните комментарий, чтобы отменить заявки' : 'Заполните комментарий, чтобы отменить заявку',
    }
  }

  return {
    title: 'Комментарий к смене статуса',
    description: plural ? 'Добавьте комментарий к смене статуса заявок.' : 'Добавьте комментарий к смене статуса заявки.',
    label: 'Комментарий',
    placeholder: 'Введите комментарий',
    submitText: plural ? 'Применить' : 'Сохранить',
    error: 'Комментарий обязателен',
  }
}

/**
 * Парсинг приоритета из CSV/импорта
 */
export function parsePriorityFromImport(value: string): TaskPriority | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  
  // Числовые значения
  if (['1', '2', '3', '4'].includes(normalized)) {
    return PRIORITY_FROM_NUMBER[Number(normalized)]
  }
  
  // Английские названия
  const englishMap: Record<string, TaskPriority> = {
    planned: 'PLANNED',
    current: 'CURRENT',
    urgent: 'URGENT',
    emergency: 'EMERGENCY',
  }
  if (englishMap[normalized]) return englishMap[normalized]
  
  // Русские названия
  const russianMap: Record<string, TaskPriority> = {
    'плановая': 'PLANNED',
    'текущая': 'CURRENT',
    'срочная': 'URGENT',
    'аварийная': 'EMERGENCY',
    'авария': 'EMERGENCY',
  }
  if (russianMap[normalized]) return russianMap[normalized]
  
  return undefined
}

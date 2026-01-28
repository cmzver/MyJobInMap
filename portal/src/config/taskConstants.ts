/**
 * Константы для заявок (статусы, приоритеты, метки)
 * Централизованное место для всех констант, связанных с задачами
 */
import type { TaskStatus, TaskPriority } from '@/types/task'

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

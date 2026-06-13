/**
 * Reports types for analytics and reporting features.
 *
 * Структуры ответа выводятся из backend OpenAPI-схемы (единый источник
 * истины) — регенерация через `npm run gen:api`.
 */
import type { components } from './api.generated'

export type TasksByStatusItem = components['schemas']['TasksByStatusItem']
export type TasksByPriorityItem = components['schemas']['TasksByPriorityItem']
export type TasksByDayItem = components['schemas']['TasksByDayItem']
export type TasksByWorkerItem = components['schemas']['TasksByWorkerItem']
export type CompletionTimeStats = components['schemas']['CompletionTimeStats']
export type ReportsSummary = components['schemas']['ReportsSummary']
export type ReportsData = components['schemas']['ReportsResponse']

// Период и фильтры — клиентские понятия (на сервере это query-параметры,
// а не схема), поэтому остаются заданными вручную.
export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

export interface ReportsFilters {
  period: ReportPeriod
  date_from?: string
  date_to?: string
  worker_id?: number
}

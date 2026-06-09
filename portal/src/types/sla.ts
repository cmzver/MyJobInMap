/**
 * SLA Types
 * =========
 * Типы для SLA-дашборда. Структуры ответа выводятся из backend OpenAPI-схемы
 * (единый источник истины) — регенерация через `npm run gen:api`.
 */
import type { components } from './api.generated'
import type { ReportPeriod } from './reports'

// Период и фильтры — клиентские понятия (на сервере это query-параметры).
export type SlaPeriod = ReportPeriod

export interface SlaFilters {
  period: SlaPeriod
  date_from?: string
  date_to?: string
}

export type SlaOverview = components['schemas']['SlaOverview']
export type SlaTiming = components['schemas']['SlaTiming']
export type SlaPriority = components['schemas']['SlaPriority']
export type SlaWorker = components['schemas']['SlaWorker']
export type SlaTrend = components['schemas']['SlaTrend']
export type SlaPeriodInfo = components['schemas']['SlaPeriodInfo']
export type SlaData = components['schemas']['SlaResponse']

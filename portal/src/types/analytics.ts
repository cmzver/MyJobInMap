import type { components } from './api.generated'
import type { ReportPeriod, ReportsFilters } from './reports'

// Период и фильтры — клиентские понятия (на сервере это query-параметры).
export type AnalyticsPeriod = ReportPeriod

export interface AnalyticsFilters extends ReportsFilters {}

// Объединённый ответ аналитики выводится из backend OpenAPI-схемы —
// регенерация через `npm run gen:api`.
export type AnalyticsData = components['schemas']['AnalyticsResponse']

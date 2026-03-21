import type { ReportsData, ReportPeriod, ReportsFilters } from './reports'
import type { SlaData } from './sla'

export type AnalyticsPeriod = ReportPeriod

export interface AnalyticsFilters extends ReportsFilters {}

export interface AnalyticsData {
  reports: ReportsData
  sla: SlaData
}

/**
 * SLA Types
 * =========
 * Типы для SLA дашборда.
 */

import type { ReportPeriod } from './reports'

export type SlaPeriod = ReportPeriod

export interface SlaFilters {
  period: SlaPeriod
  date_from?: string
  date_to?: string
}

export interface SlaOverview {
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  new_tasks: number
  cancelled_tasks: number
  overdue_tasks: number
  active_overdue: number
  completion_rate: number
  sla_compliance_rate: number
}

export interface SlaTiming {
  avg_completion_hours: number
  min_completion_hours: number
  max_completion_hours: number
  median_completion_hours: number
}

export interface SlaPriority {
  priority: string
  label: string
  total: number
  completed: number
  sla_hours: number
  sla_compliance_rate: number
}

export interface SlaWorker {
  user_id: number
  user_name: string
  total_tasks: number
  completed_tasks: number
  completion_rate: number
  sla_compliance_rate: number
  avg_completion_hours: number
}

export interface SlaTrend {
  date: string
  created: number
  completed: number
}

export interface SlaPeriodInfo {
  start: string
  end: string
  days: number
  label: string
}

export interface SlaData {
  period: SlaPeriodInfo
  overview: SlaOverview
  timing: SlaTiming
  by_priority: SlaPriority[]
  by_worker: SlaWorker[]
  trends: SlaTrend[]
}

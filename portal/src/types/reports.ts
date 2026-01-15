/**
 * Reports types for analytics and reporting features
 */

export interface TasksByStatusItem {
  status: string
  count: number
  label: string
}

export interface TasksByPriorityItem {
  priority: string
  count: number
  label: string
}

export interface TasksByDayItem {
  date: string
  created: number
  completed: number
}

export interface TasksByWorkerItem {
  user_id: number
  user_name: string
  total: number
  completed: number
  in_progress: number
  new_tasks: number
}

export interface CompletionTimeStats {
  avg_hours: number
  min_hours: number
  max_hours: number
  total_completed: number
}

export interface ReportsSummary {
  total_tasks: number
  completed_tasks: number
  completion_rate: number
  avg_tasks_per_day: number
  period_days: number
}

export interface ReportsData {
  summary: ReportsSummary
  by_status: TasksByStatusItem[]
  by_priority: TasksByPriorityItem[]
  by_day: TasksByDayItem[]
  by_worker: TasksByWorkerItem[]
  completion_time: CompletionTimeStats | null
}

export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

export interface ReportsFilters {
  period: ReportPeriod
  date_from?: string
  date_to?: string
  worker_id?: number
}

import {
  Activity,
  AlertCircle,
  Filter,
  Timer,
  Users,
} from 'lucide-react'

import Card from '@/components/Card'
import type { ReportsData } from '@/types/reports'
import { formatHours } from '@/components/analytics/analyticsUtils'

const statusColors: Record<string, string> = {
  NEW: '#EF4444',
  IN_PROGRESS: '#F59E0B',
  DONE: '#22C55E',
  CANCELLED: '#6B7280',
}

const priorityColors: Record<string, string> = {
  EMERGENCY: '#DC2626',
  URGENT: '#F59E0B',
  CURRENT: '#3B82F6',
  PLANNED: '#22C55E',
}

type OverviewSectionProps = {
  reports: ReportsData
  workerFilterLabel: string
}

export default function OverviewSection({ reports, workerFilterLabel }: OverviewSectionProps) {
  const { summary, by_status, by_priority, by_day, by_worker, completion_time } = reports
  const maxDailyValue = Math.max(1, ...by_day.map((day) => Math.max(day.created, day.completed)))

  return (
    <section id="overview" className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            Overview
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Операционный обзор</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Поток заявок, нагрузка по исполнителям и динамика завершения по выбранному периоду.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          Фильтр исполнителя: <span className="font-medium text-slate-900 dark:text-white">{workerFilterLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Filter className="h-5 w-5" />
            Распределение по статусам
          </h3>
          <div className="space-y-3">
            {by_status.map((item) => {
              const percentage = summary.total_tasks > 0 ? (item.count / summary.total_tasks) * 100 : 0
              return (
                <div key={item.status}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {item.count} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: statusColors[item.status] || '#6B7280',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <AlertCircle className="h-5 w-5" />
            Распределение по приоритетам
          </h3>
          <div className="space-y-3">
            {by_priority.map((item) => {
              const percentage = summary.total_tasks > 0 ? (item.count / summary.total_tasks) * 100 : 0
              return (
                <div key={item.priority}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {item.count} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: priorityColors[item.priority] || '#6B7280',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {by_day.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Activity className="h-5 w-5" />
            Динамика по дням
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-[640px] space-y-2">
              {by_day.slice(-14).map((item) => {
                const createdWidth = (item.created / maxDailyValue) * 100
                const completedWidth = (item.completed / maxDailyValue) * 100
                return (
                  <div key={item.date} className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex flex-1 gap-2">
                      <div className="flex flex-1 items-center gap-2">
                        <div className="h-6 rounded bg-blue-500" style={{ width: `${createdWidth}%` }} />
                        <span className="w-6 text-xs text-slate-600 dark:text-slate-400">{item.created}</span>
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="h-6 rounded bg-green-500" style={{ width: `${completedWidth}%` }} />
                        <span className="w-6 text-xs text-slate-600 dark:text-slate-400">{item.completed}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-blue-500" />
                <span>Создано</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-green-500" />
                <span>Выполнено</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {by_worker.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Users className="h-5 w-5" />
            Производительность исполнителей
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-300">Исполнитель</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">Всего</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">Новые</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">В работе</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">Выполнено</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">% выполнения</th>
                </tr>
              </thead>
              <tbody>
                {by_worker.map((worker) => {
                  const completionRate = worker.total > 0 ? ((worker.completed / worker.total) * 100).toFixed(1) : '0'
                  return (
                    <tr
                      key={worker.user_id}
                      className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{worker.user_name}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">{worker.total}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400">{worker.new_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400">{worker.in_progress}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-600 dark:text-green-400">{worker.completed}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-900 dark:text-white">{completionRate}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {completion_time && (
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Timer className="h-5 w-5" />
            Время выполнения
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Среднее</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{formatHours(completion_time.avg_hours)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Минимум</p>
              <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{formatHours(completion_time.min_hours)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Максимум</p>
              <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{formatHours(completion_time.max_hours)}</p>
            </div>
          </div>
        </Card>
      )}
    </section>
  )
}

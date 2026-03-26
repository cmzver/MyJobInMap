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
    <section id="overview" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Обзор по заявкам</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Поток заявок, нагрузка по исполнителям и динамика завершения за выбранный период.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Исполнитель: <span className="font-medium text-gray-900 dark:text-white">{workerFilterLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Filter className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              Распределение по статусам
            </h3>
            <div className="space-y-3">
              {by_status.map((item) => {
                const percentage = summary.total_tasks > 0 ? (item.count / summary.total_tasks) * 100 : 0
                return (
                  <div key={item.status}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {item.count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full rounded transition-all"
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
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <AlertCircle className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              Распределение по приоритетам
            </h3>
            <div className="space-y-3">
              {by_priority.map((item) => {
                const percentage = summary.total_tasks > 0 ? (item.count / summary.total_tasks) * 100 : 0
                return (
                  <div key={item.priority}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {item.count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full rounded transition-all"
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
          </div>
        </Card>
      </div>

      {by_day.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Activity className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              Динамика по дням
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] space-y-2">
                {by_day.slice(-14).map((item) => {
                  const createdWidth = (item.created / maxDailyValue) * 100
                  const completedWidth = (item.completed / maxDailyValue) * 100
                  return (
                    <div key={item.date} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <div className="flex flex-1 gap-2">
                        <div className="flex flex-1 items-center gap-2">
                          <div className="h-6 rounded bg-gray-400 dark:bg-gray-500" style={{ width: `${createdWidth}%` }} />
                          <span className="w-6 text-xs text-gray-600 dark:text-gray-400">{item.created}</span>
                        </div>
                        <div className="flex flex-1 items-center gap-2">
                          <div className="h-6 rounded bg-gray-900 dark:bg-gray-100" style={{ width: `${completedWidth}%` }} />
                          <span className="w-6 text-xs text-gray-600 dark:text-gray-400">{item.completed}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-gray-400 dark:bg-gray-500" />
                  <span>Создано</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-gray-900 dark:bg-gray-100" />
                  <span>Выполнено</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {by_worker.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Users className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              Производительность исполнителей
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Исполнитель</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Всего</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Новые</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">В работе</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Выполнено</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">% выполнения</th>
                  </tr>
                </thead>
                <tbody>
                  {by_worker.map((worker) => {
                    const completionRate = worker.total > 0 ? ((worker.completed / worker.total) * 100).toFixed(1) : '0'
                    return (
                      <tr
                        key={worker.user_id}
                        className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{worker.user_name}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">{worker.total}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">{worker.new_tasks}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">{worker.in_progress}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-green-600 dark:text-green-400">{worker.completed}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">{completionRate}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {completion_time && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Timer className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              Время выполнения
            </h3>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700 sm:grid-cols-3">
              <div className="bg-white p-4 text-center dark:bg-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">Среднее</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{formatHours(completion_time.avg_hours)}</p>
              </div>
              <div className="bg-white p-4 text-center dark:bg-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">Минимум</p>
                <p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{formatHours(completion_time.min_hours)}</p>
              </div>
              <div className="bg-white p-4 text-center dark:bg-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">Максимум</p>
                <p className="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">{formatHours(completion_time.max_hours)}</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </section>
  )
}

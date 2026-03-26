import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Shield,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react'

import Card from '@/components/Card'
import type { SlaData } from '@/types/sla'
import { complianceBg, complianceColor, formatHours } from '@/components/analytics/analyticsUtils'

const slaPriorityColors: Record<string, string> = {
  PLANNED: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300',
  CURRENT: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
}

type SlaSectionProps = {
  sla: SlaData
}

export default function SlaSection({ sla }: SlaSectionProps) {
  const { overview, timing, by_priority, by_worker, trends, period } = sla
  const maxTrendValue = Math.max(1, ...trends.map((trend) => Math.max(trend.created, trend.completed)))

  return (
    <section id="sla" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">SLA и сроки</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Compliance по SLA, просрочки, время закрытия и результаты по приоритетам и исполнителям.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Окно анализа: <span className="font-medium text-gray-900 dark:text-white">{period.days} дн.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white p-4 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">SLA compliance</p>
              <p className={`mt-1 text-2xl font-semibold ${complianceColor(overview.sla_compliance_rate)}`}>
                {overview.sla_compliance_rate}%
              </p>
            </div>
            <div className={`flex h-9 w-9 items-center justify-center rounded-md ${complianceBg(overview.sla_compliance_rate)}`}>
              <Shield className="h-4.5 w-4.5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {overview.completed_tasks - overview.overdue_tasks} из {overview.completed_tasks} в срок
          </p>
        </div>

        <div className="bg-white p-4 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Среднее время</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{formatHours(timing.avg_completion_hours)}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <Timer className="h-4.5 w-4.5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Медиана: {formatHours(timing.median_completion_hours)}</p>
        </div>

        <div className="bg-white p-4 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Выполнено</p>
              <p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{overview.completed_tasks}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <CheckCircle className="h-4.5 w-4.5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            из {overview.total_tasks} ({overview.completion_rate}%)
          </p>
        </div>

        <div className="bg-white p-4 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Просроченные</p>
              <p className={`mt-1 text-2xl font-semibold ${overview.active_overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {overview.active_overdue}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Активных заявок с нарушением SLA</p>
        </div>
      </div>

      <Card>
        <div className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <BarChart3 className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
            SLA по приоритетам
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Приоритет</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Норма SLA</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Всего</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Выполнено</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">SLA %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {by_priority.map((priority) => (
                  <tr key={priority.priority}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${slaPriorityColors[priority.priority] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                        {priority.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                      {formatHours(priority.sla_hours)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">{priority.total}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">{priority.completed}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${complianceColor(priority.sla_compliance_rate)}`}>
                        {priority.sla_compliance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {by_worker.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Users className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              SLA по исполнителям
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Имя</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Всего</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Выполнено</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">% выполнения</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">SLA %</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Ср. время</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {by_worker.map((worker) => (
                    <tr key={worker.user_id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{worker.user_name}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.total_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.completed_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.completion_rate}%</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold ${complianceColor(worker.sla_compliance_rate)}`}>
                          {worker.sla_compliance_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                        {formatHours(worker.avg_completion_hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {trends.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <TrendingUp className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              SLA по дням
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Дата</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Создано</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Завершено</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Прогресс</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {trends.slice(-14).map((trend) => (
                    <tr key={trend.date}>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{trend.date}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-900 dark:text-white">{trend.created}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-green-600 dark:text-green-400">{trend.completed}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <div className="h-3 rounded bg-gray-300 dark:bg-gray-600" style={{ width: `${(trend.created / maxTrendValue) * 100}%` }} />
                          <div className="h-3 rounded bg-gray-900 dark:bg-gray-100" style={{ width: `${(trend.completed / maxTrendValue) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </section>
  )
}

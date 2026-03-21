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
  PLANNED: 'bg-green-100 text-green-800',
  CURRENT: 'bg-blue-100 text-blue-800',
  URGENT: 'bg-orange-100 text-orange-800',
  EMERGENCY: 'bg-red-100 text-red-800',
}

type SlaSectionProps = {
  sla: SlaData
}

export default function SlaSection({ sla }: SlaSectionProps) {
  const { overview, timing, by_priority, by_worker, trends, period } = sla
  const maxTrendValue = Math.max(1, ...trends.map((trend) => Math.max(trend.created, trend.completed)))

  return (
    <section id="sla" className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            SLA
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Контроль сроков и качества исполнения</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Compliance по SLA, просрочки, время закрытия и разрез по приоритетам и исполнителям.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          Окно анализа: <span className="font-medium text-slate-900 dark:text-white">{period.days} дн.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">SLA Compliance</p>
                <p className={`text-3xl font-bold ${complianceColor(overview.sla_compliance_rate)}`}>
                  {overview.sla_compliance_rate}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${complianceBg(overview.sla_compliance_rate)}`}>
                <Shield className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {overview.completed_tasks - overview.overdue_tasks} из {overview.completed_tasks} в срок
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Среднее время</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatHours(timing.avg_completion_hours)}</p>
              </div>
              <div className="rounded-full bg-blue-100 p-3 text-blue-800">
                <Timer className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">Медиана: {formatHours(timing.median_completion_hours)}</p>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Выполнено</p>
                <p className="text-3xl font-bold text-green-600">{overview.completed_tasks}</p>
              </div>
              <div className="rounded-full bg-green-100 p-3 text-green-800">
                <CheckCircle className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              из {overview.total_tasks} ({overview.completion_rate}%)
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Просроченные</p>
                <p className={`text-3xl font-bold ${overview.active_overdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {overview.active_overdue}
                </p>
              </div>
              <div className={`rounded-full p-3 ${overview.active_overdue > 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>
                <AlertTriangle className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">Активных заявок с нарушением SLA</p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <BarChart3 className="h-5 w-5 text-primary-600" />
            SLA по приоритетам
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Приоритет</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Норма SLA</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Всего</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Выполнено</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">SLA %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {by_priority.map((priority) => (
                  <tr key={priority.priority}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${slaPriorityColors[priority.priority] ?? 'bg-slate-100'}`}>
                        {priority.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400">
                      {formatHours(priority.sla_hours)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">{priority.total}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">{priority.completed}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${complianceColor(priority.sla_compliance_rate)}`}>
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
          <div className="p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <Users className="h-5 w-5 text-primary-600" />
              SLA по исполнителям
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Имя</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Всего</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Выполнено</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">% выполнения</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">SLA %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Ср. время</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {by_worker.map((worker) => (
                    <tr key={worker.user_id}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{worker.user_name}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.total_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.completed_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.completion_rate}%</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold ${complianceColor(worker.sla_compliance_rate)}`}>
                          {worker.sla_compliance_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400">
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
          <div className="p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <TrendingUp className="h-5 w-5 text-primary-600" />
              SLA тренды
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Дата</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Создано</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Завершено</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Прогресс</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {trends.slice(-14).map((trend) => (
                    <tr key={trend.date}>
                      <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">{trend.date}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-slate-900 dark:text-white">{trend.created}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-green-600 dark:text-green-400">{trend.completed}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <div className="h-3 rounded bg-blue-200" style={{ width: `${(trend.created / maxTrendValue) * 100}%` }} />
                          <div className="h-3 rounded bg-green-400" style={{ width: `${(trend.completed / maxTrendValue) * 100}%` }} />
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

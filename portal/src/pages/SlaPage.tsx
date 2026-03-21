/**
 * SlaPage - SLA Dashboard
 * =================================
 * Мониторинг SLA: compliance rate, время выполнения, тренды, по приоритетам и исполнителям.
 */

import { useState } from 'react'
import {
  Shield,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Users,
  Download,
  Target,
  Timer,
  BarChart3,
} from 'lucide-react'
import { useSla, downloadExcel } from '@/hooks/useSla'
import type { SlaPeriod } from '@/types/sla'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'

const periodOptions = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
]

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}м`
  if (hours < 24) return `${hours.toFixed(1)}ч`
  const days = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return h > 0 ? `${days}д ${h}ч` : `${days}д`
}

function complianceColor(rate: number): string {
  if (rate >= 90) return 'text-green-600'
  if (rate >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

function complianceBg(rate: number): string {
  if (rate >= 90) return 'bg-green-100 text-green-800'
  if (rate >= 70) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

const priorityColors: Record<string, string> = {
  PLANNED: 'bg-green-100 text-green-800',
  CURRENT: 'bg-blue-100 text-blue-800',
  URGENT: 'bg-orange-100 text-orange-800',
  EMERGENCY: 'bg-red-100 text-red-800',
}

export default function SlaPage({ embedded = false }: { embedded?: boolean }) {
  const [period, setPeriod] = useState<SlaPeriod>('month')
  const { data, isLoading, error } = useSla({ period })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return <EmptyState icon={AlertTriangle} title="Ошибка загрузки SLA" description="Не удалось загрузить данные" />
  }

  const { overview, timing, by_priority, by_worker, trends } = data

  return (
    <div className="space-y-6">
      {/* Заголовок + фильтры */}
      <div className={`flex flex-col items-start gap-4 sm:flex-row sm:items-center ${embedded ? 'sm:justify-end' : 'sm:justify-between'}`}>
        {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="h-7 w-7 text-indigo-600" />
            SLA Мониторинг
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Период: {data.period.days} дней
          </p>
        </div>
        )}
        <div className={`flex items-center gap-3 ${embedded ? 'sm:ml-auto' : ''}`}>
          {embedded && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              За {data.period.days} дн.
            </span>
          )}
          <Select
            value={period}
            onChange={(val) => setPeriod(val as SlaPeriod)}
            options={periodOptions}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadExcel({ period })}
          >
            <Download className="h-4 w-4 mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* SLA Compliance */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">SLA Compliance</p>
                <p className={`text-3xl font-bold ${complianceColor(overview.sla_compliance_rate)}`}>
                  {overview.sla_compliance_rate}%
                </p>
              </div>
              <div className={`p-3 rounded-full ${complianceBg(overview.sla_compliance_rate)}`}>
                <Target className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {overview.completed_tasks - overview.overdue_tasks} из {overview.completed_tasks} в срок
            </p>
          </div>
        </Card>

        {/* Среднее время */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Среднее время</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatHours(timing.avg_completion_hours)}
                </p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 text-blue-800">
                <Timer className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Медиана: {formatHours(timing.median_completion_hours)}
            </p>
          </div>
        </Card>

        {/* Всего выполнено */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Выполнено</p>
                <p className="text-3xl font-bold text-green-600">
                  {overview.completed_tasks}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 text-green-800">
                <CheckCircle className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              из {overview.total_tasks} ({overview.completion_rate}%)
            </p>
          </div>
        </Card>

        {/* Просроченные */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Просроченные</p>
                <p className={`text-3xl font-bold ${overview.active_overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {overview.active_overdue}
                </p>
              </div>
              <div className={`p-3 rounded-full ${overview.active_overdue > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                <AlertTriangle className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              активных заявок с нарушением SLA
            </p>
          </div>
        </Card>
      </div>

      {/* Таблица по приоритетам */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-500" />
            SLA по приоритетам
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Приоритет</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Норма SLA</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Всего</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Выполнено</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">SLA %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {by_priority.map((p) => (
                  <tr key={p.priority}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${priorityColors[p.priority] ?? 'bg-gray-100'}`}>
                        {p.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                      {formatHours(p.sla_hours)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{p.total}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{p.completed}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${complianceColor(p.sla_compliance_rate)}`}>
                        {p.sla_compliance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Исполнители */}
      {by_worker.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              SLA по исполнителям
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Имя</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Всего</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Выполнено</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% выполнения</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">SLA %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ср. время</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {by_worker.map((w) => (
                    <tr key={w.user_id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {w.user_name}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{w.total_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm">{w.completed_tasks}</td>
                      <td className="px-4 py-3 text-right text-sm">{w.completion_rate}%</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold ${complianceColor(w.sla_compliance_rate)}`}>
                          {w.sla_compliance_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {formatHours(w.avg_completion_hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Тренды */}
      {trends.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Тренды
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Создано</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Завершено</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Прогресс</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {trends.slice(-14).map((t) => {
                    const maxVal = Math.max(...trends.map((tr) => Math.max(tr.created, tr.completed)), 1)
                    return (
                      <tr key={t.date}>
                        <td className="px-4 py-2 text-sm text-gray-600">{t.date}</td>
                        <td className="px-4 py-2 text-right text-sm font-medium">{t.created}</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-green-600">{t.completed}</td>
                        <td className="px-4 py-2 w-48">
                          <div className="flex items-center gap-1">
                            <div
                              className="h-3 bg-blue-200 rounded"
                              style={{ width: `${(t.created / maxVal) * 100}%` }}
                            />
                            <div
                              className="h-3 bg-green-400 rounded"
                              style={{ width: `${(t.completed / maxVal) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Статистика по времени */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-500" />
            Статистика по времени выполнения
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 uppercase">Минимум</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {formatHours(timing.min_completion_hours)}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 uppercase">Среднее</p>
              <p className="text-xl font-bold text-blue-600 mt-1">
                {formatHours(timing.avg_completion_hours)}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 uppercase">Медиана</p>
              <p className="text-xl font-bold text-indigo-600 mt-1">
                {formatHours(timing.median_completion_hours)}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 uppercase">Максимум</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {formatHours(timing.max_completion_hours)}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

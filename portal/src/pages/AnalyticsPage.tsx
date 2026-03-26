import { useState } from 'react'
import {
  Activity,
  BarChart3,
  CheckCircle,
  Clock,
  Download,
  Shield,
  Target,
  TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

import OverviewSection from '@/components/analytics/OverviewSection'
import SlaSection from '@/components/analytics/SlaSection'
import { complianceColor, formatHours } from '@/components/analytics/analyticsUtils'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import { downloadAnalyticsReport, useAnalytics } from '@/hooks/useAnalytics'
import { useUsers } from '@/hooks/useUsers'
import type { ReportPeriod } from '@/types/reports'
import { isAssignableRole } from '@/types/user'

const periodOptions = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
]

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('')

  const { data: users = [] } = useUsers()
  const workers = users.filter((user) => isAssignableRole(user.role))
  const selectedWorker = workers.find((worker) => String(worker.id) === selectedWorkerId)
  const workerFilterLabel = selectedWorker ? selectedWorker.full_name || selectedWorker.username : 'Все исполнители'

  const filters = {
    period,
    worker_id: selectedWorkerId ? Number(selectedWorkerId) : undefined,
  }

  const { data, isLoading, isFetching, error, refetch } = useAnalytics(filters)

  const handleExport = async () => {
    try {
      await downloadAnalyticsReport(filters)
      toast.success('Отчёт формируется...')
    } catch (err) {
      toast.error('Не удалось сформировать отчёт')
      if (import.meta.env.DEV) console.error('Analytics export failed:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Не удалось загрузить аналитику"
        description="Проверьте подключение к серверу и попробуйте обновить данные."
      />
    )
  }

  const { reports, sla } = data
  const avgExecutionTime = reports.completion_time
    ? formatHours(reports.completion_time.avg_hours)
    : formatHours(sla.timing.avg_completion_hours)

  const overviewCards = [
    {
      title: 'Всего заявок',
      value: reports.summary.total_tasks,
      meta: `За ${reports.summary.period_days} дн.`,
      icon: BarChart3,
    },
    {
      title: 'Выполнено',
      value: reports.summary.completed_tasks,
      meta: `${reports.summary.completion_rate}% от всех`,
      icon: CheckCircle,
      valueClassName: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'SLA',
      value: `${sla.overview.sla_compliance_rate}%`,
      meta: 'Завершено в срок',
      icon: Target,
      valueClassName: complianceColor(sla.overview.sla_compliance_rate),
    },
    {
      title: 'Просроченные',
      value: sla.overview.active_overdue,
      meta: 'Активные нарушения',
      icon: Shield,
      valueClassName: sla.overview.active_overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white',
    },
    {
      title: 'Среднее в день',
      value: reports.summary.avg_tasks_per_day,
      meta: 'Новые заявки',
      icon: TrendingUp,
    },
    {
      title: 'Среднее время',
      value: avgExecutionTime,
      meta: 'На выполнение',
      icon: Clock,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Аналитика</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Сводка по заявкам, исполнителям и соблюдению SLA за выбранный период.
        </p>
      </div>

      <Card>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Период</p>
                <Select
                  value={period}
                  onChange={(value) => setPeriod(value as ReportPeriod)}
                  options={periodOptions}
                  className="h-10"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Исполнитель</p>
                <Select
                  value={selectedWorkerId}
                  onChange={(value) => setSelectedWorkerId(value)}
                  options={[
                    { value: '', label: 'Все исполнители' },
                    ...workers.map((worker) => ({
                      value: String(worker.id),
                      label: worker.full_name || worker.username,
                    })),
                  ]}
                  className="h-10"
                />
              </div>

              <div className="md:col-span-2 xl:col-span-1">
                <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Действия</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
                    <Activity className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Обновить
                  </Button>
                  <Button variant="primary" onClick={handleExport}>
                    <Download className="h-4 w-4" />
                    Экспорт XLSX
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <p>
                Исполнитель: <span className="font-medium text-gray-900 dark:text-white">{workerFilterLabel}</span>
              </p>
              <p className="mt-1">
                Период:{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {periodOptions.find((option) => option.value === period)?.label ?? period}
                </span>
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700 md:grid-cols-2 xl:grid-cols-3">
        {overviewCards.map((card) => (
          <div key={card.title} className="bg-white p-4 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{card.title}</p>
                <p className={`mt-2 text-2xl font-semibold text-gray-900 dark:text-white ${card.valueClassName ?? ''}`}>
                  {card.value}
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{card.meta}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <card.icon className="h-4.5 w-4.5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <OverviewSection reports={reports} workerFilterLabel={workerFilterLabel} />
      <SlaSection sla={sla} />
    </div>
  )
}

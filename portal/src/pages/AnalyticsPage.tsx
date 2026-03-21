import { useState } from 'react'
import {
  Activity,
  BarChart3,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Shield,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

import OverviewSection from '@/components/analytics/OverviewSection'
import SlaSection from '@/components/analytics/SlaSection'
import { complianceBg, complianceColor, formatHours } from '@/components/analytics/analyticsUtils'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import { downloadAnalyticsReport, useAnalytics } from '@/hooks/useAnalytics'
import { useUsers } from '@/hooks/useUsers'
import type { ReportPeriod } from '@/types/reports'

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
  const workers = users.filter((user) => user.role === 'worker' || user.role === 'dispatcher')
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
      toast.success('Профессиональный отчет формируется...')
    } catch (err) {
      toast.error('Не удалось сформировать отчет')
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
  const avgExecutionTime = reports.completion_time ? formatHours(reports.completion_time.avg_hours) : formatHours(sla.timing.avg_completion_hours)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_36%)] px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-600 dark:text-primary-400">
                Analytics Workspace
              </div>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                Аналитика заявок и SLA в одном рабочем контуре
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Один экран для потока заявок, производительности исполнителей и контроля сроков.
                Экспорт собирается в единый XLSX-документ с титульным листом, сводкой и детальным
                реестром.
              </p>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
              <a
                href="#overview"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-primary-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-primary-700"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Обзор
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Поток и исполнители
                </div>
              </a>
              <a
                href="#sla"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-primary-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-primary-700"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  SLA
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Сроки и compliance
                </div>
              </a>
              <a
                href="#export"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-primary-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-primary-700"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Export
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Документ для руководства
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div id="export">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Период:</span>
              </div>
              <Select
                value={period}
                onChange={(value) => setPeriod(value as ReportPeriod)}
                options={periodOptions}
                className="w-48"
              />

              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Исполнитель:</span>
              </div>
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
                className="w-60"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
          <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            В отчёт войдут текущие фильтры: <span className="font-medium text-slate-700 dark:text-slate-200">{workerFilterLabel}</span> и период{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {periodOptions.find((option) => option.value === period)?.label ?? period}
            </span>.
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Всего заявок</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{reports.summary.total_tasks}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">За {reports.summary.period_days} дн.</p>
            </div>
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <BarChart3 className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Выполнено</p>
              <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">{reports.summary.completed_tasks}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{reports.summary.completion_rate}% от всех</p>
            </div>
            <div className="rounded-2xl bg-green-100 p-3 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">SLA compliance</p>
              <p className={`mt-1 text-3xl font-bold ${complianceColor(sla.overview.sla_compliance_rate)}`}>
                {sla.overview.sla_compliance_rate}%
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Завершенные в срок</p>
            </div>
            <div className={`rounded-2xl p-3 ${complianceBg(sla.overview.sla_compliance_rate)}`}>
              <Target className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Активные просрочки</p>
              <p className={`mt-1 text-3xl font-bold ${sla.overview.active_overdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {sla.overview.active_overdue}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Требуют реакции</p>
            </div>
            <div className="rounded-2xl bg-red-100 p-3 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <Shield className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Среднее в день</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{reports.summary.avg_tasks_per_day}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Новые заявки</p>
            </div>
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Среднее время</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{avgExecutionTime}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">На выполнение</p>
            </div>
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
              <Clock className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      <OverviewSection reports={reports} workerFilterLabel={workerFilterLabel} />
      <SlaSection sla={sla} />
    </div>
  )
}

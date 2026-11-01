import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Download, ListChecks, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import Card from '@/components/Card'
import QueryStatePanel from '@/components/QueryStatePanel'
import Select from '@/components/Select'
import { complianceColor, formatHours } from '@/components/analytics/analyticsUtils'
import { STATUS_HEX } from '@/config/taskConstants'
import { downloadAnalyticsReport, useAnalytics, useRepeatMetrics, type RepeatMetrics } from '@/hooks/useAnalytics'
import { useUsers } from '@/hooks/useUsers'
import type { AnalyticsData } from '@/types/analytics'
import type { ReportPeriod } from '@/types/reports'
import { isAssignableRole } from '@/types/user'
import { buildTaskListUrl } from '@/utils/taskListUrl'

const periodOptions = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
]

const percent = (value: number) => `${Math.round(value)}%`

/* ------------------------------------------------------------- показатели */

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="eyebrow truncate">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
      {note && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  )
}

function KpiStrip({ data, repeats }: { data: AnalyticsData; repeats?: RepeatMetrics }) {
  const { summary, completion_time } = data.reports
  const { overview, timing } = data.sla
  const avg = completion_time ? completion_time.avg_hours : timing.avg_completion_hours
  return (
    <div className="grid grid-cols-2 divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white sm:grid-cols-3 lg:grid-cols-6 lg:divide-x dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
      <Kpi label="Заявок" value={String(summary.total_tasks)} note={`≈ ${summary.avg_tasks_per_day.toFixed(1)} в день`} />
      <Kpi label="Выполнено" value={String(summary.completed_tasks)} note={`${percent(summary.completion_rate)} от всех`} />
      <Kpi
        label="В срок"
        value={percent(overview.sla_compliance_rate)}
        note="из выполненных"
        tone={overview.completed_tasks > 0 ? complianceColor(overview.sla_compliance_rate) : undefined}
      />
      <Kpi
        label="Просрочено"
        value={String(overview.active_overdue)}
        note="открытых сейчас"
        tone={overview.active_overdue > 0 ? 'text-red-600 dark:text-red-400' : undefined}
      />
      <Kpi label="Время выполнения" value={formatHours(avg)} note={`медиана ${formatHours(timing.median_completion_hours)}`} />
      <Kpi
        label="Повторы"
        value={repeats ? percent(repeats.overview.return_rate) : '—'}
        note={repeats ? `${repeats.overview.returned} из ${repeats.overview.completed} закрытых` : 'загрузка…'}
      />
    </div>
  )
}

/* ------------------------------------------------------------- динамика */

type Bucket = { label: string; title: string; created: number; completed: number }

/** Больше полутора месяцев — по неделям, иначе столбики не прочитать. */
function buckets(days: AnalyticsData['reports']['by_day']): Bucket[] {
  const daily = days.map((day) => ({
    label: day.date.slice(8, 10) + '.' + day.date.slice(5, 7),
    title: day.date,
    created: day.created,
    completed: day.completed,
  }))
  if (daily.length <= 45) return daily
  const weeks: Bucket[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    weeks.push({
      label: chunk[0]!.label,
      title: `${chunk[0]!.title} — ${chunk[chunk.length - 1]!.title}`,
      created: chunk.reduce((sum, d) => sum + d.created, 0),
      completed: chunk.reduce((sum, d) => sum + d.completed, 0),
    })
  }
  return weeks
}

function DynamicsCard({ data }: { data: AnalyticsData }) {
  const items = buckets(data.reports.by_day)
  const max = Math.max(1, ...items.map((b) => Math.max(b.created, b.completed)))
  const every = Math.max(1, Math.ceil(items.length / 12))
  return (
    <Card
      title={items.length > 0 && data.reports.by_day.length > 45 ? 'Динамика по неделям' : 'Динамика по дням'}
      action={
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gray-300 dark:bg-gray-500" />создано</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary-500" />выполнено</span>
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">За период заявок нет.</p>
      ) : (
        <div>
          <div className="flex h-36 items-end gap-1">
            {items.map((b) => (
              <div
                key={b.title}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
                title={`${b.title}: создано ${b.created}, выполнено ${b.completed}`}
              >
                <div className="w-full max-w-[10px] rounded-t bg-gray-300 dark:bg-gray-500" style={{ height: `${(b.created / max) * 100}%` }} />
                <div className="w-full max-w-[10px] rounded-t bg-primary-500" style={{ height: `${(b.completed / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {items.map((b, i) => (
              <span key={b.title} className="min-w-0 flex-1 truncate text-center text-[10px] text-gray-400">
                {i % every === 0 ? b.label : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------- структура */

function StructureCard({ data }: { data: AnalyticsData }) {
  const statuses = data.reports.by_status.filter((s) => s.count > 0)
  const total = statuses.reduce((sum, s) => sum + s.count, 0)
  return (
    <Card title="Статусы и сроки">
      <div className="space-y-4">
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            {statuses.map((s) => (
              <div
                key={s.status}
                title={`${s.label}: ${s.count}`}
                style={{ width: `${(s.count / Math.max(total, 1)) * 100}%`, backgroundColor: STATUS_HEX[s.status as keyof typeof STATUS_HEX] ?? '#9CA3AF' }}
              />
            ))}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {statuses.map((s) => (
              <li key={s.status} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-600 dark:text-gray-300">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_HEX[s.status as keyof typeof STATUS_HEX] ?? '#9CA3AF' }} />
                  {s.label}
                </span>
                <span className="tabular-nums text-gray-900 dark:text-white">{s.count}</span>
              </li>
            ))}
            {statuses.length === 0 && <li className="text-gray-500">Заявок нет</li>}
          </ul>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Приоритет</th>
              <th className="text-right">Норма</th>
              <th className="text-right">Заявок</th>
              <th className="text-right">В срок</th>
            </tr>
          </thead>
          <tbody>
            {data.sla.by_priority.map((p) => (
              <tr key={p.priority}>
                <td>{p.label}</td>
                <td className="text-right tabular-nums text-gray-500 dark:text-gray-400">{formatHours(p.sla_hours)}</td>
                <td className="text-right tabular-nums">{p.total}</td>
                <td className={`text-right tabular-nums ${p.completed > 0 ? complianceColor(p.sla_compliance_rate) : 'text-gray-400'}`}>
                  {p.completed > 0 ? percent(p.sla_compliance_rate) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------- исполнители */

type WorkerRow = {
  id: number
  name: string
  total: number
  newTasks: number
  inProgress: number
  completed: number
  completionRate: number
  slaRate: number | null
  avgHours: number | null
  returned: number | null
}

function workerRows(data: AnalyticsData, repeats?: RepeatMetrics): WorkerRow[] {
  const sla = new Map(data.sla.by_worker.map((w) => [w.user_id, w]))
  const back = new Map(repeats?.by_worker.map((w) => [w.user_id, w]) ?? [])
  return data.reports.by_worker
    .map((w) => {
      const s = sla.get(w.user_id)
      return {
        id: w.user_id,
        name: w.user_name,
        total: w.total,
        newTasks: w.new_tasks,
        inProgress: w.in_progress,
        completed: w.completed,
        completionRate: w.total > 0 ? (w.completed / w.total) * 100 : 0,
        slaRate: s && s.completed_tasks > 0 ? s.sla_compliance_rate : null,
        avgHours: s && s.completed_tasks > 0 ? s.avg_completion_hours : null,
        returned: back.get(w.user_id)?.returned ?? null,
      }
    })
    .sort((a, b) => b.total - a.total)
}

function WorkersTable({ rows }: { rows: WorkerRow[] }) {
  return (
    <Card flush title="Исполнители">
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">За период нет назначенных заявок.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Исполнитель</th>
              <th className="text-right">Всего</th>
              <th className="text-right">Новые</th>
              <th className="text-right">В работе</th>
              <th className="text-right">Выполнено</th>
              <th className="text-right">В срок</th>
              <th className="text-right">Ср. время</th>
              <th className="text-right" title="Закрытые заявки, по которым был повторный вызов">Вернулось</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="max-w-[16rem] truncate">
                  <Link
                    to={buildTaskListUrl({ assigneeIds: [row.id] })}
                    className="font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{row.total}</td>
                <td className="text-right tabular-nums">{row.newTasks}</td>
                <td className="text-right tabular-nums">{row.inProgress}</td>
                <td className="text-right tabular-nums">
                  {row.completed}
                  <span className="ml-1 text-xs text-gray-400">{percent(row.completionRate)}</span>
                </td>
                <td className={`text-right tabular-nums ${row.slaRate == null ? 'text-gray-400' : complianceColor(row.slaRate)}`}>
                  {row.slaRate == null ? '—' : percent(row.slaRate)}
                </td>
                <td className="text-right tabular-nums">{row.avgHours == null ? '—' : formatHours(row.avgHours)}</td>
                <td className={`text-right tabular-nums ${row.returned ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {row.returned ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------- повторы */

function PlaceList({ title, items }: { title: string; items: { key: string; label: string; to?: string; tasks: number; returns: number }[] }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow mb-1.5">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Нет мест с несколькими заявками.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3">
              {item.to ? (
                <Link to={item.to} className="min-w-0 truncate text-gray-700 hover:text-primary-600 dark:text-gray-200" title={item.label}>
                  {item.label}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-200" title={item.label}>{item.label}</span>
              )}
              <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                {item.tasks}
                {item.returns > 0 && <span className="text-red-600 dark:text-red-400"> · {item.returns} повт.</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RepeatsCard({ repeats }: { repeats?: RepeatMetrics }) {
  return (
    <Card
      title="Повторы и частые места"
      action={
        <Link to="/tasks?repeat=return" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          Все повторы <ArrowRight className="h-4 w-4" />
        </Link>
      }
    >
      {!repeats ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Загружаем…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Повторов {repeats.overview.returns} и дублей {repeats.overview.duplicates} из {repeats.overview.created} новых заявок —
            их отмечают диспетчеры в карточке заявки.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <PlaceList
              title="Адреса"
              items={repeats.top_addresses.slice(0, 5).map((place) => ({
                key: `${place.address_id}-${place.label}`,
                label: place.label,
                to: place.address_id ? `/addresses/${place.address_id}` : undefined,
                tasks: place.tasks,
                returns: place.returns,
              }))}
            />
            <PlaceList
              title="Системы"
              items={repeats.top_systems.slice(0, 5).map((system) => ({
                key: String(system.system_id),
                label: `${system.name} · ${system.address}`,
                to: system.address_id ? `/addresses/${system.address_id}` : undefined,
                tasks: system.tasks,
                returns: system.returns,
              }))}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------- страница */

export default function DashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('')

  const { data: users = [] } = useUsers()
  const workerOptions = useMemo(
    () => [
      { value: '', label: 'Все исполнители' },
      ...users
        .filter((user) => isAssignableRole(user.role))
        .map((user) => ({ value: String(user.id), label: user.full_name || user.username })),
    ],
    [users],
  )

  const filters = { period, worker_id: selectedWorkerId ? Number(selectedWorkerId) : undefined }
  const { data, isLoading, isFetching, error, refetch } = useAnalytics(filters)
  const { data: repeats } = useRepeatMetrics(period)
  const activeTaskListUrl = buildTaskListUrl({
    statuses: ['NEW', 'IN_PROGRESS'],
    assigneeIds: selectedWorkerId ? [Number(selectedWorkerId)] : undefined,
  })

  const handleExport = async () => {
    try {
      await downloadAnalyticsReport(filters)
      toast.success('Отчёт формируется...')
    } catch (err) {
      toast.error('Не удалось сформировать отчёт')
      if (import.meta.env.DEV) console.error('Analytics export failed:', err)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Дашборд"
        description={
          data
            ? `${periodOptions.find((option) => option.value === period)?.label ?? ''} · ${data.sla.period.days} дн.`
            : 'Заявки, исполнители и сроки за период'
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => refetch()} isLoading={isFetching} title="Обновить">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(activeTaskListUrl)}>
              <ListChecks className="mr-1.5 h-4 w-4" />
              Открытые заявки
            </Button>
            <Button size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select label="Период" options={periodOptions} value={period} onChange={(value) => setPeriod(value as ReportPeriod)} />
        </div>
        <div className="w-60">
          <Select label="Исполнитель" options={workerOptions} value={selectedWorkerId} onChange={setSelectedWorkerId} />
        </div>
      </div>

      {isLoading ? (
        <QueryStatePanel state="loading" title="Загружаем аналитику" />
      ) : error || !data ? (
        <QueryStatePanel
          state="error"
          icon={BarChart3}
          title="Не удалось загрузить аналитику"
          description="Проверьте подключение к серверу и попробуйте обновить данные."
          onRetry={refetch}
          isRetrying={isFetching}
        />
      ) : (
        <>
          <KpiStrip data={data} repeats={repeats} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DynamicsCard data={data} />
            </div>
            <StructureCard data={data} />
          </div>
          <WorkersTable rows={workerRows(data, repeats)} />
          <RepeatsCard repeats={repeats} />
        </>
      )}
    </div>
  )
}

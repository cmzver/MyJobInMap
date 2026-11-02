import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { Archive, FileSpreadsheet, FileText } from 'lucide-react'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Select from '@/components/Select'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import { useActs, useActsSummary } from '@/hooks/useActs'
import { actsApi, type ActListParams, type ActStatus, type ActsSummary } from '@/api/acts'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError } from '@/utils/apiError'

const PAGE_SIZE = 50
const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  ...Object.entries(ACT_STATUS).map(([value, { label }]) => ({ value, label })),
]
const METHODS = [
  { key: 'cash', label: 'Наличные' },
  { key: 'card', label: 'Карта' },
  { key: 'transfer', label: 'Перевод' },
  { key: 'contract', label: 'По договору' },
] as const

/** Реестр актов и деньги по ним за период: способы оплаты и наличные у исполнителей. */
export default function ActsPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  // По умолчанию — текущий месяц: так сразу видно, сколько собрано и кем
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [archiveMonth, setArchiveMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [busy, setBusy] = useState<'excel' | 'zip' | null>(null)
  const [page, setPage] = useState(1)

  const filters: ActListParams = {
    status: status ? [status as ActStatus] : undefined,
    search: search.trim() || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }
  const query = useActs({ ...filters, page, size: PAGE_SIZE })
  const summary = useActsSummary(filters)
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }

  const download = async (kind: 'excel' | 'zip') => {
    setBusy(kind)
    try {
      if (kind === 'excel') await actsApi.downloadExcel(filters)
      else await actsApi.downloadArchive(archiveMonth)
    } catch (error) {
      showApiError(error, kind === 'excel' ? 'Не удалось выгрузить реестр' : 'Не удалось собрать архив')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Акты"
        description="Реестр актов и деньги по ним за период."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" isLoading={busy === 'excel'} onClick={() => download('excel')}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
            <div className="flex items-center gap-1">
              <input
                type="month"
                aria-label="Месяц архива"
                value={archiveMonth}
                onChange={(event) => setArchiveMonth(event.target.value)}
                className="field h-8 w-36"
              />
              <Button
                size="sm"
                variant="outline"
                isLoading={busy === 'zip'}
                disabled={!archiveMonth}
                title="PDF актов за месяц, сканы бумажных и реестр одним архивом"
                onClick={() => download('zip')}
              >
                <Archive className="mr-1.5 h-4 w-4" />
                Архив ZIP
              </Button>
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select label="Статус" options={STATUS_OPTIONS} value={status} onChange={resetPage(setStatus)} />
        </div>
        <div className="w-72">
          <Input
            label="Поиск"
            placeholder="Номер акта или заказчик"
            value={search}
            onChange={(event) => resetPage(setSearch)(event.target.value)}
          />
        </div>
        <div className="w-40">
          <Input label="С" type="date" value={dateFrom} onChange={(event) => resetPage(setDateFrom)(event.target.value)} />
        </div>
        <div className="w-40">
          <Input label="По" type="date" value={dateTo} onChange={(event) => resetPage(setDateTo)(event.target.value)} />
        </div>
      </div>

      {summary.data && <MoneyStrip summary={summary.data} />}
      {summary.data && summary.data.workers.length > 0 && <WorkersMoney summary={summary.data} />}

      {!query.data ? (
        <QueryStatePanel
          state={query.isError ? 'error' : 'loading'}
          onRetry={query.refetch}
          isRetrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Актов нет"
          description="За выбранный период актов нет. Акты оформляются в карточке заявки — блок «Акты»."
        />
      ) : (
        <Card flush title={`Реестр · ${query.data.total}`}>
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Заявка</th>
                <th>Заказчик</th>
                <th className="text-right">Сумма</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((act) => {
                const actStatus = ACT_STATUS[act.status]
                return (
                  <tr key={act.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{act.number}</td>
                    <td className="whitespace-nowrap">{formatDateOnly(act.created_at)}</td>
                    <td className="max-w-[22rem] truncate" title={act.address ?? undefined}>
                      {act.kind === 'summary' ? (
                        <Link
                          to={`/counterparties/${act.counterparty_id}`}
                          className="text-primary-600 hover:underline dark:text-primary-400"
                        >
                          Сводный · {act.counterparty_name} · {act.period}
                        </Link>
                      ) : act.task_id ? (
                        <Link to={`/tasks/${act.task_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                          {act.task_number}
                        </Link>
                      ) : (
                        act.task_number
                      )}
                      {act.address && <span className="text-gray-500 dark:text-gray-400"> · {act.address}</span>}
                    </td>
                    <td>{act.customer_name || '—'}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatRub(act.total_amount)}</td>
                    <td>
                      <Badge variant={actStatus.variant}>{actStatus.label}</Badge>
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          actsApi.openPdf(act.id).catch((error) => showApiError(error, 'Не удалось открыть PDF'))
                        }
                      >
                        PDF
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Назад
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {page} из {pages}
              </span>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Дальше
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

/** Полоса денег за период: выпущено, сумма и разбивка по способам оплаты. */
function MoneyStrip({ summary }: { summary: ActsSummary }) {
  const byMethod = new Map(summary.by_method.map((row) => [row.method, row]))
  const states = [
    summary.signed && `подписано ${summary.signed}`,
    summary.pending && `ждут ${summary.pending}`,
    summary.refused && `отказ ${summary.refused}`,
  ].filter(Boolean)
  return (
    <Card flush>
      <dl className="grid grid-cols-2 divide-gray-100 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x dark:divide-gray-700">
        <Cell label="Актов" value={String(summary.issued)} meta={states.join(' · ') || 'без аннулированных'} />
        <Cell label="Сумма" value={formatRub(summary.total)} meta="без аннулированных" strong />
        {METHODS.map(({ key, label }) => {
          const row = byMethod.get(key)
          return (
            <Cell
              key={key}
              label={label}
              value={row ? formatRub(row.amount) : '—'}
              meta={row ? `${row.count} акт.` : ' '}
              muted={!row}
            />
          )
        })}
      </dl>
    </Card>
  )
}

function Cell({
  label,
  value,
  meta,
  strong = false,
  muted = false,
}: {
  label: string
  value: string
  meta: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd
        className={
          muted
            ? 'mt-1 text-lg font-semibold text-gray-300 dark:text-gray-600'
            : `mt-1 truncate text-lg font-semibold tabular-nums ${strong ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'}`
        }
      >
        {value}
      </dd>
      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{meta}</p>
    </div>
  )
}

/** Кто сколько выпустил за период; «Наличные» — что исполнитель должен сдать. */
function WorkersMoney({ summary }: { summary: ActsSummary }) {
  return (
    <Card flush title="Наличные у исполнителей">
      <table className="data-table min-w-full">
        <thead>
          <tr>
            <th>Исполнитель</th>
            <th className="text-right">Актов</th>
            <th className="text-right">Наличные</th>
            <th className="text-right">Карта</th>
            <th className="text-right">Перевод</th>
            <th className="text-right">По договору</th>
            <th className="text-right">Всего</th>
          </tr>
        </thead>
        <tbody>
          {summary.workers.map((worker) => (
            <tr key={worker.name}>
              <td className="font-medium text-gray-900 dark:text-white">{worker.name}</td>
              <td className="text-right tabular-nums">{worker.acts}</td>
              <td className="whitespace-nowrap text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                {worker.cash ? formatRub(worker.cash) : '—'}
              </td>
              <td className="whitespace-nowrap text-right tabular-nums">{worker.card ? formatRub(worker.card) : '—'}</td>
              <td className="whitespace-nowrap text-right tabular-nums">
                {worker.transfer ? formatRub(worker.transfer) : '—'}
              </td>
              <td className="whitespace-nowrap text-right tabular-nums">
                {worker.contract ? formatRub(worker.contract) : '—'}
              </td>
              <td className="whitespace-nowrap text-right tabular-nums">{formatRub(worker.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

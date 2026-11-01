import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Select from '@/components/Select'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import { useActs } from '@/hooks/useActs'
import { actsApi, type ActStatus } from '@/api/acts'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError } from '@/utils/apiError'

const PAGE_SIZE = 50
const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  ...Object.entries(ACT_STATUS).map(([value, { label }]) => ({ value, label })),
]

/** Реестр актов организации. */
export default function ActsPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const query = useActs({
    status: status ? [status as ActStatus] : undefined,
    search: search.trim() || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    size: PAGE_SIZE,
  })
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Акты"
        description="Акты выполненных работ: оформленные, подписанные и аннулированные."
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
          description="Акты оформляются в карточке заявки — блок «Акты»."
        />
      ) : (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
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
                        {act.task_id ? (
                          <Link to={`/tasks/${act.task_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                            {act.task_number}
                          </Link>
                        ) : (
                          act.task_number
                        )}
                        {act.address && <span className="text-gray-500 dark:text-gray-400"> · {act.address}</span>}
                      </td>
                      <td>{act.customer_name || '—'}</td>
                      <td className="whitespace-nowrap text-right">{formatRub(act.total_amount)}</td>
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
          </div>
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
        </div>
      )}
    </div>
  )
}

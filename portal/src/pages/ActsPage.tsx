import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
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

      <Card compact>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Статус" options={STATUS_OPTIONS} value={status} onChange={resetPage(setStatus)} />
          <Input
            label="Поиск"
            placeholder="Номер акта или заказчик"
            value={search}
            onChange={(event) => resetPage(setSearch)(event.target.value)}
          />
          <Input label="С" type="date" value={dateFrom} onChange={(event) => resetPage(setDateFrom)(event.target.value)} />
          <Input label="По" type="date" value={dateTo} onChange={(event) => resetPage(setDateTo)(event.target.value)} />
        </div>
      </Card>

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
        <Card compact className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead>
                <tr className="text-left text-gray-600 dark:text-gray-300">
                  <th className="px-3 py-2 font-medium">Номер</th>
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium">Заявка</th>
                  <th className="px-3 py-2 font-medium">Заказчик</th>
                  <th className="px-3 py-2 text-right font-medium">Сумма</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {query.data.items.map((act) => {
                  const actStatus = ACT_STATUS[act.status]
                  return (
                    <tr key={act.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-900 dark:text-white">{act.number}</td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDateOnly(act.created_at)}</td>
                      <td className="min-w-[14rem] px-3 py-2">
                        {act.task_id ? (
                          <Link to={`/tasks/${act.task_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                            {act.task_number}
                          </Link>
                        ) : (
                          act.task_number
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">{act.address}</p>
                      </td>
                      <td className="px-3 py-2">{act.customer_name || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{formatRub(act.total_amount)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={actStatus.variant}>{actStatus.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
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
        </Card>
      )}
    </div>
  )
}

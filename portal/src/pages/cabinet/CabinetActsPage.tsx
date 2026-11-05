import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cabinetApi } from '@/api/cabinet'
import { cn } from '@/utils/cn'
import Button from '@/components/Button'
import Card from '@/components/Card'
import QueryStatePanel from '@/components/QueryStatePanel'
import { ActRow, EmptyLine } from './CabinetShared'

type Filter = 'all' | 'pending' | 'summary'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ждут подписи' },
  { value: 'summary', label: 'Сводные' },
]
const PAGE = 30

export default function CabinetActsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const params = {
    pending: filter === 'pending' || undefined,
    kind: filter === 'summary' ? ('summary' as const) : undefined,
    limit: PAGE,
    offset: page * PAGE,
  }
  const acts = useQuery({
    queryKey: ['cabinet', 'acts', params],
    queryFn: () => cabinetApi.acts(params),
    placeholderData: (previous) => previous,
  })
  const pending = useQuery({
    queryKey: ['cabinet', 'acts', 'pending-count'],
    queryFn: () => cabinetApi.acts({ pending: true, limit: 1 }),
  })
  const pages = Math.ceil((acts.data?.total ?? 0) / PAGE)

  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Акты</h1>
      <Card flush>
        <div className="flex border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-700">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => { setFilter(item.value); setPage(0) }}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium',
                  filter === item.value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                )}
              >
                {item.label}
                {item.value === 'pending' && (pending.data?.total ?? 0) > 0 && (
                  <span className="ml-1 rounded-full bg-orange-100 px-1.5 text-xs text-orange-800">{pending.data?.total}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        {acts.isPending ? (
          <QueryStatePanel state="loading" />
        ) : acts.isError ? (
          <QueryStatePanel state="error" onRetry={() => acts.refetch()} />
        ) : acts.data.items.length === 0 ? (
          <EmptyLine>{filter === 'pending' ? 'Все акты подписаны.' : 'Актов пока нет.'}</EmptyLine>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {acts.data.items.map((act) => <ActRow key={act.id} act={act} />)}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-2 text-sm dark:border-gray-700">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</Button>
            <span className="tabular-nums text-gray-500">{page + 1} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Дальше</Button>
          </div>
        )}
      </Card>
    </>
  )
}

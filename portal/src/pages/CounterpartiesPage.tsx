import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import CounterpartyFormModal from '@/components/counterparties/CounterpartyFormModal'
import { formatRub } from '@/components/acts/actLabels'
import { useCounterparties } from '@/hooks/useCounterparties'

/** Контрагенты — УК/ТСЖ: объекты, абонплата и сводный акт за месяц. */
export default function CounterpartiesPage() {
  const navigate = useNavigate()
  const [showInactive, setShowInactive] = useState(false)
  const [creating, setCreating] = useState(false)
  const query = useCounterparties(showInactive)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Контрагенты"
        description="Управляющие компании и ТСЖ: их объекты, абонплата и сводный акт за месяц."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Добавить
          </Button>
        }
      />

      {!query.data ? (
        <QueryStatePanel state={query.isError ? 'error' : 'loading'} onRetry={query.refetch} isRetrying={query.isFetching} />
      ) : query.data.length === 0 && !showInactive ? (
        <EmptyState
          icon={Building2}
          title="Контрагентов нет"
          description="Добавьте УК или ТСЖ, привяжите к ней объекты — и раз в месяц выпускайте сводный акт."
        />
      ) : (
        <Card
          flush
          title={`Контрагенты · ${query.data.length}`}
          action={
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              показать отключённых
            </label>
          }
        >
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Контрагент</th>
                <th>ИНН</th>
                <th>Договор</th>
                <th className="text-right">Объектов</th>
                <th className="text-right">Абонплата, мес</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((counterparty) => (
                <tr
                  key={counterparty.id}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  onClick={() => navigate(`/counterparties/${counterparty.id}`)}
                >
                  <td className="w-full min-w-[10rem] max-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {counterparty.name}
                      {!counterparty.is_active && <span className="font-normal text-gray-400"> · отключён</span>}
                    </p>
                    {counterparty.legal_name && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{counterparty.legal_name}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">{counterparty.inn || '—'}</td>
                  <td className="whitespace-nowrap">{counterparty.contract_number || '—'}</td>
                  <td className="text-right tabular-nums">{counterparty.address_count}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {counterparty.monthly_total ? formatRub(counterparty.monthly_total) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creating && (
        <CounterpartyFormModal
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/counterparties/${saved.id}`)}
        />
      )}
    </div>
  )
}

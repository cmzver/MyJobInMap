import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { operationsApi } from '@/api/operations'
import { useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import { showApiError } from '@/utils/apiError'
import Button from '@/components/Button'
import Card from '@/components/Card'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'


export default function MaterialsPage() {
  const user = useAuthStore((state) => state.user)
  const manager = user?.baseAccess !== 'worker'
  const [selectedUser, setSelectedUser] = useState(user?.id ?? 0)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('шт.')
  const [cost, setCost] = useState('0')
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [kind, setKind] = useState('receipt')
  const [reason, setReason] = useState('')
  const [operationId, setOperationId] = useState(() => crypto.randomUUID())
  const client = useQueryClient()
  const key = ['materials', user?.organizationId]
  const catalog = useQuery({ queryKey: key, queryFn: operationsApi.materials })
  const stocks = useQuery({ queryKey: [...key, 'stock', selectedUser], queryFn: () => operationsApi.stocks(selectedUser) })
  const users = useUsers({ enabled: manager })
  const create = useMutation({ mutationFn: operationsApi.createMaterial,
    onSuccess: () => { setName(''); client.invalidateQueries({ queryKey: key }) },
    onError: (error) => showApiError(error, 'Не удалось добавить материал') })
  const adjust = useMutation({ mutationFn: operationsApi.adjustStock,
    onSuccess: () => { setOperationId(crypto.randomUUID()); client.invalidateQueries({ queryKey: key }) },
    onError: (error) => showApiError(error, 'Не удалось изменить остаток') })
  const changed = () => setOperationId(crypto.randomUUID())
  const submit = (e: FormEvent) => {
    e.preventDefault(); adjust.mutate({ material_id: Number(materialId), user_id: selectedUser, quantity, kind, reason, operation_id: operationId })
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Материалы" description="Остатки у исполнителей. Расход фиксируется в карточке заявки." />

      <Card
        flush
        title="Остатки"
        action={
          manager && (
            <select
              aria-label="Исполнитель"
              value={selectedUser}
              className="field h-8 w-60"
              onChange={(e) => { setSelectedUser(Number(e.target.value)); changed() }}
            >
              {users.data?.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </select>
          )
        }
      >
        {stocks.isPending ? (
          <QueryStatePanel state="loading" />
        ) : stocks.isError ? (
          <QueryStatePanel state="error" onRetry={() => stocks.refetch()} />
        ) : stocks.data.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Материалы ещё не выданы.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Материал</th>
                <th className="w-40 text-right">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {stocks.data.map((stock) => (
                <tr key={stock.material_id}>
                  <td>{stock.name}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {Number(stock.quantity).toLocaleString('ru')} {stock.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {manager && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Добавить в справочник">
            <form
              onSubmit={(e) => { e.preventDefault(); create.mutate({ name, unit, unit_cost: cost }) }}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="min-w-[12rem] flex-1">
                <span className="field-label">Название</span>
                <input className="field" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="w-24">
                <span className="field-label">Единица</span>
                <input className="field" required maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
              <label className="w-32">
                <span className="field-label">Цена, ₽</span>
                <input className="field" required type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
              </label>
              <Button type="submit" isLoading={create.isPending}>Добавить</Button>
            </form>
          </Card>

          <Card title="Изменить остаток исполнителя">
            {catalog.isError && (
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                Справочник недоступен. <button type="button" className="underline" onClick={() => catalog.refetch()}>Повторить</button>
              </p>
            )}
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
              <label className="min-w-[12rem] flex-1">
                <span className="field-label">Материал</span>
                <select className="field" required value={materialId} onChange={(e) => { setMaterialId(e.target.value); changed() }}>
                  <option value="">Выберите материал</option>
                  {catalog.data?.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
              </label>
              <label className="w-48">
                <span className="field-label">Операция</span>
                <select className="field" value={kind} onChange={(e) => { setKind(e.target.value); changed() }}>
                  <option value="receipt">Выдать исполнителю</option>
                  <option value="write_off">Списать вне заявки</option>
                </select>
              </label>
              <label className="w-28">
                <span className="field-label">Количество</span>
                <input className="field" type="number" min="0.001" step="0.001" required value={quantity} onChange={(e) => { setQuantity(e.target.value); changed() }} />
              </label>
              <label className="min-w-[12rem] flex-1">
                <span className="field-label">Основание</span>
                <input className="field" maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); changed() }} />
              </label>
              <Button type="submit" isLoading={adjust.isPending} disabled={!materialId || !selectedUser}>Сохранить</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

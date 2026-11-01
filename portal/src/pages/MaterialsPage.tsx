import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { operationsApi } from '@/api/operations'
import { useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import { showApiError } from '@/utils/apiError'
import Button from '@/components/Button'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'

const field = 'w-full rounded-md border border-gray-300 bg-transparent p-2 text-sm dark:border-gray-600'

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
  return <div className="space-y-6">
    <PageHeader title="Материалы" description="Остатки у исполнителей. Расход фиксируется в карточке заявки." />
    {manager && <label className="block max-w-sm text-sm">Исполнитель<select value={selectedUser} className={field} onChange={(e) => { setSelectedUser(Number(e.target.value)); changed() }}>{users.data?.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}</select></label>}
    {stocks.isPending ? <QueryStatePanel state="loading" /> : stocks.isError ? <QueryStatePanel state="error" onRetry={() => stocks.refetch()} /> : <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Материал</th><th className="p-3">Остаток</th></tr></thead><tbody>{stocks.data.map((stock) => <tr key={stock.material_id} className="border-t border-gray-200 dark:border-gray-700"><td className="p-3">{stock.name}</td><td className="p-3">{Number(stock.quantity).toLocaleString('ru')} {stock.unit}</td></tr>)}</tbody></table>{stocks.data.length === 0 && <p className="p-4 text-sm text-gray-500">Материалы ещё не выданы.</p>}</div>}
    {manager && <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate({ name, unit, unit_cost: cost }) }} className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="font-semibold">Добавить в справочник</h2>
        <Input label="Название" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Единица измерения" required maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} />
        <Input label="Стоимость единицы, ₽" required type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        <Button type="submit" isLoading={create.isPending}>Добавить материал</Button>
      </form>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="font-semibold">Изменить остаток исполнителя</h2>
        {catalog.isError && <p role="alert">Справочник недоступен. <button type="button" onClick={() => catalog.refetch()}>Повторить</button></p>}
        <label className="block text-sm">Материал<select className={field} required value={materialId} onChange={(e) => { setMaterialId(e.target.value); changed() }}><option value="">Выберите материал</option>{catalog.data?.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></label>
        <label className="block text-sm">Операция<select className={field} value={kind} onChange={(e) => { setKind(e.target.value); changed() }}><option value="receipt">Выдать исполнителю</option><option value="write_off">Списать вне заявки</option></select></label>
        <Input label="Количество" type="number" min="0.001" step="0.001" required value={quantity} onChange={(e) => { setQuantity(e.target.value); changed() }} />
        <Input label="Основание" maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); changed() }} />
        <Button type="submit" isLoading={adjust.isPending} disabled={!materialId || !selectedUser}>Сохранить</Button>
      </form>
    </div>}
  </div>
}

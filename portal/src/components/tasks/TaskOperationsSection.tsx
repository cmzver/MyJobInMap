import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addressesApi } from '@/api/addresses'
import { operationsApi } from '@/api/operations'
import { materialsApi } from '@/api/materials'
import { useAuthStore } from '@/store/authStore'
import { showApiError } from '@/utils/apiError'
import Button from '@/components/Button'
import Card from '@/components/Card'
import type { Task, TaskDetail } from '@/types/task'

export default function TaskOperationsSection({ task }: { task: Task | TaskDetail }) {
  const user = useAuthStore((state) => state.user)
  const client = useQueryClient()
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [operationId, setOperationId] = useState(() => crypto.randomUUID())
  const key = ['task-materials', user?.organizationId, task.id]
  const movements = useQuery({ queryKey: key, queryFn: () => materialsApi.taskMaterials(task.id) })
  const stocks = useQuery({ queryKey: ['materials', user?.organizationId, 'stock', user?.id], queryFn: () => materialsApi.stocks() })
  const consume = useMutation({ mutationFn: () => materialsApi.consume(task.id, { material_id: Number(materialId), quantity, reason: '', operation_id: operationId }),
    onSuccess: () => { setOperationId(crypto.randomUUID()); client.invalidateQueries({ queryKey: key }); client.invalidateQueries({ queryKey: ['materials'] }); client.invalidateQueries({ queryKey: ['comments'] }) },
    onError: (error) => showApiError(error, 'Не удалось списать материал') })
  const submit = (e: FormEvent) => { e.preventDefault(); consume.mutate() }
  const equipment = useQuery({ queryKey: ['task-equipment', user?.organizationId, task.address_id],
    enabled: !!task.address_id, queryFn: () => addressesApi.getEquipment(task.address_id!) })
  const link = useMutation({ mutationFn: (id: number | null) => operationsApi.linkEquipment(task.id, id),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['tasks'] }); client.invalidateQueries({ queryKey: ['equipment-passport'] }) },
    onError: (error) => showApiError(error, 'Не удалось связать оборудование') })
  const canEdit = user?.baseAccess !== 'worker' || task.assigned_user_id === user?.id
  const total = movements.data?.reduce((sum, row) => sum + Number(row.total_cost), 0) ?? 0
  return (
    <Card compact title="Материалы и оборудование">
      <div className="space-y-3">
        {task.address_id && canEdit && (
          <label className="block max-w-sm">
            <span className="field-label">Оборудование заявки</span>
            <select
              aria-label="Оборудование заявки"
              value={task.equipment_id ?? ''}
              disabled={link.isPending}
              onChange={(e) => link.mutate(Number(e.target.value) || null)}
              className="field"
            >
              <option value="">Не указано</option>
              {equipment.data?.map((item) => <option key={item.id} value={item.id}>{item.name} {item.serial_number}</option>)}
            </select>
          </label>
        )}
        {task.equipment_id && (
          <Link to={`/equipment/${task.equipment_id}`} className="inline-block text-sm text-primary-600 hover:underline">
            Паспорт оборудования #{task.equipment_id}
          </Link>
        )}
        {movements.isError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Не удалось загрузить расход. <button type="button" className="underline" onClick={() => movements.refetch()}>Повторить</button>
          </p>
        ) : movements.isPending ? (
          <p role="status" className="text-sm text-gray-500">Загрузка расхода…</p>
        ) : movements.data.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {movements.data.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span className="text-gray-700 dark:text-gray-200">
                  {row.material_name}: {Math.abs(Number(row.quantity)).toLocaleString('ru')} {row.unit}
                </span>
                <span className="tabular-nums text-gray-900 dark:text-white">{Number(row.total_cost).toLocaleString('ru')} ₽</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 pt-1 text-gray-500 dark:text-gray-400">
              <span>Итого</span>
              <span className="tabular-nums">{total.toLocaleString('ru')} ₽</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Расхода по заявке нет.</p>
        )}
        {canEdit && (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3 pt-1">
            <label className="min-w-[14rem] max-w-md flex-1">
              <span className="field-label">Материал из своего запаса</span>
              <select
                required
                value={materialId}
                onChange={(e) => { setMaterialId(e.target.value); setOperationId(crypto.randomUUID()) }}
                className="field"
              >
                <option value="">Выберите материал</option>
                {stocks.data?.filter((s) => Number(s.quantity) > 0).map((s) => (
                  <option key={s.material_id} value={s.material_id}>{s.name} · остаток {Number(s.quantity)} {s.unit}</option>
                ))}
              </select>
            </label>
            <label className="w-24">
              <span className="field-label">Количество</span>
              <input
                className="field"
                required
                type="number"
                min="0.001"
                step="0.001"
                value={quantity}
                onChange={(e) => { setQuantity(e.target.value); setOperationId(crypto.randomUUID()) }}
              />
            </label>
            <Button type="submit" isLoading={consume.isPending} disabled={!materialId}>Записать расход</Button>
            <Link to="/materials" className="py-2 text-sm text-primary-600 hover:underline">Мои остатки</Link>
          </form>
        )}
      </div>
    </Card>
  )
}

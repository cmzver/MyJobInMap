import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { operationsApi, type MaintenancePlan } from '@/api/operations'
import { addressesApi } from '@/api/addresses'
import { useAddresses } from '@/hooks/useAddresses'
import { useUsers } from '@/hooks/useUsers'
import { showApiError } from '@/utils/apiError'
import PageHeader from '@/components/PageHeader'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import QueryStatePanel from '@/components/QueryStatePanel'
import { useAuthStore } from '@/store/authStore'

const initial = (): Omit<MaintenancePlan, 'id' | 'next_date'> => ({
  title: '', description: '', address_id: 0, equipment_id: null, assigned_user_id: null,
  priority: 'PLANNED', frequency: 'monthly', interval: 1, start_date: format(new Date(), 'yyyy-MM-dd'),
  end_date: null, excluded_dates: [], enabled: true,
})
const frequencyLabels = { daily: 'Дни', weekly: 'Недели', monthly: 'Месяцы' }

export default function MaintenancePage() {
  const user = useAuthStore((state) => state.user)
  const key = ['maintenance', user?.organizationId]
  const client = useQueryClient()
  const plans = useQuery({ queryKey: key, queryFn: operationsApi.plans })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<number>()
  const [form, setForm] = useState(initial)
  const [search, setSearch] = useState('')
  const [exceptions, setExceptions] = useState('')
  const [formError, setFormError] = useState('')
  const addresses = useAddresses({ search, size: 100 })
  const users = useUsers()
  const equipment = useQuery({ queryKey: ['maintenance-equipment', form.address_id], enabled: !!form.address_id,
    queryFn: () => addressesApi.getEquipment(form.address_id) })
  const save = useMutation({
    mutationFn: ({ data, id }: { data: Omit<MaintenancePlan, 'id' | 'next_date'>; id?: number }) => operationsApi.savePlan(data, id),
    onSuccess: () => { setOpen(false); client.invalidateQueries({ queryKey: key }) },
    onError: (error) => showApiError(error, 'Не удалось сохранить расписание'),
  })
  const edit = (plan?: MaintenancePlan) => {
    setEditing(plan?.id); setForm(plan ?? initial()); setExceptions(plan?.excluded_dates.join(', ') ?? '')
    setFormError(''); setOpen(true)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const dates = exceptions.split(/[\s,;]+/).filter(Boolean)
    if (dates.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))) {
      setFormError('Даты исключений: ГГГГ-ММ-ДД через запятую'); return
    }
    save.mutate({ data: { ...form, excluded_dates: dates }, id: editing })
  }
  return <div className="space-y-5">
    <PageHeader title="Плановое обслуживание" description="Заявки создаются автоматически в день обслуживания." actions={<Button size="sm" onClick={() => edit()}>Добавить расписание</Button>} />
    {plans.isPending ? <QueryStatePanel state="loading" /> : plans.isError ? <QueryStatePanel state="error" onRetry={() => plans.refetch()} /> : plans.data.length === 0 ? <QueryStatePanel state="empty" title="Расписаний пока нет" /> :
      <div className="data-table-wrap"><table className="data-table">
        <thead><tr>{['Работа', 'Адрес', 'Период', 'Следующая дата', 'Состояние', ''].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{plans.data.map((plan) => <tr key={plan.id}>
          <td>{plan.title}</td><td className="max-w-xs truncate"><Link className="text-primary-600 hover:underline" to={`/addresses/${plan.address_id}`}>{addresses.data?.items.find((address) => address.id === plan.address_id)?.address ?? `Адрес #${plan.address_id}`}</Link></td>
          <td>{frequencyLabels[plan.frequency]}: {plan.interval}</td><td>{plan.next_date}</td><td>{plan.enabled ? <Badge variant="success">Включено</Badge> : <Badge>Приостановлено</Badge>}</td>
          <td className="whitespace-nowrap text-right"><Button variant="ghost" size="sm" onClick={() => edit(plan)}>Изменить</Button><Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => save.mutate({ data: { ...plan, enabled: !plan.enabled }, id: plan.id })}>{plan.enabled ? 'Пауза' : 'Включить'}</Button></td>
        </tr>)}</tbody>
      </table></div>}
    <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Изменить расписание' : 'Новое расписание'}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Название работы" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input label="Поиск адреса" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="block"><span className="field-label">Адрес</span><select required className="field" value={form.address_id || ''} onChange={(e) => setForm({ ...form, address_id: Number(e.target.value), equipment_id: null })}><option value="">Выберите адрес</option>{addresses.data?.items.map((address) => <option key={address.id} value={address.id}>{address.address}</option>)}</select></label>
        <label className="block"><span className="field-label">Оборудование</span><select className="field" value={form.equipment_id ?? ''} onChange={(e) => setForm({ ...form, equipment_id: Number(e.target.value) || null })}><option value="">Весь объект</option>{equipment.data?.map((item) => <option key={item.id} value={item.id}>{item.name} {item.serial_number}</option>)}</select></label>
        <label className="block"><span className="field-label">Исполнитель</span><select className="field" value={form.assigned_user_id ?? ''} onChange={(e) => setForm({ ...form, assigned_user_id: Number(e.target.value) || null })}><option value="">Назначить позже</option>{users.data?.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="field-label">Повторять через</span><input required type="number" min="1" max="365" className="field" value={form.interval} onChange={(e) => setForm({ ...form, interval: Number(e.target.value) })} /></label><label className="block"><span className="field-label">Период</span><select className="field" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as MaintenancePlan['frequency'] })}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className="grid grid-cols-2 gap-3"><Input label="Начало" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /><Input label="Окончание" type="date" min={form.start_date} value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} /></div>
        <Input label="Исключить даты (ГГГГ-ММ-ДД через запятую)" value={exceptions} onChange={(e) => setExceptions(e.target.value)} />
        <label className="block"><span className="field-label">Описание</span><textarea className="field" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />Расписание включено</label>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Отмена</Button><Button type="submit" isLoading={save.isPending}>Сохранить</Button></div>
      </form>
    </Modal>
  </div>
}

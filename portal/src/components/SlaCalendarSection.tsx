import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { showApiError } from '@/utils/apiError'
import Button from '@/components/Button'
import Input from '@/components/Input'

interface Calendar {
  enabled: boolean
  weekdays: number[]
  start_time: string
  end_time: string
  excluded_dates: string[]
}
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const defaults: Calendar = { enabled: false, weekdays: [0, 1, 2, 3, 4], start_time: '09:00', end_time: '18:00', excluded_dates: [] }

export default function SlaCalendarSection({ organizationId }: { organizationId: number }) {
  const client = useQueryClient()
  const key = ['sla-calendar', organizationId]
  const query = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get<Calendar>('/sla-calendar', { params: { organization_id: organizationId } })).data })
  const [form, setForm] = useState(defaults)
  const [exceptions, setExceptions] = useState('')
  useEffect(() => { if (query.data) { setForm(query.data); setExceptions(query.data.excluded_dates.join(', ')) } }, [query.data])
  const save = useMutation({ mutationFn: (data: Calendar) => apiClient.put('/sla-calendar', data, { params: { organization_id: organizationId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }), onError: (error) => showApiError(error, 'Не удалось сохранить календарь') })
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ ...form, excluded_dates: exceptions.split(/[\s,;]+/).filter(Boolean) }) }
  return <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
    <h2 className="font-semibold">Рабочее время уведомлений SLA</h2>
    <p className="text-sm text-gray-500">Рабочие часы действуют в часовом поясе обслуживания. Напоминания вне рабочих часов дождутся следующего рабочего окна. Аварийные не ждут рабочего окна. Календарь не изменяет сроки заявок.</p>
    {query.isError && <p role="alert" className="text-sm text-red-600">Не удалось загрузить календарь. <button type="button" onClick={() => query.refetch()}>Повторить</button></p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />Использовать рабочий календарь</label>
    <fieldset disabled={!form.enabled || query.isPending || query.isError} className="space-y-4 disabled:opacity-60">
      <legend className="sr-only">Рабочие дни и часы</legend>
      <div className="flex flex-wrap gap-4">{weekdays.map((name, day) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.weekdays.includes(day)} onChange={(e) => setForm({ ...form, weekdays: e.target.checked ? [...form.weekdays, day] : form.weekdays.filter((v) => v !== day) })} />{name}</label>)}</div>
      <div className="grid max-w-sm grid-cols-2 gap-3"><Input label="Начало" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /><Input label="Окончание" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
      <Input label="Нерабочие даты (ГГГГ-ММ-ДД через запятую)" value={exceptions} onChange={(e) => setExceptions(e.target.value)} />
    </fieldset>
    <Button type="submit" isLoading={save.isPending} disabled={query.isPending || query.isError}>Сохранить календарь</Button>
  </form>
}

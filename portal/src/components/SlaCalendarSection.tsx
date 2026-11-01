import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { showApiError } from '@/utils/apiError'
import Button from '@/components/Button'
import { CalendarClock } from 'lucide-react'
import { SettingsCard } from '@/components/settings/SettingsSection'

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
  return (
    <SettingsCard
      title="Рабочее время уведомлений"
      icon={CalendarClock}
      description="Напоминания о сроках вне рабочих часов ждут следующего рабочего окна; аварийные не ждут. Сроки заявок календарь не меняет."
    >
      <form onSubmit={submit} className="space-y-4">
        {query.isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Не удалось загрузить календарь. <button type="button" className="underline" onClick={() => query.refetch()}>Повторить</button>
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Учитывать рабочий календарь
        </label>
        <fieldset disabled={!form.enabled || query.isPending || query.isError} className="space-y-4 disabled:opacity-60">
          <legend className="sr-only">Рабочие дни и часы</legend>
          <div>
            <span className="field-label">Рабочие дни</span>
            <div className="flex flex-wrap gap-1.5">
              {weekdays.map((name, day) => {
                const on = form.weekdays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, weekdays: on ? form.weekdays.filter((v) => v !== day) : [...form.weekdays, day] })}
                    className={`h-8 w-10 rounded-lg border text-sm ${on ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="w-32">
              <span className="field-label">Начало</span>
              <input className="field" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </label>
            <label className="w-32">
              <span className="field-label">Окончание</span>
              <input className="field" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </label>
            <label className="min-w-[16rem] flex-1">
              <span className="field-label">Нерабочие даты</span>
              <input className="field" placeholder="ГГГГ-ММ-ДД через запятую" value={exceptions} onChange={(e) => setExceptions(e.target.value)} />
            </label>
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" size="sm" isLoading={save.isPending} disabled={query.isPending || query.isError}>
            Сохранить календарь
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}

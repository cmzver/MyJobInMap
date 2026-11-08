import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Edit, FileSpreadsheet, Layers, Pause, Play, Plus, Search } from 'lucide-react'
import {
  operationsApi,
  type MaintenancePlan,
  type ScheduleCell,
  type ScheduleFilters,
} from '@/api/operations'
import { addressesApi } from '@/api/addresses'
import { useAddresses } from '@/hooks/useAddresses'
import { useCounterparties } from '@/hooks/useCounterparties'
import { useUsers } from '@/hooks/useUsers'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { cn } from '@/utils/cn'
import PageHeader from '@/components/PageHeader'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import QueryStatePanel from '@/components/QueryStatePanel'
import { useAuthStore } from '@/store/authStore'

type PlanDraft = Omit<MaintenancePlan, 'id' | 'next_date'>

const initial = (): PlanDraft => ({
  title: '', description: '', address_id: 0, equipment_id: null, assigned_user_id: null,
  priority: 'PLANNED', frequency: 'monthly', interval: 1, start_date: format(new Date(), 'yyyy-MM-dd'),
  end_date: null, excluded_dates: [], enabled: true,
})
const frequencyLabels = { daily: 'Дни', weekly: 'Недели', monthly: 'Месяцы' }
const EVERY: Record<string, [string, string]> = {
  monthly: ['каждый месяц', 'мес'],
  weekly: ['каждую неделю', 'нед'],
  daily: ['каждый день', 'дн'],
}
const everyLabel = (frequency: string, interval: number) => {
  const [single, unit] = EVERY[frequency] ?? ['каждый месяц', 'мес']
  return interval === 1 ? single : `раз в ${interval} ${unit}`
}

type MarkVariant = 'success' | 'warning' | 'danger' | 'gray'
const CELL_MARKS: { key: keyof Omit<ScheduleCell, 'month'>; mark: string; title: string; variant: MarkVariant; className?: string }[] = [
  { key: 'done', mark: '✓', title: 'Выполнено', variant: 'success' },
  { key: 'open', mark: '●', title: 'В работе', variant: 'warning' },
  { key: 'overdue', mark: '!', title: 'Просрочено', variant: 'danger' },
  { key: 'planned', mark: '○', title: 'Запланировано', variant: 'gray', className: 'border-gray-300 bg-transparent text-gray-500 dark:border-gray-600' },
  { key: 'cancelled', mark: '×', title: 'Отменено', variant: 'gray', className: 'text-gray-500' },
]

/** Регламентное ТО: сетка «регламент × месяц», массовые регламенты и отчёт. */
export default function MaintenancePage() {
  const user = useAuthStore((state) => state.user)
  const client = useQueryClient()
  const plansKey = ['maintenance', user?.organizationId]
  const plans = useQuery({ queryKey: plansKey, queryFn: operationsApi.plans })
  const counterparties = useCounterparties()
  const users = useUsers()

  // Окно по умолчанию: два прошлых месяца, текущий и три вперёд
  const [monthFrom, setMonthFrom] = useState(() => format(subMonths(startOfMonth(new Date()), 2), 'yyyy-MM'))
  const [months, setMonths] = useState(6)
  const [counterpartyId, setCounterpartyId] = useState(0)
  const [assigneeId, setAssigneeId] = useState(0)
  const filters: ScheduleFilters = {
    month_from: monthFrom,
    months,
    counterparty_id: counterpartyId || undefined,
    assigned_user_id: assigneeId || undefined,
  }
  const grid = useQuery({
    queryKey: ['maintenance-schedule', user?.organizationId, filters],
    queryFn: () => operationsApi.schedule(filters),
    enabled: /^\d{4}-\d{2}$/.test(monthFrom),
  })
  const refresh = () => {
    client.invalidateQueries({ queryKey: plansKey })
    client.invalidateQueries({ queryKey: ['maintenance-schedule'] })
  }

  const [editing, setEditing] = useState<MaintenancePlan | 'new' | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [reportMonth, setReportMonth] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM'))
  const [reporting, setReporting] = useState(false)
  const toggle = useMutation({
    mutationFn: (plan: MaintenancePlan) => operationsApi.savePlan({ ...plan, enabled: !plan.enabled }, plan.id),
    onSuccess: refresh,
    onError: (error) => showApiError(error, 'Не удалось изменить расписание'),
  })
  const currentMonth = format(new Date(), 'yyyy-MM')
  const planById = useMemo(() => new Map((plans.data ?? []).map((plan) => [plan.id, plan])), [plans.data])

  const report = async () => {
    setReporting(true)
    try {
      await operationsApi.downloadReport(reportMonth, counterpartyId || undefined)
    } catch (error) {
      showApiError(error, 'Не удалось выгрузить отчёт')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Плановое обслуживание"
        description="Регламенты ТО по объектам: заявки создаются сами в день обслуживания."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <input
                type="month"
                aria-label="Месяц отчёта"
                value={reportMonth}
                onChange={(event) => setReportMonth(event.target.value)}
                className="field h-8 w-36"
              />
              <Button size="sm" variant="outline" isLoading={reporting} disabled={!reportMonth} onClick={report} title="Выезды и выполнение по объектам за месяц">
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                Отчёт
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              <Layers className="mr-1.5 h-4 w-4" />
              На несколько объектов
            </Button>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="mr-1.5 h-4 w-4" />
              Регламент
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="w-40">
          <span className="field-label">С месяца</span>
          <input type="month" className="field" value={monthFrom} onChange={(event) => setMonthFrom(event.target.value)} />
        </label>
        <label className="w-32">
          <span className="field-label">Месяцев</span>
          <select className="field" value={months} onChange={(event) => setMonths(Number(event.target.value))}>
            {[3, 6, 12].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="w-60">
          <span className="field-label">Контрагент</span>
          <select className="field" value={counterpartyId} onChange={(event) => setCounterpartyId(Number(event.target.value))}>
            <option value={0}>Все</option>
            {counterparties.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="w-56">
          <span className="field-label">Исполнитель</span>
          <select className="field" value={assigneeId} onChange={(event) => setAssigneeId(Number(event.target.value))}>
            <option value={0}>Все</option>
            {users.data?.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </select>
        </label>
      </div>

      {!grid.data ? (
        <QueryStatePanel state={grid.isError ? 'error' : 'loading'} onRetry={grid.refetch} isRetrying={grid.isFetching} />
      ) : grid.data.rows.length === 0 ? (
        <QueryStatePanel
          state="empty"
          title="Регламентов нет"
          description="Добавьте регламент на объект или сразу на все объекты управляющей компании."
        />
      ) : (
        <Card flush title={`Регламенты · ${grid.data.rows.length}`}>
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Регламент</th>
                {grid.data.months.map((month) => (
                  <th
                    key={month}
                    className={cn('w-20 text-center', month === currentMonth && 'text-primary-600 dark:text-primary-400')}
                  >
                    {monthLabel(month)}
                  </th>
                ))}
                <th className="w-16" aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {grid.data.rows.map((row) => {
                const plan = planById.get(row.plan_id)
                return (
                  <tr key={row.plan_id} className={cn(!row.enabled && 'opacity-60')}>
                    <td className="w-full min-w-[10rem] max-w-0">
                      <p className="truncate font-medium text-gray-900 dark:text-white" title={row.title}>
                        {row.title}
                        {!row.enabled && <span className="font-normal text-gray-400"> · пауза</span>}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        <Link to={`/addresses/${row.address_id}`} className="hover:text-primary-600 hover:underline">{row.address}</Link>
                        {[row.counterparty_name, row.assigned_user_name ?? 'без исполнителя', everyLabel(row.frequency, row.interval)]
                          .filter(Boolean)
                          .map((part) => ` · ${part}`)
                          .join('')}
                      </p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.month} className="text-center">
                        <CellMarks cell={cell} />
                      </td>
                    ))}
                    <td>
                      <div className="flex justify-end gap-0.5">
                        <RowIcon title="Изменить" disabled={!plan} onClick={() => plan && setEditing(plan)}>
                          <Edit className="h-3.5 w-3.5" />
                        </RowIcon>
                        <RowIcon
                          title={row.enabled ? 'Пауза' : 'Включить'}
                          disabled={!plan || toggle.isPending}
                          onClick={() => plan && toggle.mutate(plan)}
                        >
                          {row.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </RowIcon>
                      </div>
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <td className="eyebrow">Итого</td>
                {grid.data.totals.map((cell) => (
                  <td key={cell.month} className="text-center"><CellMarks cell={cell} /></td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {CELL_MARKS.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <Mark variant={item.variant} className={item.className}>{item.mark}</Mark>
                {item.title}
              </span>
            ))}
          </div>
        </Card>
      )}

      {editing && (
        <PlanModal
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
      {bulkOpen && (
        <BulkModal
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function monthLabel(month: string): string {
  const day = parseISO(`${month}-01`)
  const label = format(day, 'LLL', { locale: ru }).replace('.', '')
  return day.getMonth() === 0 ? `${label} ${format(day, 'yy')}` : label
}

function Mark({ variant, className, children }: { variant: MarkVariant; className?: string; children: ReactNode }) {
  return (
    <Badge variant={variant} className={cn('min-w-5 justify-center px-1 text-[11px] font-semibold tabular-nums', className)}>
      {children}
    </Badge>
  )
}

function CellMarks({ cell }: { cell: ScheduleCell }) {
  const marks = CELL_MARKS.filter((item) => (cell[item.key] ?? 0) > 0)
  if (marks.length === 0) return <span className="text-gray-300 dark:text-gray-600">·</span>
  return (
    <span className="inline-flex flex-wrap justify-center gap-0.5">
      {marks.map((item) => {
        const count = cell[item.key] ?? 0
        return (
          <span key={item.key} title={`${item.title}: ${count}`}>
            <Mark variant={item.variant} className={item.className}>{count > 1 ? `${item.mark}${count}` : item.mark}</Mark>
          </span>
        )
      })}
    </span>
  )
}

function RowIcon({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-gray-700 dark:hover:text-gray-200"
    >
      {children}
    </button>
  )
}

/** Общие поля регламента: что, как часто, с какого числа, кто. */
function ScheduleFields({
  form,
  setForm,
  exceptions,
  setExceptions,
}: {
  form: Pick<PlanDraft, 'title' | 'description' | 'assigned_user_id' | 'frequency' | 'interval' | 'start_date' | 'end_date' | 'enabled'>
  setForm: (patch: Partial<PlanDraft>) => void
  exceptions: string
  setExceptions: (value: string) => void
}) {
  const users = useUsers()
  return (
    <>
      <Input label="Название работы" required maxLength={200} value={form.title} onChange={(e) => setForm({ title: e.target.value })} />
      <label className="block">
        <span className="field-label">Исполнитель</span>
        <select className="field" value={form.assigned_user_id ?? ''} onChange={(e) => setForm({ assigned_user_id: Number(e.target.value) || null })}>
          <option value="">Назначить позже</option>
          {users.data?.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">Повторять через</span>
          <input required type="number" min="1" max="365" className="field" value={form.interval} onChange={(e) => setForm({ interval: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="field-label">Период</span>
          <select className="field" value={form.frequency} onChange={(e) => setForm({ frequency: e.target.value as MaintenancePlan['frequency'] })}>
            {Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Начало" type="date" required value={form.start_date} onChange={(e) => setForm({ start_date: e.target.value })} />
        <Input label="Окончание" type="date" min={form.start_date} value={form.end_date ?? ''} onChange={(e) => setForm({ end_date: e.target.value || null })} />
      </div>
      <Input label="Исключить даты (ГГГГ-ММ-ДД через запятую)" value={exceptions} onChange={(e) => setExceptions(e.target.value)} />
      <label className="block">
        <span className="field-label">Описание</span>
        <textarea className="field" rows={2} maxLength={2000} value={form.description} onChange={(e) => setForm({ description: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ enabled: e.target.checked })} />
        Расписание включено
      </label>
    </>
  )
}

function parseExceptions(value: string): string[] | null {
  const dates = value.split(/[\s,;]+/).filter(Boolean)
  return dates.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) ? null : dates
}

/** Регламент на один объект (можно на конкретное оборудование). */
function PlanModal({ plan, onClose, onSaved }: { plan: MaintenancePlan | null; onClose: () => void; onSaved: () => void }) {
  const [form, setFormState] = useState<PlanDraft>(() => plan ?? initial())
  const setForm = (patch: Partial<PlanDraft>) => setFormState((current) => ({ ...current, ...patch }))
  const [search, setSearch] = useState('')
  const [exceptions, setExceptions] = useState(plan?.excluded_dates.join(', ') ?? '')
  const [formError, setFormError] = useState('')
  const addresses = useAddresses({ search: search.trim() || undefined, size: 100 })
  const equipment = useQuery({
    queryKey: ['maintenance-equipment', form.address_id],
    enabled: !!form.address_id,
    queryFn: () => addressesApi.getEquipment(form.address_id),
  })
  const save = useMutation({
    mutationFn: (data: PlanDraft) => operationsApi.savePlan(data, plan?.id),
    onSuccess: onSaved,
    onError: (error) => showApiError(error, 'Не удалось сохранить расписание'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const dates = parseExceptions(exceptions)
    if (!dates) {
      setFormError('Даты исключений: ГГГГ-ММ-ДД через запятую')
      return
    }
    save.mutate({ ...form, excluded_dates: dates })
  }
  const addressOptions = addresses.data?.items ?? []
  return (
    <Modal isOpen onClose={onClose} title={plan ? 'Изменить регламент' : 'Новый регламент'}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Поиск адреса" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="block">
          <span className="field-label">Адрес</span>
          <select required className="field" value={form.address_id || ''} onChange={(e) => setForm({ address_id: Number(e.target.value), equipment_id: null })}>
            <option value="">Выберите адрес</option>
            {plan && !addressOptions.some((address) => address.id === plan.address_id) && (
              <option value={plan.address_id}>Текущий объект</option>
            )}
            {addressOptions.map((address) => <option key={address.id} value={address.id}>{address.address}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Оборудование</span>
          <select className="field" value={form.equipment_id ?? ''} onChange={(e) => setForm({ equipment_id: Number(e.target.value) || null })}>
            <option value="">Весь объект</option>
            {equipment.data?.map((item) => <option key={item.id} value={item.id}>{item.name} {item.serial_number}</option>)}
          </select>
        </label>
        <ScheduleFields form={form} setForm={setForm} exceptions={exceptions} setExceptions={setExceptions} />
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Отмена</Button>
          <Button type="submit" isLoading={save.isPending}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Один регламент на много объектов: все объекты УК или выбранные. */
function BulkModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setFormState] = useState<PlanDraft>(initial)
  const setForm = (patch: Partial<PlanDraft>) => setFormState((current) => ({ ...current, ...patch }))
  const [exceptions, setExceptions] = useState('')
  const [formError, setFormError] = useState('')
  const [target, setTarget] = useState<'counterparty' | 'addresses'>('counterparty')
  const [counterpartyId, setCounterpartyId] = useState(0)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const counterparties = useCounterparties()
  const addresses = useAddresses({ search: search.trim() || undefined, size: 100 })
  const save = useMutation({
    mutationFn: operationsApi.bulkPlans,
    onSuccess: (result) => {
      showApiSuccess(
        `Создано регламентов: ${result.created}` +
          (result.skipped.length ? `; пропущено (уже есть): ${result.skipped.length}` : ''),
      )
      onSaved()
    },
    onError: (error) => showApiError(error, 'Не удалось создать регламенты'),
  })
  const toggle = (id: number) =>
    setSelected((value) => {
      const next = new Set(value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const dates = parseExceptions(exceptions)
    if (!dates) {
      setFormError('Даты исключений: ГГГГ-ММ-ДД через запятую')
      return
    }
    const { title, description, assigned_user_id, priority, frequency, interval, start_date, end_date, enabled } = form
    save.mutate({
      title, description, assigned_user_id, priority, frequency, interval, start_date, end_date, enabled,
      excluded_dates: dates,
      ...(target === 'counterparty' ? { counterparty_id: counterpartyId, address_ids: [] } : { address_ids: [...selected] }),
    })
  }
  const ready = target === 'counterparty' ? counterpartyId > 0 : selected.size > 0
  return (
    <Modal isOpen onClose={onClose} title="Регламент на несколько объектов" size="lg">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={target === 'counterparty'} onChange={() => setTarget('counterparty')} />
            Все объекты контрагента
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={target === 'addresses'} onChange={() => setTarget('addresses')} />
            Выбрать объекты
          </label>
        </div>
        {target === 'counterparty' ? (
          <label className="block">
            <span className="field-label">Контрагент</span>
            <select required className="field" value={counterpartyId} onChange={(e) => setCounterpartyId(Number(e.target.value))}>
              <option value={0}>Выберите</option>
              {counterparties.data?.map((item) => (
                <option key={item.id} value={item.id}>{item.name} — объектов: {item.address_count}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input aria-label="Поиск по адресу" className="field pl-9" placeholder="Поиск по адресу" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {(addresses.data?.items ?? []).map((address) => (
                <li key={address.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <input type="checkbox" checked={selected.has(address.id)} onChange={() => toggle(address.id)} />
                    <span className="truncate">{address.address}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">Выбрано: {selected.size}</p>
          </div>
        )}
        <ScheduleFields form={form} setForm={setForm} exceptions={exceptions} setExceptions={setExceptions} />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          На каждом объекте появится свой регламент. Где регламент с таким названием уже есть — объект пропускается.
        </p>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={!ready} isLoading={save.isPending}>Создать</Button>
        </div>
      </form>
    </Modal>
  )
}


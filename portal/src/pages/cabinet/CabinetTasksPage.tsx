import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, Search } from 'lucide-react'
import { cabinetApi, type TaskFilters } from '@/api/cabinet'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { cn } from '@/utils/cn'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import QueryStatePanel from '@/components/QueryStatePanel'
import Select from '@/components/Select'
import Textarea from '@/components/Textarea'
import { EmptyLine, TaskStatusBadge } from './CabinetShared'

const FILTERS: { value: TaskFilters['status']; label: string }[] = [
  { value: 'open', label: 'В работе' },
  { value: 'done', label: 'Закрытые' },
  { value: 'all', label: 'Все' },
]
const PAGE = 30

export default function CabinetTasksPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as TaskFilters['status']) || 'open'
  const addressId = Number(params.get('address')) || undefined
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => { setTerm(search.trim()); setPage(0) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const filters: TaskFilters = { status, address_id: addressId, search: term || undefined, limit: PAGE, offset: page * PAGE }
  const tasks = useQuery({
    queryKey: ['cabinet', 'tasks', filters],
    queryFn: () => cabinetApi.tasks(filters),
    placeholderData: (previous) => previous,
  })
  const objects = useQuery({ queryKey: ['cabinet', 'objects'], queryFn: cabinetApi.objects })
  const pages = Math.ceil((tasks.data?.total ?? 0) / PAGE)
  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(0)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-gray-900 dark:text-white">Заявки</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Новая заявка
        </Button>
      </div>

      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-700">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setFilter('status', filter.value === 'open' ? undefined : filter.value)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium',
                  status === filter.value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {(objects.data?.length ?? 0) > 1 && (
            <select
              aria-label="Объект"
              className="field h-8 w-full sm:w-64"
              value={addressId ?? ''}
              onChange={(event) => setFilter('address', event.target.value || undefined)}
            >
              <option value="">Все объекты</option>
              {objects.data?.map((object) => (
                <option key={object.id} value={object.id}>{object.address}</option>
              ))}
            </select>
          )}
          <div className="relative w-full sm:ml-auto sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Поиск"
              placeholder="Номер, адрес, текст"
              className="field h-8 pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {tasks.isPending ? (
          <QueryStatePanel state="loading" />
        ) : tasks.isError ? (
          <QueryStatePanel state="error" onRetry={() => tasks.refetch()} />
        ) : tasks.data.items.length === 0 ? (
          <EmptyLine>{status === 'open' ? 'Открытых заявок нет.' : 'Заявок не найдено.'}</EmptyLine>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {tasks.data.items.map((task) => (
              <li key={task.id}>
                <Link to={`/client/tasks/${task.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {task.priority === 'URGENT' || task.priority === 'EMERGENCY' ? (
                        <AlertTriangle className="mr-1 inline h-4 w-4 text-red-500" aria-label="Срочная" />
                      ) : null}
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {task.number} · {task.address}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <TaskStatusBadge status={task.status} label={task.status_label} />
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {task.completed_at
                        ? `закрыта ${formatDateOnly(task.completed_at)}`
                        : task.planned_date
                          ? `план ${formatDateOnly(task.planned_date)}`
                          : formatDateOnly(task.created_at)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
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

      {creating && <NewTaskModal defaultAddressId={addressId} onClose={() => setCreating(false)} />}
    </>
  )
}

function NewTaskModal({ defaultAddressId, onClose }: { defaultAddressId?: number; onClose: () => void }) {
  const objects = useQuery({ queryKey: ['cabinet', 'objects'], queryFn: cabinetApi.objects })
  const client = useQueryClient()
  const navigate = useNavigate()
  const [addressId, setAddressId] = useState(defaultAddressId ? String(defaultAddressId) : '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [apartment, setApartment] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [urgent, setUrgent] = useState(false)
  const only = objects.data?.length === 1 ? String(objects.data[0]?.id ?? '') : ''
  const selected = addressId || only

  const create = useMutation({
    mutationFn: () =>
      cabinetApi.createTask({
        address_id: Number(selected),
        title: title.trim(),
        description: description.trim(),
        apartment: apartment.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        urgent,
      }),
    onSuccess: (task) => {
      showApiSuccess(`Заявка ${task.number} принята`)
      client.invalidateQueries({ queryKey: ['cabinet'] })
      onClose()
      navigate(`/client/tasks/${task.id}`)
    },
    onError: (error) => showApiError(error, 'Не удалось отправить заявку'),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Modal isOpen onClose={onClose} title="Новая заявка">
      {objects.data?.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          К вашему контрагенту не привязано ни одного объекта — обратитесь в обслуживающую организацию.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Select
            label="Объект"
            placeholder="Выберите объект"
            required
            options={(objects.data ?? []).map((object) => ({ value: String(object.id), label: object.address }))}
            value={selected}
            onChange={setAddressId}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Input
              label="Что случилось"
              required
              minLength={3}
              maxLength={200}
              placeholder="Не открывается дверь подъезда"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input label="Кв. / подъезд" maxLength={20} value={apartment} onChange={(event) => setApartment(event.target.value)} />
          </div>
          <Textarea
            label="Подробности"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Контакт на месте" placeholder="По умолчанию — вы" value={contactName} onChange={(event) => setContactName(event.target.value)} />
            <Input label="Телефон" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={urgent}
              onChange={(event) => setUrgent(event.target.checked)}
            />
            Срочно — жильцы не могут попасть домой, угроза безопасности
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
            <Button type="submit" isLoading={create.isPending} disabled={!selected || title.trim().length < 3}>
              Отправить
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, Navigation, Phone } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { operationsApi } from '@/api/operations'
import { useUpdateTaskStatus } from '@/hooks/useTasks'
import { useAuthStore } from '@/store/authStore'
import { showApiError } from '@/utils/apiError'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import QueryStatePanel from '@/components/QueryStatePanel'

export default function MyDayPage() {
  const [day, setDay] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const user = useAuthStore((state) => state.user)
  const client = useQueryClient()
  const key = ['my-day', user?.organizationId, user?.id, day]
  const query = useQuery({ queryKey: key, queryFn: () => operationsApi.myDay(day) })
  const status = useUpdateTaskStatus()
  const route = useMutation({
    mutationFn: (ids: number[]) => operationsApi.saveRoute(day, ids),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error) => showApiError(error, 'Не удалось сохранить порядок'),
  })
  const move = (index: number, shift: number) => {
    const ids = (query.data?.tasks ?? []).map((task) => task.id)
    const target = index + shift
    if (target < 0 || target >= ids.length) return
    const current = ids[index]
    const next = ids[target]
    if (current === undefined || next === undefined) return
    ids[index] = next
    ids[target] = current
    route.mutate(ids)
  }
  return <div className="space-y-5">
    <PageHeader title="Мой день" description="Открытые заявки на выбранный день, включая просроченные и без плановой даты." />
    <label className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Дата</span>
      <input aria-label="Дата маршрута" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="field w-44" />
    </label>
    {query.isPending ? <QueryStatePanel state="loading" /> : query.isError ? <QueryStatePanel state="error" onRetry={() => query.refetch()} /> : query.data.tasks.length === 0 ? <QueryStatePanel state="empty" title="На этот день заявок нет" /> :
      <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
        {query.data.tasks.map((task, index) => <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <span className="w-6 text-sm text-gray-500">{index + 1}</span>
          <div className="min-w-48 flex-1">
            <Link to={`/tasks/${task.id}`} className="font-medium text-primary-600 hover:underline">{task.task_number} · {task.title}</Link>
            <p className="truncate text-sm text-gray-600 dark:text-gray-300" title={task.raw_address}>
              {task.raw_address}
              {task.planned_date && <span className="text-gray-500"> · план {task.planned_date.slice(0, 16).replace('T', ' ')}</span>}
            </p>
          </div>
          <StatusBadge status={task.status} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" aria-label={`Поднять заявку ${task.task_number}`} disabled={index === 0 || route.isPending} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" aria-label={`Опустить заявку ${task.task_number}`} disabled={index === query.data.tasks.length - 1 || route.isPending} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <a className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700" href={`https://yandex.ru/maps/?text=${encodeURIComponent(task.raw_address)}${task.lat && task.lon ? `&rtext=~${task.lat},${task.lon}&rtt=auto` : ''}`} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" />Маршрут</a>
            {task.customer_phone && <a className="inline-flex h-8 items-center gap-1 px-2 text-sm text-gray-700 dark:text-gray-200" href={`tel:${task.customer_phone.replace(/[^+\d]/g, '')}`}><Phone className="h-4 w-4" />Позвонить</a>}
            {task.status === 'NEW' && <Button size="sm" disabled={status.isPending} onClick={() => status.mutate({ id: task.id, status: 'IN_PROGRESS' }, {
              onSuccess: () => { client.invalidateQueries({ queryKey: key }); toast.success('Работа начата') },
              onError: (error) => showApiError(error, 'Не удалось начать работу'),
            })}>Начать</Button>}
          </div>
        </li>)}
      </ol>}
  </div>
}

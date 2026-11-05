import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Phone, Send } from 'lucide-react'
import apiClient from '@/api/client'
import type { components } from '@/types/api.generated'
import Spinner from '@/components/Spinner'
import { formatDateOnly, formatDateTime } from '@/utils/dateFormat'
import { cn } from '@/utils/cn'
import PublicShell, { PublicCard } from './PublicShell'

type PublicTask = components['schemas']['PublicTaskView']

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  IN_PROGRESS: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  DONE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}
// Шаги для заявителя: принята → в работе → выполнена
const STEPS = [
  { status: 'NEW', label: 'Принята' },
  { status: 'IN_PROGRESS', label: 'В работе' },
  { status: 'DONE', label: 'Выполнена' },
]

/** Статус заявки для заявителя — по ссылке, без входа. */
export default function PublicTaskPage() {
  const { token = '' } = useParams<{ token: string }>()
  const query = useQuery({
    queryKey: ['public-task', token],
    queryFn: async () => (await apiClient.get<PublicTask>(`/public/tasks/${encodeURIComponent(token)}`)).data,
    retry: false,
    refetchInterval: 60_000,
  })

  if (query.isPending) {
    return (
      <PublicShell>
        <div className="flex justify-center py-16"><Spinner /></div>
      </PublicShell>
    )
  }
  if (query.isError) {
    return (
      <PublicShell>
        <PublicCard>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Ссылка не работает</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Проверьте ссылку или обратитесь в обслуживающую организацию.
          </p>
        </PublicCard>
      </PublicShell>
    )
  }

  const task = query.data
  const stepIndex = STEPS.findIndex((step) => step.status === task.status)
  return (
    <PublicShell>
      <PublicCard className="space-y-5">
        <div>
          {task.organization && <p className="eyebrow">{task.organization}</p>}
          <div className="mt-1 flex flex-wrap items-start gap-2">
            <h1 className="min-w-0 flex-1 text-xl font-semibold text-gray-900 dark:text-white">{task.title}</h1>
            <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-medium', STATUS_STYLE[task.status])}>
              {task.status_label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Заявка {task.number} · {task.address}
          </p>
        </div>

        {task.status !== 'CANCELLED' && (
          <ol className="grid grid-cols-3 gap-2">
            {STEPS.map((step, index) => {
              const done = index <= stepIndex
              return (
                <li key={step.status} className="flex flex-col items-center gap-1 text-center">
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 text-primary-500" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                  )}
                  <span className={cn('text-xs', done ? 'text-gray-900 dark:text-white' : 'text-gray-400')}>{step.label}</span>
                </li>
              )
            })}
          </ol>
        )}

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="eyebrow">Принята</dt>
            <dd className="mt-0.5 text-sm text-gray-900 dark:text-white">{formatDateTime(task.created_at)}</dd>
          </div>
          {task.planned_date && task.status !== 'DONE' && (
            <div>
              <dt className="eyebrow">Мастер приедет</dt>
              <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{formatDateOnly(task.planned_date)}</dd>
            </div>
          )}
          {task.completed_at && (
            <div>
              <dt className="eyebrow">Выполнена</dt>
              <dd className="mt-0.5 text-sm text-gray-900 dark:text-white">{formatDateTime(task.completed_at)}</dd>
            </div>
          )}
        </dl>

        {task.acts.length > 0 && (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Оформлен акт {task.acts.map((act) => `№ ${act.number}`).join(', ')}.
          </p>
        )}

        <div>
          <p className="eyebrow">История</p>
          <ul className="mt-2 space-y-1.5">
            {task.events.map((event, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{formatDateTime(event.at)}</span>
                <span className="text-gray-900 dark:text-white">{event.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </PublicCard>

      {(task.telegram_url || task.organization_phone) && (
        <PublicCard className="flex flex-wrap items-center gap-3">
          {task.telegram_url && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
            <a
              href={task.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              <Send className="mr-2 h-4 w-4" />
              Уведомлять в Telegram
            </a>
          )}
          {task.organization_phone && (
            <a
              href={`tel:${task.organization_phone}`}
              className="inline-flex items-center text-sm text-primary-600 hover:underline dark:text-primary-400"
            >
              <Phone className="mr-1.5 h-4 w-4" />
              {task.organization_phone}
            </a>
          )}
        </PublicCard>
      )}
    </PublicShell>
  )
}

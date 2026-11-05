import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { cabinetApi } from '@/api/cabinet'
import { formatDateOnly, formatDateTime } from '@/utils/dateFormat'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { showApiError } from '@/utils/apiError'
import QueryStatePanel from '@/components/QueryStatePanel'
import { ActRow, EmptyLine, TaskStatusBadge } from './CabinetShared'

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-white">{value}</dd>
    </div>
  )
}

/** Подписка на смены статуса в Telegram: ссылка на бота открывается в новой вкладке. */
function TelegramButton({ taskId }: { taskId: number }) {
  const [loading, setLoading] = useState(false)
  const open = async () => {
    // Окно открываем до запроса, иначе браузер сочтёт его всплывающим
    const target = window.open('', '_blank')
    setLoading(true)
    try {
      const url = await cabinetApi.telegramLink(taskId)
      if (target) target.location.href = url
      else window.location.href = url
    } catch (error) {
      target?.close()
      showApiError(error, 'Уведомления в Telegram недоступны')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div>
      <Button size="sm" variant="secondary" isLoading={loading} onClick={open}>
        <Send className="mr-1.5 h-4 w-4" />
        Уведомлять в Telegram
      </Button>
    </div>
  )
}

export default function CabinetTaskPage() {
  const { id } = useParams<{ id: string }>()
  const taskId = Number(id)
  const task = useQuery({ queryKey: ['cabinet', 'task', taskId], queryFn: () => cabinetApi.task(taskId) })

  if (!task.data) {
    return <QueryStatePanel state={task.isError ? 'error' : 'loading'} onRetry={() => task.refetch()} />
  }
  const data = task.data
  return (
    <>
      <div className="flex items-start gap-2">
        <Link to="/client" aria-label="К заявкам" className="mt-1 rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{data.title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {data.number} · {data.address}
          </p>
        </div>
        <TaskStatusBadge status={data.status} label={data.status_label} />
      </div>
      {(data.status === 'NEW' || data.status === 'IN_PROGRESS') && <TelegramButton taskId={data.id} />}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <Card title="Заявка">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fact label="Принята" value={formatDateTime(data.created_at)} />
              <Fact label="Плановая дата" value={data.planned_date ? formatDateOnly(data.planned_date) : null} />
              <Fact label="Выполнена" value={data.completed_at ? formatDateTime(data.completed_at) : null} />
              <Fact label="Исполнитель" value={data.executor} />
            </dl>
            {data.description && (
              <p className="mt-3 whitespace-pre-line border-t border-gray-100 pt-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                {data.description}
              </p>
            )}
          </Card>

          <Card flush title={`Акты · ${data.acts.length}`}>
            {data.acts.length === 0 ? (
              <EmptyLine>Акт появится после выполнения работ.</EmptyLine>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.acts.map((act) => <ActRow key={act.id} act={act} />)}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Ход работ">
          <ol className="space-y-3">
            {data.events.map((event, index) => (
              <li key={index} className="relative pl-5">
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary-500" />
                <p className="text-sm text-gray-900 dark:text-white">{event.text}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(event.at)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  )
}

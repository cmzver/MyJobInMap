import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, History } from 'lucide-react'
import { useRelatedTasks } from '@/hooks/useTasks'
import type { RelatedTask } from '@/api/tasks'
import { formatDateOnly } from '@/utils/dateFormat'

const MAX_LINKS = 3

function TaskLinks({ tasks, date }: { tasks: RelatedTask[]; date: (task: RelatedTask) => string }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {tasks.slice(0, MAX_LINKS).map((task) => (
        <li key={task.id} className="min-w-0 truncate">
          <Link
            to={`/tasks/${task.id}`}
            target="_blank"
            className="font-medium text-primary-700 hover:underline dark:text-primary-300"
          >
            {task.task_number}
          </Link>{' '}
          <span className="text-gray-500 dark:text-gray-400">
            {date(task)}
            {task.defect_type ? ` · ${task.defect_type}` : ''}
            {task.assigned_user_name ? ` · ${task.assigned_user_name}` : ''}
          </span>
        </li>
      ))}
      {tasks.length > MAX_LINKS && (
        <li className="text-gray-500 dark:text-gray-400">и ещё {tasks.length - MAX_LINKS}</li>
      )}
    </ul>
  )
}

/** «На этом адресе уже открыта заявка…» — до сохранения новой заявки. */
export default function RelatedTasksHint({
  address,
  systemId,
  systemType,
}: {
  address: string
  systemId?: number | null
  systemType?: string | null
}) {
  // Адрес меняется с каждой нажатой клавишей — спрашиваем сервер, когда ввод утих.
  const [debounced, setDebounced] = useState(address)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(address), 600)
    return () => window.clearTimeout(timer)
  }, [address])

  const { data } = useRelatedTasks(
    debounced ? { address: debounced, system_id: systemId, system_type: systemType } : null,
  )
  if (!data || (data.open_tasks.length === 0 && data.recently_closed.length === 0)) return null

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
      {data.open_tasks.length > 0 && (
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white">
              На этом адресе уже {data.open_tasks.length === 1 ? 'открыта заявка' : `открыто заявок: ${data.open_tasks.length}`}
            </p>
            <TaskLinks tasks={data.open_tasks} date={(task) => `от ${formatDateOnly(task.created_at)}`} />
          </div>
        </div>
      )}
      {data.recently_closed.length > 0 && (
        <div className="flex gap-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white">
              За {data.window_days} дн. здесь закрыто заявок: {data.recently_closed.length}
            </p>
            <TaskLinks
              tasks={data.recently_closed}
              date={(task) => `закрыта ${formatDateOnly(task.completed_at)}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

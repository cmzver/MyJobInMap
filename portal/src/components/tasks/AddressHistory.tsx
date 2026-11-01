import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import type { RelatedTask } from '@/api/tasks'
import type { TaskRepeatRef, TaskStatus } from '@/types/task'
import { formatDateOnly } from '@/utils/dateFormat'

/** Чем эта заявка повторяет прошлую: кто, когда и с каким комментарием закрывал. */
export function RepeatNotice({
  repeat,
  onClear,
  isClearing = false,
}: {
  repeat: TaskRepeatRef
  /** Снять отметку дубля (только для дублей и тех, кто правит заявки). */
  onClear?: () => void
  isClearing?: boolean
}) {
  const isReturn = repeat.kind === 'return'
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-800">
      <History className={`mt-0.5 h-4 w-4 shrink-0 ${isReturn ? 'text-orange-500' : 'text-gray-400'}`} />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-gray-900 dark:text-white">
          {isReturn ? 'Повтор заявки ' : 'Дубль заявки '}
          <Link to={`/tasks/${repeat.id}`} className="text-primary-600 hover:underline dark:text-primary-400">
            {repeat.task_number}
          </Link>
          {repeat.same_defect && ' — та же неисправность'}
        </p>
        <p className="text-gray-600 dark:text-gray-300">
          {isReturn ? `Закрыта ${formatDateOnly(repeat.completed_at)}` : `Создана ${formatDateOnly(repeat.created_at)}`}
          {repeat.assigned_user_name && `, исполнитель ${repeat.assigned_user_name}`}
          {repeat.defect_type && ` · ${repeat.defect_type}`}
        </p>
        {isReturn && repeat.completion_comment && (
          <p className="whitespace-pre-wrap break-words text-gray-600 [overflow-wrap:anywhere] dark:text-gray-300">
            «{repeat.completion_comment}»
          </p>
        )}
      </div>
      {onClear && (
        <Button size="sm" variant="ghost" className="ml-auto shrink-0" isLoading={isClearing} onClick={onClear}>
          Снять отметку
        </Button>
      )}
    </div>
  )
}

/** Последние заявки на том же месте (адрес + система). */
export function AddressHistoryList({ tasks }: { tasks: RelatedTask[] }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Других заявок на этом месте не было.</p>
  }
  return (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={`/tasks/${task.id}`}
              className="font-mono text-xs text-primary-600 hover:underline dark:text-primary-400"
            >
              {task.task_number}
            </Link>
            <StatusBadge status={task.status as TaskStatus} />
          </div>
          <div className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
            {task.defect_type || task.title}
          </div>
          <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {task.completed_at ? `закрыта ${formatDateOnly(task.completed_at)}` : `от ${formatDateOnly(task.created_at)}`}
            {task.assigned_user_name && ` · ${task.assigned_user_name}`}
          </div>
        </li>
      ))}
    </ul>
  )
}

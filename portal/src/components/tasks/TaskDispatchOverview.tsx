import type { Task } from '@/types/task'
import { getStatusLabel } from '@/config/taskConstants'
import { buildTaskDispatchOverview, dispatchStatuses } from './taskDispatchOverviewModel'

interface TaskDispatchOverviewProps {
  tasks: readonly Task[]
  total: number
}

const statusCellClass = {
  NEW: 'text-blue-700 dark:text-blue-300',
  IN_PROGRESS: 'text-orange-700 dark:text-orange-300',
  DONE: 'text-green-700 dark:text-green-300',
  CANCELLED: 'text-gray-500 dark:text-gray-400',
}

export default function TaskDispatchOverview({ tasks, total }: TaskDispatchOverviewProps) {
  const rows = buildTaskDispatchOverview(tasks)
  const isPartial = total > tasks.length

  return (
    <section
      aria-labelledby="task-dispatch-overview-title"
      className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-col gap-1 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
        <h2
          id="task-dispatch-overview-title"
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          Нагрузка по исполнителям
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isPartial ? `Текущая страница: ${tasks.length} из ${total}` : `${total} заявок`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                Исполнитель
              </th>
              {dispatchStatuses.map((status) => (
                <th key={status} scope="col" className="px-3 py-2.5 text-center">
                  {getStatusLabel(status)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-center">
                Активные
              </th>
              <th scope="col" className="px-3 py-2.5 text-center">
                Срочные
              </th>
              <th scope="col" className="px-4 py-2.5 text-center">
                Всего
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-3 text-left font-medium text-gray-900 dark:text-white"
                >
                  {row.assigneeName}
                </th>
                {dispatchStatuses.map((status) => (
                  <td
                    key={status}
                    className={`px-3 py-3 text-center tabular-nums ${statusCellClass[status]}`}
                  >
                    {row.counts[status]}
                  </td>
                ))}
                <td className="px-3 py-3 text-center font-semibold tabular-nums text-gray-900 dark:text-white">
                  {row.active}
                </td>
                <td
                  className={`px-3 py-3 text-center font-semibold tabular-nums ${row.urgent > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {row.urgent}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-gray-600 dark:text-gray-300">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

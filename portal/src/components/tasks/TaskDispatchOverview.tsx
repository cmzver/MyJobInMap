import type { Task, TaskPriority, TaskStatus } from '@/types/task'
import { getStatusLabel } from '@/config/taskConstants'
import { STATUS_TEXT_CLASSES } from '@/config/taskStatusVisuals'
import { buildTaskDispatchOverview, dispatchStatuses } from './taskDispatchOverviewModel'

interface TaskDispatchOverviewProps {
  tasks: readonly Task[]
  total: number
  onSelect: (selection: TaskDispatchSelection) => void
}

export interface TaskDispatchSelection {
  assigneeId: number
  statuses?: TaskStatus[]
  priorities?: TaskPriority[]
}

const cellButtonClass =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 font-semibold tabular-nums hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-800'

export default function TaskDispatchOverview({
  tasks,
  total,
  onSelect,
}: TaskDispatchOverviewProps) {
  const rows = buildTaskDispatchOverview(tasks)
  const isPartial = total > tasks.length
  const selectRow = (
    assigneeId: number | null,
    filters: Omit<TaskDispatchSelection, 'assigneeId'> = {}
  ) => {
    if (assigneeId == null) return
    onSelect({ assigneeId, ...filters })
  }

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

      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-44" />
            {dispatchStatuses.map((status) => (
              <col key={status} className="w-24" />
            ))}
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-20" />
          </colgroup>
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 border-r border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900"
              >
                Исполнитель
              </th>
              {dispatchStatuses.map((status) => (
                <th key={status} scope="col" className="whitespace-nowrap px-2 py-2.5 text-center">
                  {getStatusLabel(status)}
                </th>
              ))}
              <th scope="col" className="whitespace-nowrap px-2 py-2.5 text-center">
                Активные
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2.5 text-center">
                Срочные
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2.5 text-center">
                Всего
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((row) => (
              <tr key={row.key} className="group h-12 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] truncate border-r border-gray-100 bg-white px-4 py-2 text-left font-medium text-gray-900 group-hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:group-hover:bg-gray-700"
                  title={row.assigneeName}
                >
                  {row.assigneeName}
                </th>
                {dispatchStatuses.map((status) => (
                  <td
                    key={status}
                    className={`px-2 py-2 text-center align-middle tabular-nums ${STATUS_TEXT_CLASSES[status]}`}
                  >
                    {row.assigneeId != null && row.counts[status] > 0 ? (
                      <button
                        type="button"
                        className={cellButtonClass}
                        aria-label={`Показать: ${row.assigneeName}, ${getStatusLabel(status)} — ${row.counts[status]}`}
                        onClick={() => selectRow(row.assigneeId, { statuses: [status] })}
                      >
                        {row.counts[status]}
                      </button>
                    ) : (
                      row.counts[status]
                    )}
                  </td>
                ))}
                <td className="px-2 py-2 text-center align-middle font-semibold tabular-nums text-gray-900 dark:text-white">
                  {row.assigneeId != null && row.active > 0 ? (
                    <button
                      type="button"
                      className={cellButtonClass}
                      aria-label={`Показать активные заявки: ${row.assigneeName} — ${row.active}`}
                      onClick={() =>
                        selectRow(row.assigneeId, {
                          statuses: ['NEW', 'IN_PROGRESS'],
                        })
                      }
                    >
                      {row.active}
                    </button>
                  ) : (
                    row.active
                  )}
                </td>
                <td
                  className={`px-2 py-2 text-center align-middle font-semibold tabular-nums ${row.urgent > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {row.assigneeId != null && row.urgent > 0 ? (
                    <button
                      type="button"
                      className={cellButtonClass}
                      aria-label={`Показать срочные активные заявки: ${row.assigneeName} — ${row.urgent}`}
                      onClick={() =>
                        selectRow(row.assigneeId, {
                          statuses: ['NEW', 'IN_PROGRESS'],
                          priorities: ['EMERGENCY', 'URGENT'],
                        })
                      }
                    >
                      {row.urgent}
                    </button>
                  ) : (
                    row.urgent
                  )}
                </td>
                <td className="px-2 py-2 text-center align-middle tabular-nums text-gray-600 dark:text-gray-300">
                  {row.assigneeId != null && row.total > 0 ? (
                    <button
                      type="button"
                      className={cellButtonClass}
                      aria-label={`Показать все заявки: ${row.assigneeName} — ${row.total}`}
                      onClick={() => selectRow(row.assigneeId)}
                    >
                      {row.total}
                    </button>
                  ) : (
                    row.total
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

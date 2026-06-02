import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import Modal from '@/components/Modal'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { tasksApi } from '@/api/tasks'
import type { Task } from '@/types/task'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSelect: (task: Task) => void
}

/** Модалка выбора заявки для прикрепления в чат (поиск по номеру/заголовку/адресу). */
export default function TaskPicker({ isOpen, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Сброс строки поиска при закрытии
  useEffect(() => {
    if (!isOpen) setSearch('')
  }, [isOpen])

  const { data, isLoading } = useQuery({
    queryKey: ['taskPicker', debounced],
    queryFn: () =>
      tasksApi.getTasks({
        search: debounced || undefined,
        size: 20,
        sort: 'created_at_desc',
      }),
    enabled: isOpen,
  })

  const tasks = data?.items ?? []

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Прикрепить заявку" size="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по номеру, заголовку, адресу..."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading && (
            <p className="py-6 text-center text-sm text-gray-400">Загрузка…</p>
          )}
          {!isLoading && tasks.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Заявки не найдены</p>
          )}
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelect(task)}
              className="flex w-full flex-col gap-1 rounded-lg px-2 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                {task.task_number && (
                  <span className="font-mono text-xs text-gray-500">№{task.task_number}</span>
                )}
                <span className="flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {task.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <span className="truncate text-xs text-gray-400">{task.raw_address}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

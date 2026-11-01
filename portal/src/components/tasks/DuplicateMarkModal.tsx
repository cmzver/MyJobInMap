import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import StatusBadge from '@/components/StatusBadge'
import { useMarkDuplicate, useTasks } from '@/hooks/useTasks'
import type { RelatedTasks } from '@/api/tasks'
import type { TaskStatus } from '@/types/task'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'

type Candidate = {
  id: number
  number: string
  status: TaskStatus
  label: string
  date: string | null | undefined
}

function CandidateList({
  candidates,
  isPending,
  onPick,
}: {
  candidates: Candidate[]
  isPending: boolean
  onPick: (candidate: Candidate) => void
}) {
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
      {candidates.map((candidate) => (
        <li key={candidate.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{candidate.number}</span>
              <StatusBadge status={candidate.status} />
            </div>
            <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-300">
              {candidate.label}
              {candidate.date && (
                <span className="text-gray-400 dark:text-gray-500"> · от {formatDateOnly(candidate.date)}</span>
              )}
            </p>
          </div>
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => onPick(candidate)}>
            Выбрать
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Отметить заявку дублем: на том же месте или найденную по номеру/адресу. */
export default function DuplicateMarkModal({
  taskId,
  related,
  isOpen,
  onClose,
}: {
  taskId: number
  related?: RelatedTasks
  isOpen: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const markDuplicate = useMarkDuplicate()

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const { data: found, isFetching } = useTasks(
    search.length >= 2 ? { search, size: 8, sort: 'created_at_desc' } : undefined,
  )

  const samePlace = useMemo<Candidate[]>(() => {
    const seen = new Set<number>([taskId])
    return [...(related?.open_tasks ?? []), ...(related?.history ?? [])]
      .filter((task) => !seen.has(task.id) && seen.add(task.id))
      .map((task) => ({
        id: task.id,
        number: task.task_number,
        status: task.status as TaskStatus,
        label: task.defect_type || task.title,
        date: task.created_at,
      }))
  }, [related, taskId])

  const searchResults = useMemo<Candidate[]>(
    () =>
      search.length >= 2
        ? (found?.items ?? [])
            .filter((task) => task.id !== taskId)
            .map((task) => ({
              id: task.id,
              number: task.task_number || `#${task.id}`,
              status: task.status,
              label: `${task.defect_type || task.title} · ${task.raw_address}`,
              date: task.created_at,
            }))
        : [],
    [found, search, taskId],
  )

  const pick = (candidate: Candidate) =>
    markDuplicate.mutate(
      { id: taskId, originalTaskId: candidate.id },
      {
        onSuccess: () => {
          showApiSuccess(`Отмечена как дубль заявки ${candidate.number}`)
          onClose()
        },
        onError: (error) => showApiError(error, 'Не удалось отметить дубль'),
      },
    )

  const list = search.length >= 2 ? searchResults : samePlace

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Отметить как дубль" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Выберите заявку, которую повторяет эта. Отметка попадёт в историю заявки, её можно снять.
        </p>
        <Input
          placeholder="Номер заявки или адрес"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div>
          <p className="eyebrow mb-1">
            {search.length >= 2 ? (isFetching ? 'Ищем…' : 'Найдено') : 'На этом месте'}
          </p>
          {list.length > 0 ? (
            <CandidateList candidates={list} isPending={markDuplicate.isPending} onPick={pick} />
          ) : (
            <p className="py-3 text-sm text-gray-500 dark:text-gray-400">
              {search.length >= 2
                ? 'Ничего не нашлось.'
                : 'Других заявок на этом месте нет — найдите исходную по номеру.'}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}

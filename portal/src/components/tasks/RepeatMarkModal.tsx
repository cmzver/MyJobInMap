import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import StatusBadge from '@/components/StatusBadge'
import { useMarkRepeat, useTasks } from '@/hooks/useTasks'
import type { RelatedTasks } from '@/api/tasks'
import type { RepeatKind, TaskStatus } from '@/types/task'
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

const KINDS: Array<{ value: RepeatKind; label: string; hint: string }> = [
  {
    value: 'return',
    label: 'Повтор',
    hint: 'Проблема вернулась после выполненной заявки — выберите выполненную.',
  },
  {
    value: 'duplicate',
    label: 'Дубль',
    hint: 'Та же самая заявка пришла ещё раз.',
  },
]

/** Отметить заявку повтором или дублем: на том же месте или найденную по номеру/адресу. */
export default function RepeatMarkModal({
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
  const [kind, setKind] = useState<RepeatKind>('return')
  const markRepeat = useMarkRepeat()

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
      // Повтор — только выполненной заявки; дубль — любой.
      .filter((task) => kind === 'duplicate' || task.status === 'DONE')
      .map((task) => ({
        id: task.id,
        number: task.task_number,
        status: task.status as TaskStatus,
        label: task.defect_type || task.title,
        date: task.created_at,
      }))
  }, [related, taskId, kind])

  const searchResults = useMemo<Candidate[]>(
    () =>
      search.length >= 2
        ? (found?.items ?? [])
            .filter((task) => task.id !== taskId && (kind === 'duplicate' || task.status === 'DONE'))
            .map((task) => ({
              id: task.id,
              number: task.task_number || `#${task.id}`,
              status: task.status,
              label: `${task.defect_type || task.title} · ${task.raw_address}`,
              date: task.created_at,
            }))
        : [],
    [found, search, taskId, kind],
  )

  const kindName = kind === 'return' ? 'повтор' : 'дубль'
  const pick = (candidate: Candidate) =>
    markRepeat.mutate(
      { id: taskId, originalTaskId: candidate.id, kind },
      {
        onSuccess: () => {
          showApiSuccess(`Отмечена как ${kindName} заявки ${candidate.number}`)
          onClose()
        },
        onError: (error) => showApiError(error, 'Не удалось сохранить отметку'),
      },
    )

  const list = search.length >= 2 ? searchResults : samePlace

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Повтор или дубль" size="lg">
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                kind === option.value
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {KINDS.find((option) => option.value === kind)?.hint} Отметка попадёт в историю
          заявки, её можно снять.
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
            <CandidateList candidates={list} isPending={markRepeat.isPending} onPick={pick} />
          ) : (
            <p className="py-3 text-sm text-gray-500 dark:text-gray-400">
              {search.length >= 2
                ? 'Ничего не нашлось.'
                : kind === 'return'
                  ? 'Выполненных заявок на этом месте нет — найдите исходную по номеру.'
                  : 'Других заявок на этом месте нет — найдите исходную по номеру.'}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}

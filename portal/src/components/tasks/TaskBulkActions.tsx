import { useState } from 'react'

import Button from '@/components/Button'
import Select from '@/components/Select'

type BulkAction = 'status' | 'assignee' | 'priority' | 'planned-date'

interface AssignableUser {
  id: number
  full_name?: string | null
  username: string
}

interface TaskBulkActionsProps {
  selectedCount: number
  assignableUsers: AssignableUser[]
  status: string
  assignee: string
  priority: string
  plannedDate: string
  isStatusPending: boolean
  isAssigneePending: boolean
  isPriorityPending: boolean
  isPlannedDatePending: boolean
  isDeletePending: boolean
  onStatusChange: (value: string) => void
  onAssigneeChange: (value: string) => void
  onPriorityChange: (value: string) => void
  onPlannedDateChange: (value: string) => void
  onApplyStatus: () => void
  onApplyAssignee: () => void
  onApplyPriority: () => void
  onApplyPlannedDate: () => void
  onDelete: () => void
  onClear: () => void
}

export default function TaskBulkActions({
  selectedCount,
  assignableUsers,
  status,
  assignee,
  priority,
  plannedDate,
  isStatusPending,
  isAssigneePending,
  isPriorityPending,
  isPlannedDatePending,
  isDeletePending,
  onStatusChange,
  onAssigneeChange,
  onPriorityChange,
  onPlannedDateChange,
  onApplyStatus,
  onApplyAssignee,
  onApplyPriority,
  onApplyPlannedDate,
  onDelete,
  onClear,
}: TaskBulkActionsProps) {
  const [action, setAction] = useState<BulkAction>('status')

  const isApplyPending =
    (action === 'status' && isStatusPending) ||
    (action === 'assignee' && isAssigneePending) ||
    (action === 'priority' && isPriorityPending) ||
    (action === 'planned-date' && isPlannedDatePending)

  const canApply =
    (action === 'status' && Boolean(status)) ||
    (action === 'assignee' && Boolean(assignee)) ||
    (action === 'priority' && Boolean(priority)) ||
    (action === 'planned-date' && Boolean(plannedDate))

  const applyAction = () => {
    switch (action) {
      case 'status':
        onApplyStatus()
        break
      case 'assignee':
        onApplyAssignee()
        break
      case 'priority':
        onApplyPriority()
        break
      case 'planned-date':
        onApplyPlannedDate()
        break
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:flex-row lg:items-end lg:justify-between">
      <div className="text-sm text-gray-700 dark:text-gray-300 lg:self-center">
        Выбрано заявок: <span className="font-medium">{selectedCount}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end lg:max-w-3xl">
        <div className="sm:w-56 sm:flex-none">
          <Select
            label="Действие"
            options={[
              { value: 'status', label: 'Изменить статус' },
              { value: 'assignee', label: 'Назначить исполнителя' },
              { value: 'priority', label: 'Изменить приоритет' },
              { value: 'planned-date', label: 'Назначить плановую дату' },
            ]}
            value={action}
            onChange={(value) => setAction(value as BulkAction)}
          />
        </div>

        <div className="min-w-0 flex-1 sm:min-w-52">
          {action === 'status' && (
            <Select
              label="Новое значение"
              options={[
                { value: 'NEW', label: 'Новая' },
                { value: 'IN_PROGRESS', label: 'В работе' },
                { value: 'DONE', label: 'Выполнена' },
                { value: 'CANCELLED', label: 'Отменена' },
              ]}
              value={status}
              onChange={onStatusChange}
              placeholder="Выберите статус"
            />
          )}
          {action === 'assignee' && (
            <Select
              label="Новое значение"
              options={[
                { value: 'none', label: 'Не назначен' },
                ...assignableUsers.map((user) => ({
                  value: String(user.id),
                  label: user.full_name || user.username,
                })),
              ]}
              value={assignee}
              onChange={onAssigneeChange}
              placeholder="Выберите исполнителя"
            />
          )}
          {action === 'priority' && (
            <Select
              label="Новое значение"
              options={[
                { value: 'EMERGENCY', label: 'Аварийная' },
                { value: 'URGENT', label: 'Срочная' },
                { value: 'CURRENT', label: 'Текущая' },
                { value: 'PLANNED', label: 'Плановая' },
              ]}
              value={priority}
              onChange={onPriorityChange}
              placeholder="Выберите приоритет"
            />
          )}
          {action === 'planned-date' && (
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Новое значение
              <input
                type="datetime-local"
                value={plannedDate}
                onChange={(event) => onPlannedDateChange(event.target.value)}
                className="mt-1 block h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
          )}
        </div>

        <Button
          size="sm"
          onClick={applyAction}
          isLoading={isApplyPending}
          disabled={!canApply}
          className="h-[42px]"
        >
          Применить
        </Button>
      </div>
      <div className="flex gap-2 lg:self-end">
        <Button
          variant="danger"
          size="sm"
          onClick={onDelete}
          isLoading={isDeletePending}
          className="h-[42px]"
        >
          Удалить
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-[42px]">
          Очистить
        </Button>
      </div>
    </div>
  )
}

export type TaskTableColumnKey =
  | 'select'
  | 'number'
  | 'title'
  | 'address'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'date'
  | 'sla'

export type ToggleableTaskTableColumnKey = Exclude<TaskTableColumnKey, 'select'>

export const toggleableTaskTableColumns: Array<{
  key: ToggleableTaskTableColumnKey
  label: string
}> = [
  { key: 'number', label: 'Номер' },
  { key: 'title', label: 'Заявка' },
  { key: 'address', label: 'Адрес' },
  { key: 'status', label: 'Статус' },
  { key: 'priority', label: 'Приоритет' },
  { key: 'assignee', label: 'Исполнитель' },
  { key: 'date', label: 'Дата' },
  { key: 'sla', label: 'Срок' },
]

export const defaultVisibleTaskTableColumns: Record<ToggleableTaskTableColumnKey, boolean> = {
  number: true,
  title: true,
  address: true,
  status: true,
  priority: true,
  assignee: true,
  date: true,
  sla: true,
}

export function getVisibleTaskTableColumnOrder(
  visibleColumns: Record<ToggleableTaskTableColumnKey, boolean>
): TaskTableColumnKey[] {
  return [
    'select',
    ...toggleableTaskTableColumns
      .filter((column) => visibleColumns[column.key])
      .map((column) => column.key),
  ]
}

export const getTaskTableColumnWidthCssVar = (key: TaskTableColumnKey) => `--tasks-col-${key}`

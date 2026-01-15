import Badge from './Badge'
import type { TaskStatus } from '@/types/task'

interface StatusBadgeProps {
  status: TaskStatus
}

const statusConfig: Record<TaskStatus, { label: string; variant: 'danger' | 'warning' | 'success' | 'gray' }> = {
  NEW: { label: 'Новая', variant: 'danger' },
  IN_PROGRESS: { label: 'В работе', variant: 'warning' },
  DONE: { label: 'Выполнена', variant: 'success' },
  CANCELLED: { label: 'Отменена', variant: 'gray' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: 'gray' as const }
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}

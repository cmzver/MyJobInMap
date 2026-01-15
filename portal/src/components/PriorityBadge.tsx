import Badge from './Badge'
import type { TaskPriority } from '@/types/task'

interface PriorityBadgeProps {
  priority: TaskPriority
}

const priorityConfig: Record<TaskPriority, { label: string; variant: 'danger' | 'warning' | 'info' | 'success' }> = {
  EMERGENCY: { label: 'Аварийная', variant: 'danger' },
  URGENT: { label: 'Срочная', variant: 'warning' },
  CURRENT: { label: 'Текущая', variant: 'info' },
  PLANNED: { label: 'Плановая', variant: 'success' },
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || { label: priority, variant: 'info' as const }
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  )
}

import { memo } from 'react'
import Badge from './Badge'
import { STATUS_LABELS, STATUS_COLORS } from '@/config/taskConstants'
import type { TaskStatus } from '@/types/task'

interface StatusBadgeProps {
  status: TaskStatus
}

function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || status
  const variant = STATUS_COLORS[status] || 'gray'
  
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}

export default memo(StatusBadge)

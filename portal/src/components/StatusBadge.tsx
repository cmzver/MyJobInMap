import { memo } from 'react'
import { Check, Circle, Clock, X } from 'lucide-react'
import Badge from './Badge'
import { STATUS_LABELS, STATUS_COLORS } from '@/config/taskConstants'
import type { TaskStatus } from '@/types/task'

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || status
  const variant = STATUS_COLORS[status] || 'gray'
  const compactIcon = status === 'DONE'
    ? <Check className="h-3 w-3" />
    : status === 'CANCELLED'
      ? <X className="h-3 w-3" />
      : status === 'IN_PROGRESS'
        ? <Clock className="h-3 w-3" />
        : <Circle className="h-3 w-3 fill-current" />
  
  return (
    <Badge variant={variant} className={className} compactContent={compactIcon} title={label}>
      {label}
    </Badge>
  )
}

export default memo(StatusBadge)

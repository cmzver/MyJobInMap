import { memo } from 'react'
import Badge from './Badge'
import { PRIORITY_LABELS, PRIORITY_COLORS, normalizePriority } from '@/config/taskConstants'
import type { TaskPriority } from '@/types/task'
import { cn } from '@/utils/cn'

interface PriorityBadgeProps {
  priority: TaskPriority | number
  className?: string
}

function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const normalized = normalizePriority(priority)
  const label = PRIORITY_LABELS[normalized] || String(priority)
  const variant = PRIORITY_COLORS[normalized] || 'gray'

  return (
    <Badge variant={variant} className={cn('rounded-md', className)} title={label}>
      {label}
    </Badge>
  )
}

export default memo(PriorityBadge)

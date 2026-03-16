import { memo } from 'react'
import Badge from './Badge'
import { PRIORITY_LABELS, PRIORITY_COLORS, normalizePriority } from '@/config/taskConstants'
import type { TaskPriority } from '@/types/task'

interface PriorityBadgeProps {
  priority: TaskPriority | number
  className?: string
}

function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const normalized = normalizePriority(priority)
  const label = PRIORITY_LABELS[normalized] || String(priority)
  const variant = PRIORITY_COLORS[normalized] || 'info'
  
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}

export default memo(PriorityBadge)

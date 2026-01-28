import { memo } from 'react'
import Badge from './Badge'
import { PRIORITY_LABELS, PRIORITY_COLORS, normalizePriority } from '@/config/taskConstants'
import type { TaskPriority } from '@/types/task'

interface PriorityBadgeProps {
  priority: TaskPriority | number
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  const normalized = normalizePriority(priority)
  const label = PRIORITY_LABELS[normalized] || String(priority)
  const variant = PRIORITY_COLORS[normalized] || 'info'
  
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}

export default memo(PriorityBadge)

import { memo } from 'react'
import { AlertTriangle, Calendar, Clock, Flame } from 'lucide-react'
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
  const compactIcon = normalized === 'EMERGENCY'
    ? <Flame className="h-3 w-3" />
    : normalized === 'URGENT'
      ? <AlertTriangle className="h-3 w-3" />
      : normalized === 'CURRENT'
        ? <Clock className="h-3 w-3" />
        : <Calendar className="h-3 w-3" />
  
  return (
    <Badge variant={variant} className={className} compactContent={compactIcon} title={label}>
      {label}
    </Badge>
  )
}

export default memo(PriorityBadge)

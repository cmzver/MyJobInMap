import { memo } from 'react'
import { Check, CircleDot, Clock3, X } from 'lucide-react'
import { STATUS_LABELS } from '@/config/taskConstants'
import { STATUS_BADGE_CLASSES } from '@/config/taskStatusVisuals'
import type { TaskStatus } from '@/types/task'
import { cn } from '@/utils/cn'

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

const statusIcons = {
  NEW: CircleDot,
  IN_PROGRESS: Clock3,
  DONE: Check,
  CANCELLED: X,
} satisfies Record<TaskStatus, typeof CircleDot>

function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || status
  const Icon = statusIcons[status] || CircleDot

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        'badge-adaptive inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-l-[3px] px-2 text-xs font-medium leading-none',
        STATUS_BADGE_CLASSES[status],
        className
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="badge-full min-w-0 truncate">{label}</span>
    </span>
  )
}

export default memo(StatusBadge)

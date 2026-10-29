import { memo } from 'react'
import { STATUS_LABELS } from '@/config/taskConstants'
import { STATUS_BADGE_CLASSES } from '@/config/taskStatusVisuals'
import type { TaskStatus } from '@/types/task'
import { cn } from '@/utils/cn'

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || status

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-6 max-w-full items-center rounded-md border border-l-2 px-2 text-xs font-medium leading-none',
        STATUS_BADGE_CLASSES[status],
        className
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}

export default memo(StatusBadge)

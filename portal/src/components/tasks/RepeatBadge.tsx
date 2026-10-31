import { memo } from 'react'
import Badge from '@/components/Badge'
import type { TaskRepeatRef } from '@/types/task'
import { formatDateOnly } from '@/utils/dateFormat'

function repeatTitle(repeat: TaskRepeatRef): string {
  if (repeat.kind === 'duplicate') {
    return `Дубль: на этом месте открыта заявка ${repeat.task_number}`
  }
  return `Повтор: на этом месте ${formatDateOnly(repeat.completed_at)} закрыта заявка ${repeat.task_number}`
}

function RepeatBadge({ repeat, className }: { repeat?: TaskRepeatRef | null; className?: string }) {
  if (!repeat) return null
  return (
    <Badge
      variant={repeat.kind === 'return' ? 'warning' : 'gray'}
      title={repeatTitle(repeat)}
      className={className}
    >
      {repeat.kind === 'return' ? 'Повтор' : 'Дубль'}
    </Badge>
  )
}

export default memo(RepeatBadge)

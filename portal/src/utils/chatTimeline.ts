import { formatDateShort } from '@/utils/dateFormat'
import type { MessageResponse } from '@/types/chat'
import { isToday, isYesterday, parseISO } from 'date-fns'

export type ChatTimelineItem =
  | { type: 'date'; key: string; label: string }
  | {
      type: 'message'
      key: string
      message: MessageResponse
      groupedWithPrevious: boolean
      groupedWithNext: boolean
    }

export function buildChatTimelineItems(messages: MessageResponse[]): ChatTimelineItem[] {
  const items: ChatTimelineItem[] = []
  let lastDateKey: string | null = null

  for (const [i, message] of messages.entries()) {
    const dateKey = getDateKey(message.created_at)

    if (dateKey !== lastDateKey) {
      items.push({
        type: 'date',
        key: `date-${dateKey}`,
        label: formatTimelineDateLabel(message.created_at),
      })
      lastDateKey = dateKey
    }

    items.push({
      type: 'message',
      key: `message-${message.id}`,
      message,
      groupedWithPrevious: canGroupMessages(messages[i - 1], message),
      groupedWithNext: canGroupMessages(message, messages[i + 1]),
    })
  }

  return items
}

function getDateKey(value: string): string {
  try {
    return parseISO(value).toISOString().slice(0, 10)
  } catch {
    return value.slice(0, 10)
  }
}

function formatTimelineDateLabel(value: string): string {
  try {
    const date = parseISO(value)
    if (isToday(date)) return 'Сегодня'
    if (isYesterday(date)) return 'Вчера'
    return formatDateShort(value)
  } catch {
    return formatDateShort(value)
  }
}

function canGroupMessages(left: MessageResponse | undefined, right: MessageResponse | undefined): boolean {
  if (!left || !right) return false
  if (left.message_type === 'system' || right.message_type === 'system') return false
  if (left.is_deleted || right.is_deleted) return false
  if (left.sender_id !== right.sender_id) return false

  return getDateKey(left.created_at) === getDateKey(right.created_at)
}
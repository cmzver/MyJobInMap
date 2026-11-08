import { describe, expect, it } from 'vitest'

import type { MessageResponse } from '@/types/chat'
import { buildChatTimelineItems } from '../chatTimeline'

function message(id: number, createdAt: Date, senderId = 1): MessageResponse {
  return {
    id,
    conversation_id: 1,
    sender_id: senderId,
    sender_name: 'Иванов',
    text: `Сообщение ${id}`,
    message_type: 'text',
    is_deleted: false,
    created_at: createdAt.toISOString(),
  } as unknown as MessageResponse
}

const dateSeparators = (items: ReturnType<typeof buildChatTimelineItems>) =>
  items.filter((item) => item.type === 'date').length

describe('buildChatTimelineItems', () => {
  it('делит ленту по местной полуночи, а не по UTC', () => {
    // 23:00 и 00:30 по местному времени — разные дни, хотя в UTC (при поясе +1…+3) это одни сутки
    const items = buildChatTimelineItems([
      message(1, new Date(2026, 0, 14, 23, 0)),
      message(2, new Date(2026, 0, 15, 0, 30)),
    ])
    expect(dateSeparators(items)).toBe(2)
    const [, , , second] = items
    expect(second?.type === 'message' && second.groupedWithPrevious).toBe(false)
  })

  it('утро одного дня — один разделитель и группировка подряд идущих', () => {
    const items = buildChatTimelineItems([
      message(1, new Date(2026, 0, 15, 1, 0)),
      message(2, new Date(2026, 0, 15, 5, 0)),
    ])
    expect(dateSeparators(items)).toBe(1)
    const last = items[items.length - 1]
    expect(last?.type === 'message' && last.groupedWithPrevious).toBe(true)
  })
})

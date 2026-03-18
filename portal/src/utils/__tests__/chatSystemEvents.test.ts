/**
 * Tests for chat system event classification.
 */

import { describe, expect, it } from 'vitest'
import { getChatSystemEventMeta } from '../chatSystemEvents'
import type { MessageResponse } from '@/types/chat'

function createSystemMessage(text: string): MessageResponse {
  return {
    id: 1,
    conversation_id: 10,
    sender_id: 2,
    sender_name: 'Admin User',
    text,
    message_type: 'system',
    reply_to: null,
    attachments: [],
    reactions: [],
    mentions: [],
    is_edited: false,
    is_deleted: false,
    created_at: '2026-03-19T12:00:00',
    updated_at: null,
  }
}

describe('getChatSystemEventMeta', () => {
  it('classifies rename event', () => {
    const meta = getChatSystemEventMeta(createSystemMessage('переименовал(а) чат в "Новая группа"'))
    expect(meta.kind).toBe('rename')
    expect(meta.title).toBe('Название группы изменено')
  })

  it('classifies added member event', () => {
    const meta = getChatSystemEventMeta(createSystemMessage('добавил(а) Иван Иванов в чат'))
    expect(meta.kind).toBe('member_added')
  })

  it('classifies ownership transfer event', () => {
    const meta = getChatSystemEventMeta(createSystemMessage('передал(а) ownership пользователю Иван Иванов'))
    expect(meta.kind).toBe('ownership_transferred')
  })

  it('falls back to generic for unknown text', () => {
    const meta = getChatSystemEventMeta(createSystemMessage('что-то произошло'))
    expect(meta.kind).toBe('generic')
  })
})

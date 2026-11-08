import type { MessageResponse } from '@/types/chat'

export type ChatSystemEventKind = 'rename' | 'member_added' | 'member_removed' | 'member_left' | 'role_changed' | 'ownership_transferred' | 'generic'

export interface ChatSystemEventMeta {
  kind: ChatSystemEventKind
  title: string
  accentClassName: string
}

/** Системные события чата — один нейтральный цвет: тип читается из заголовка. */
const SYSTEM_EVENT_TEXT = 'text-gray-600 dark:text-gray-300'

export function getChatSystemEventMeta(message: MessageResponse): ChatSystemEventMeta {
  const text = (message.text ?? '').trim()

  if (/^переименовал\(а\) чат в /i.test(text)) {
    return {
      kind: 'rename',
      title: 'Название группы изменено',
      accentClassName: SYSTEM_EVENT_TEXT,
    }
  }

  if (/добавил\(а\).+в чат/i.test(text)) {
    return {
      kind: 'member_added',
      title: 'Участник добавлен',
      accentClassName: SYSTEM_EVENT_TEXT,
    }
  }

  if (/удалил\(а\).+из чата/i.test(text)) {
    return {
      kind: 'member_removed',
      title: 'Участник удалён',
      accentClassName: SYSTEM_EVENT_TEXT,
    }
  }

  if (/^вышел\(а\) из чата$/i.test(text)) {
    return {
      kind: 'member_left',
      title: 'Участник вышел',
      accentClassName: SYSTEM_EVENT_TEXT,
    }
  }

  if (/изменил\(а\) роль .+ на (admin|member|«администратор»|«участник»)/i.test(text)) {
    return {
      kind: 'role_changed',
      title: 'Роль участника изменена',
      accentClassName: SYSTEM_EVENT_TEXT,
    }
  }

  if (/передал\(а\) (ownership|права владельца) пользователю/i.test(text)) {
    return {
      kind: 'ownership_transferred',
      title: 'Владелец сменился',
      accentClassName: SYSTEM_EVENT_TEXT,
    }
  }

  return {
    kind: 'generic',
    title: 'Системное событие',
    accentClassName: SYSTEM_EVENT_TEXT,
  }
}
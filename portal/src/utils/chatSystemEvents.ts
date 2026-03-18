import type { MessageResponse } from '@/types/chat'

export type ChatSystemEventKind = 'rename' | 'member_added' | 'member_removed' | 'member_left' | 'role_changed' | 'ownership_transferred' | 'generic'

export interface ChatSystemEventMeta {
  kind: ChatSystemEventKind
  title: string
  accentClassName: string
}

export function getChatSystemEventMeta(message: MessageResponse): ChatSystemEventMeta {
  const text = (message.text ?? '').trim()

  if (/^переименовал\(а\) чат в /i.test(text)) {
    return {
      kind: 'rename',
      title: 'Название группы изменено',
      accentClassName: 'text-violet-700 dark:text-violet-300',
    }
  }

  if (/добавил\(а\).+в чат/i.test(text)) {
    return {
      kind: 'member_added',
      title: 'Участник добавлен',
      accentClassName: 'text-emerald-700 dark:text-emerald-300',
    }
  }

  if (/удалил\(а\).+из чата/i.test(text)) {
    return {
      kind: 'member_removed',
      title: 'Участник удалён',
      accentClassName: 'text-rose-700 dark:text-rose-300',
    }
  }

  if (/^вышел\(а\) из чата$/i.test(text)) {
    return {
      kind: 'member_left',
      title: 'Участник вышел',
      accentClassName: 'text-amber-700 dark:text-amber-300',
    }
  }

  if (/изменил\(а\) роль .+ на (admin|member)/i.test(text)) {
    return {
      kind: 'role_changed',
      title: 'Роль участника изменена',
      accentClassName: 'text-sky-700 dark:text-sky-300',
    }
  }

  if (/передал\(а\) ownership пользователю/i.test(text)) {
    return {
      kind: 'ownership_transferred',
      title: 'Ownership передан',
      accentClassName: 'text-fuchsia-700 dark:text-fuchsia-300',
    }
  }

  return {
    kind: 'generic',
    title: 'Системное событие',
    accentClassName: 'text-gray-600 dark:text-gray-300',
  }
}
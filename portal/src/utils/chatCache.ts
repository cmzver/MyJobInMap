/**
 * chatCache — точечные патчи React Query кэша по WebSocket-событиям чата.
 * ====================================================================
 * Вместо invalidate→рефетч тяжёлой истории сообщений мы правим кэш на месте:
 * входящее событие уже несёт полный MessageResponse, поэтому рефетч не нужен.
 *
 * Структура кэша сообщений — InfiniteData<MessageListResponse>:
 *   pages[0]      — самый свежий батч (items по возрастанию id),
 *   pages[last]   — самый старый батч.
 * Новое сообщение дописывается в конец pages[0].
 */
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/hooks/useChat'
import type {
  ConversationListItem,
  LastMessagePreview,
  MessageListResponse,
  MessageResponse,
} from '@/types/chat'

type MessagesCache = InfiniteData<MessageListResponse>

function mapMessages(
  cache: MessagesCache,
  fn: (message: MessageResponse) => MessageResponse,
): MessagesCache {
  return {
    ...cache,
    pages: cache.pages.map((page) => ({ ...page, items: page.items.map(fn) })),
  }
}

function hasMessage(cache: MessagesCache, messageId: number): boolean {
  return cache.pages.some((page) => page.items.some((m) => m.id === messageId))
}

/** Добавить новое сообщение в кэш (если история чата уже загружена). */
export function appendMessageToCache(
  qc: QueryClient,
  conversationId: number,
  message: MessageResponse,
): void {
  const key = chatKeys.messages(conversationId)
  const cache = qc.getQueryData<MessagesCache>(key)
  // Кэша нет → чат не открывали, история подтянется свежей при открытии.
  if (!cache || cache.pages.length === 0) return

  // Дедуп на случай гонки с параллельным рефетчем.
  if (hasMessage(cache, message.id)) {
    qc.setQueryData(key, mapMessages(cache, (m) => (m.id === message.id ? message : m)))
    return
  }

  const pages = cache.pages.map((page, index) =>
    index === 0 ? { ...page, items: [...page.items, message] } : page,
  )
  qc.setQueryData(key, { ...cache, pages })
}

/** Заменить сообщение целиком (например, после загрузки вложения). */
export function replaceMessageInCache(
  qc: QueryClient,
  conversationId: number,
  message: MessageResponse,
): void {
  const key = chatKeys.messages(conversationId)
  const cache = qc.getQueryData<MessagesCache>(key)
  if (!cache) return
  qc.setQueryData(key, mapMessages(cache, (m) => (m.id === message.id ? message : m)))
}

/** Частично обновить сообщение (текст/флаги). */
export function patchMessageInCache(
  qc: QueryClient,
  conversationId: number,
  messageId: number,
  patch: Partial<MessageResponse>,
): void {
  const key = chatKeys.messages(conversationId)
  const cache = qc.getQueryData<MessagesCache>(key)
  if (!cache) return
  qc.setQueryData(key, mapMessages(cache, (m) => (m.id === messageId ? { ...m, ...patch } : m)))
}

/** Пометить сообщение удалённым (soft delete). */
export function markMessageDeletedInCache(
  qc: QueryClient,
  conversationId: number,
  messageId: number,
): void {
  patchMessageInCache(qc, conversationId, messageId, { is_deleted: true })
}

function toPreview(message: MessageResponse): LastMessagePreview {
  let text = message.text ?? null
  if (!text && message.message_type === 'task') {
    text = message.attached_task?.task_number
      ? `📋 Заявка №${message.attached_task.task_number}`
      : '📋 Заявка'
  }
  return {
    id: message.id,
    text,
    sender_name: message.sender_name,
    message_type: message.message_type,
    created_at: message.created_at,
  }
}

/**
 * Обновить превью/счётчики чата в списке по новому сообщению.
 * Затрагивает оба варианта кэша (с архивом и без).
 */
export function bumpConversationListCache(
  qc: QueryClient,
  message: MessageResponse,
  options: { incrementUnread: boolean; mentionsMe: boolean },
): void {
  qc.setQueriesData<ConversationListItem[]>(
    { queryKey: chatKeys.conversationsRoot() },
    (list) => {
      if (!list) return list
      return list.map((conversation) =>
        conversation.id === message.conversation_id
          ? {
              ...conversation,
              last_message: toPreview(message),
              updated_at: message.created_at,
              unread_count: options.incrementUnread
                ? conversation.unread_count + 1
                : conversation.unread_count,
              unread_mention_count:
                options.incrementUnread && options.mentionsMe
                  ? conversation.unread_mention_count + 1
                  : conversation.unread_mention_count,
            }
          : conversation,
      )
    },
  )
}

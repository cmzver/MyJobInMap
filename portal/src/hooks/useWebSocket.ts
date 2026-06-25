/**
 * useWebSocket — React hook для WebSocket уведомлений
 * ====================================================
 * 
 * Подключается к ws://host/ws?token=JWT и слушает события:
 * - task_created, task_updated, task_status_changed
 * - task_assigned, task_assigned_to_me, task_deleted
 * - chat_message, chat_message_edited, chat_message_deleted
 * - chat_reaction, chat_read, chat_typing
 * 
 * Автоматически реконнектится при потере соединения.
 * Инвалидирует React Query кэш при получении события.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { myTaskKeys } from '@/hooks/useTasks'
import { chatKeys } from '@/hooks/useChat'
import {
  appendMessageToCache,
  bumpConversationListCache,
  markMessageDeletedInCache,
  patchMessageInCache,
  replaceMessageInCache,
} from '@/utils/chatCache'
import type { MessageResponse } from '@/types/chat'
import toast from 'react-hot-toast'

export interface WsEvent {
  type: string
  data: Record<string, unknown>
  timestamp: string
}

type ChatTypingHandler = (conversationId: number, userId: number, isTyping: boolean) => void
type ChatReadHandler = (conversationId: number, userId: number, lastMessageId: number) => void

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30000
const PING_INTERVAL_MS = 30000

// Глобальный ref на WS для отправки из компонентов
let globalWs: WebSocket | null = null
let chatTypingListeners: ChatTypingHandler[] = []
let chatReadListeners: ChatReadHandler[] = []
// Открытый сейчас чат — чтобы не считать его непрочитанным и не спамить тостами.
let activeChatConversationId: number | null = null

export function sendWsMessage(message: Record<string, unknown>) {
  if (globalWs?.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(message))
  }
}

/** Сообщить WS-слою, какой чат открыт (null — ни одного). */
export function setActiveChatConversation(conversationId: number | null) {
  activeChatConversationId = conversationId
}

export function onChatTyping(handler: ChatTypingHandler) {
  chatTypingListeners.push(handler)
  return () => {
    chatTypingListeners = chatTypingListeners.filter(h => h !== handler)
  }
}

export function onChatRead(handler: ChatReadHandler) {
  chatReadListeners.push(handler)
  return () => {
    chatReadListeners = chatReadListeners.filter(h => h !== handler)
  }
}

export function useWebSocket() {
  const { token, isAuthenticated, user } = useAuthStore()
  const currentUserId = user?.id ?? 0
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS)

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WsEvent
        if (data.type === 'pong') return

        // Инвалидируем кэш React Query при обновлении данных
        switch (data.type) {
          case 'task_created':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            toast('📋 Новая заявка: ' + (data.data.task_number ?? ''), { icon: '🆕' })
            break

          case 'task_status_changed':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['sla'] })
            if (data.data.task_id) {
              queryClient.invalidateQueries({ queryKey: ['task', data.data.task_id] })
            }
            break

          case 'task_updated':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
            if (data.data.task_id) {
              queryClient.invalidateQueries({ queryKey: ['task', data.data.task_id] })
            }
            break

          case 'task_assigned':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
            break

          case 'task_assigned_to_me':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
            toast('📌 Вам назначена заявка: ' + (data.data.task_number ?? ''), { icon: '👤' })
            break

          case 'task_deleted':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            break

          // ===== Chat events =====
          // Событие несёт полный MessageResponse → патчим кэш на месте,
          // без рефетча истории сообщений.
          case 'chat_message': {
            const message = data.data as unknown as MessageResponse
            const convId = message.conversation_id
            if (typeof convId !== 'number') break
            const isActive = convId === activeChatConversationId
            appendMessageToCache(queryClient, convId, message)
            bumpConversationListCache(queryClient, message, {
              incrementUnread: !isActive,
              mentionsMe: (message.mentions ?? []).some((m) => m.user_id === currentUserId),
            })
            if (!isActive) {
              toast('💬 Новое сообщение', { icon: '✉️', duration: 2000 })
            }
            break
          }

          case 'chat_message_edited': {
            const convId = data.data.conversation_id as number | undefined
            if (typeof convId !== 'number') break
            if (data.data.message) {
              // Полное сообщение (например, после загрузки вложения) — замена целиком.
              replaceMessageInCache(queryClient, convId, data.data.message as unknown as MessageResponse)
            } else if (typeof data.data.message_id === 'number') {
              patchMessageInCache(queryClient, convId, data.data.message_id, {
                text: (data.data.text as string | null) ?? null,
                is_edited: true,
              })
            }
            break
          }

          case 'chat_message_deleted': {
            const convId = data.data.conversation_id as number | undefined
            if (typeof convId === 'number' && typeof data.data.message_id === 'number') {
              markMessageDeletedInCache(queryClient, convId, data.data.message_id)
            }
            // Превью чата могло смениться → лёгкая инвалидация списка (удаление редко).
            queryClient.invalidateQueries({ queryKey: chatKeys.conversationsRoot() })
            break
          }

          case 'chat_reaction':
            // Реакция несёт только emoji/user_id/action (без user_names) — патч
            // невозможен без рефетча; реакции редки, поэтому invalidate допустим.
            queryClient.invalidateQueries({ queryKey: chatKeys.messages(data.data.conversation_id as number) })
            break

          case 'chat_read':
            // Чужое прочтение не меняет мои счётчики — только read-receipts.
            if (
              typeof data.data.conversation_id === 'number' &&
              typeof data.data.user_id === 'number' &&
              typeof data.data.last_message_id === 'number'
            ) {
              chatReadListeners.forEach((handler) => handler(
                data.data.conversation_id as number,
                data.data.user_id as number,
                data.data.last_message_id as number,
              ))
            }
            break

          case 'chat_typing': {
            const convId = data.data.conversation_id as number
            const userId = data.data.user_id as number
            const isTyping = data.data.is_typing as boolean
            chatTypingListeners.forEach(h => h(convId, userId, isTyping))
            break
          }

          case 'chat_conversation_updated': {
            const convId = data.data.conversation_id as number | undefined
            const action = data.data.action as string | undefined
            queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
            if (typeof convId === 'number') {
              queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', convId] })
              if (action !== 'conversation_renamed' && action !== 'conversation_updated') {
                queryClient.invalidateQueries({ queryKey: ['chat', 'messages', convId] })
              }
            }
            switch (action) {
              case 'conversation_renamed':
                toast('Чат переименован', { icon: '✏️', duration: 2000 })
                break
              case 'member_added':
                toast('В чат добавлен участник', { icon: '➕', duration: 2000 })
                break
              case 'member_removed':
                toast('Состав чата обновлён', { icon: '👥', duration: 2000 })
                break
              case 'member_role_updated':
                toast('Роль участника изменена', { icon: '🛡️', duration: 2000 })
                break
              case 'ownership_transferred':
                toast('Ownership передан', { icon: '👑', duration: 2000 })
                break
            }
            break
          }

          case 'notification_created':
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            queryClient.invalidateQueries({ queryKey: ['support'] })
            if (data.data.type === 'support') {
              toast('Обновление по тикету поддержки', { icon: '🛟', duration: 2000 })
            }
            break

          default:
            // Для неизвестных типов — общая инвалидация
            break
        }
      } catch {
        // ignore parse errors
      }
    },
    [queryClient, currentUserId],
  )

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) return

    // Определяем URL WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      globalWs = ws

      ws.onopen = () => {
        reconnectDelayRef.current = RECONNECT_DELAY_MS // reset delay on success

        // Запускаем ping/pong keepalive
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        wsRef.current = null
        globalWs = null
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current)
          pingTimerRef.current = null
        }

        // Автоматический реконнект с exponential backoff
        if (isAuthenticated) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 2,
              MAX_RECONNECT_DELAY_MS,
            )
            connect()
          }, reconnectDelayRef.current)
        }
      }

      ws.onerror = () => {
        // onclose будет вызван автоматически после onerror
      }
    } catch {
      // Ошибка создания WebSocket — retry
      reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current)
    }
  }, [isAuthenticated, token, handleMessage])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        globalWs = null
      }
    }
  }, [connect])
}

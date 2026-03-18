/**
 * useWebSocket вЂ” React hook РґР»СЏ WebSocket СѓРІРµРґРѕРјР»РµРЅРёР№
 * ====================================================
 * 
 * РџРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ Рє ws://host/ws?token=JWT Рё СЃР»СѓС€Р°РµС‚ СЃРѕР±С‹С‚РёСЏ:
 * - task_created, task_updated, task_status_changed
 * - task_assigned, task_assigned_to_me, task_deleted
 * - chat_message, chat_message_edited, chat_message_deleted
 * - chat_reaction, chat_read, chat_typing
 * 
 * РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЂРµРєРѕРЅРЅРµРєС‚РёС‚СЃСЏ РїСЂРё РїРѕС‚РµСЂРµ СЃРѕРµРґРёРЅРµРЅРёСЏ.
 * РРЅРІР°Р»РёРґРёСЂСѓРµС‚ React Query РєСЌС€ РїСЂРё РїРѕР»СѓС‡РµРЅРёРё СЃРѕР±С‹С‚РёСЏ.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
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

// Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ ref РЅР° WS РґР»СЏ РѕС‚РїСЂР°РІРєРё РёР· РєРѕРјРїРѕРЅРµРЅС‚РѕРІ
let globalWs: WebSocket | null = null
let chatTypingListeners: ChatTypingHandler[] = []
let chatReadListeners: ChatReadHandler[] = []

export function sendWsMessage(message: Record<string, unknown>) {
  if (globalWs?.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(message))
  }
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
  const { token, isAuthenticated } = useAuthStore()
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

        // РРЅРІР°Р»РёРґРёСЂСѓРµРј РєСЌС€ React Query РїСЂРё РѕР±РЅРѕРІР»РµРЅРёРё РґР°РЅРЅС‹С…
        switch (data.type) {
          case 'task_created':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            toast('рџ“‹ РќРѕРІР°СЏ Р·Р°СЏРІРєР°: ' + (data.data.task_number ?? ''), { icon: 'рџ†•' })
            break

          case 'task_status_changed':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['sla'] })
            if (data.data.task_id) {
              queryClient.invalidateQueries({ queryKey: ['task', data.data.task_id] })
            }
            break

          case 'task_updated':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            if (data.data.task_id) {
              queryClient.invalidateQueries({ queryKey: ['task', data.data.task_id] })
            }
            break

          case 'task_assigned':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            break

          case 'task_assigned_to_me':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            toast('рџ“Њ Р’Р°Рј РЅР°Р·РЅР°С‡РµРЅР° Р·Р°СЏРІРєР°: ' + (data.data.task_number ?? ''), { icon: 'рџ‘¤' })
            break

          case 'task_deleted':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            break

          // ===== Chat events =====
          case 'chat_message':
            queryClient.invalidateQueries({ queryKey: ['chat', 'messages', data.data.conversation_id] })
            queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
            toast('рџ’¬ РќРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ', { icon: 'вњ‰пёЏ', duration: 2000 })
            break

          case 'chat_message_edited':
            queryClient.invalidateQueries({ queryKey: ['chat', 'messages', data.data.conversation_id] })
            break

          case 'chat_message_deleted':
            queryClient.invalidateQueries({ queryKey: ['chat', 'messages', data.data.conversation_id] })
            queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
            break

          case 'chat_reaction':
            queryClient.invalidateQueries({ queryKey: ['chat', 'messages', data.data.conversation_id] })
            break

          case 'chat_read':
            queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
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
                toast('Р§Р°С‚ РїРµСЂРµРёРјРµРЅРѕРІР°РЅ', { icon: 'вњЏпёЏ', duration: 2000 })
                break
              case 'member_added':
                toast('Р’ С‡Р°С‚ РґРѕР±Р°РІР»РµРЅ СѓС‡Р°СЃС‚РЅРёРє', { icon: 'вћ•', duration: 2000 })
                break
              case 'member_removed':
                toast('РЎРѕСЃС‚Р°РІ С‡Р°С‚Р° РѕР±РЅРѕРІР»С‘РЅ', { icon: 'рџ‘Ґ', duration: 2000 })
                break
              case 'member_role_updated':
                toast('Р РѕР»СЊ СѓС‡Р°СЃС‚РЅРёРєР° РёР·РјРµРЅРµРЅР°', { icon: 'рџ›ЎпёЏ', duration: 2000 })
                break
              case 'ownership_transferred':
                toast('Ownership РїРµСЂРµРґР°РЅ', { icon: 'рџ‘‘', duration: 2000 })
                break
            }
            break
          }

          default:
            // Р”Р»СЏ РЅРµРёР·РІРµСЃС‚РЅС‹С… С‚РёРїРѕРІ вЂ” РѕР±С‰Р°СЏ РёРЅРІР°Р»РёРґР°С†РёСЏ
            break
        }
      } catch {
        // ignore parse errors
      }
    },
    [queryClient],
  )

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) return

    // РћРїСЂРµРґРµР»СЏРµРј URL WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      globalWs = ws

      ws.onopen = () => {
        reconnectDelayRef.current = RECONNECT_DELAY_MS // reset delay on success

        // Р—Р°РїСѓСЃРєР°РµРј ping/pong keepalive
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

        // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№ СЂРµРєРѕРЅРЅРµРєС‚ СЃ exponential backoff
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
        // onclose Р±СѓРґРµС‚ РІС‹Р·РІР°РЅ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕСЃР»Рµ onerror
      }
    } catch {
      // РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ WebSocket вЂ” retry
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

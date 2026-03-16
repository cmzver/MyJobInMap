/**
 * useWebSocket — React hook для WebSocket уведомлений
 * ====================================================
 * 
 * Подключается к ws://host/ws?token=JWT и слушает события:
 * - task_created, task_updated, task_status_changed
 * - task_assigned, task_assigned_to_me, task_deleted
 * 
 * Автоматически реконнектится при потере соединения.
 * Инвалидирует React Query кэш при получении события.
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

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30000
const PING_INTERVAL_MS = 30000

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

        // Инвалидируем кэш React Query при обновлении данных
        switch (data.type) {
          case 'task_created':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            toast('📋 Новая заявка: ' + (data.data.task_number ?? ''), { icon: '🆕' })
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
            toast('📌 Вам назначена заявка: ' + (data.data.task_number ?? ''), { icon: '👤' })
            break

          case 'task_deleted':
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            break

          default:
            // Для неизвестных типов — общая инвалидация
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

    // Определяем URL WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

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
      }
    }
  }, [connect])
}

/* Service Worker — Web Push для портала.
 * Показывает уведомление о новом сообщении при закрытой/фоновой вкладке и
 * фокусирует/открывает чат по клику. Регистрируется из src/utils/webPush.ts.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = {}
  }

  const title = payload.title || 'Новое сообщение'
  const url = payload.url || '/chat'
  const options = {
    body: payload.body || '',
    data: { url },
    tag: payload.chat_id ? `chat-${payload.chat_id}` : undefined,
    renotify: Boolean(payload.chat_id),
  }

  event.waitUntil(
    (async () => {
      // Если окно портала сейчас в фокусе — пользователь уже видит in-app тост,
      // системное уведомление не дублируем. Иначе (свёрнуто/не в фокусе/закрыто)
      // показываем системный пуш.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const portalFocused = clients.some(
        (c) => c.focused && c.url.includes('/portal'),
      )
      if (portalFocused) return
      await self.registration.showNotification(title, options)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // Бэкенд шлёт путь относительно приложения (например, /chat); портал
  // обслуживается под /portal/.
  const path = (event.notification.data && event.notification.data.url) || '/chat'
  const target = new URL('/portal' + path, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes('/portal') && 'focus' in client) {
            client.focus()
            client.navigate(target).catch(() => {})
            return undefined
          }
        }
        return self.clients.openWindow(target)
      }),
  )
})

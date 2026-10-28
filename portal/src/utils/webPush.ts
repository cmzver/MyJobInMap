/**
 * webPush — регистрация service worker и управление Web Push подпиской.
 * Backend выдаёт VAPID public key (/push/vapid-public-key) и хранит подписки.
 */
import { pushApi } from '@/api/push'

const SW_URL = `${import.meta.env.BASE_URL}sw.js`

export type PushState = 'unsupported' | 'default' | 'denied' | 'granted'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Текущее состояние разрешения (без сетевых запросов). */
export function getPushPermission(): PushState {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission as PushState
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  // Явный ArrayBuffer-бэкинг — иначе lib.dom типизирует как ArrayBufferLike,
  // что несовместимо с applicationServerKey: BufferSource.
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  if (existing) return existing
  return navigator.serviceWorker.register(SW_URL, { scope: import.meta.env.BASE_URL })
}

/** Уже подписан ли браузер (есть активная push-подписка). */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return sub != null
  } catch {
    return false
  }
}

/**
 * Включить web push: зарегистрировать SW, запросить разрешение, подписаться,
 * отправить подписку на сервер. Возвращает true при успехе.
 */
export async function enablePush(): Promise<boolean> {
  if (!isPushSupported()) return false

  const { public_key, enabled } = await pushApi.getVapidPublicKey()
  if (!enabled || !public_key) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await getRegistration()
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    })
  }

  await pushApi.subscribe(sub.toJSON())
  return true
}

/** Отключить web push: отписаться локально и на сервере. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await pushApi.unsubscribe(endpoint).catch(() => {})
}

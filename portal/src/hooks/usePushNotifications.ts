import { useCallback, useEffect, useState } from 'react'
import {
  disablePush,
  enablePush,
  getPushPermission,
  isPushSupported,
  isSubscribed,
} from '@/utils/webPush'

/**
 * usePushNotifications — состояние и переключение Web Push подписки браузера.
 * `supported` — поддерживает ли браузер; `subscribed` — есть ли активная
 * подписка; `busy` — идёт ли запрос разрешения/подписки.
 */
export function usePushNotifications() {
  const [supported] = useState(isPushSupported)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!supported) return
    setDenied(getPushPermission() === 'denied')
    isSubscribed().then(setSubscribed)
  }, [supported])

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (subscribed) {
        await disablePush()
        setSubscribed(false)
      } else {
        const ok = await enablePush()
        setSubscribed(ok)
        setDenied(getPushPermission() === 'denied')
      }
    } finally {
      setBusy(false)
    }
  }, [busy, subscribed])

  return { supported, subscribed, busy, denied, toggle }
}

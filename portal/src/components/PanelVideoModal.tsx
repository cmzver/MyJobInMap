import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera } from 'lucide-react'
import Modal from '@/components/Modal'
import { intercomApi } from '@/api/intercom'

/** Видео с камеры панели: опрос JPEG-кадров раз в секунду, только пока окно открыто. */
export default function PanelVideoModal({
  addressId,
  panelId,
  title,
  onClose,
}: {
  addressId: number
  panelId: number
  title: string
  onClose: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const blob = await intercomApi.getSnapshot(addressId, panelId)
        if (!active) return
        const url = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setSrc(url)
        setError(null)
      } catch {
        if (active) setError('Не удалось получить кадр с панели')
      }
      if (active) timer = setTimeout(tick, 1000)
    }
    tick()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [addressId, panelId])

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Видео — ${title}`}
      size="xl"
    >
      <div className="flex items-center justify-center bg-black rounded-lg overflow-hidden aspect-video">
        {src ? (
          <img src={src} alt="Кадр с панели" className="max-h-full max-w-full" />
        ) : error ? (
          <div className="text-red-400 text-sm flex flex-col items-center gap-2 p-8">
            <AlertTriangle className="h-8 w-8" />
            {error}
          </div>
        ) : (
          <div className="text-gray-400 text-sm flex flex-col items-center gap-2 p-8">
            <Camera className="h-8 w-8 animate-pulse" />
            Подключение к камере…
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Кадр обновляется раз в секунду. Закройте окно, чтобы прекратить запросы к панели.
      </p>
    </Modal>
  )
}

/**
 * Раздел «Сетевые панели» карточки адреса.
 *
 * Список домофонных панелей (Beward) на объекте + «живые» действия по запросу:
 * статус замка, открыть/закрыть, показать видео, код записи ключей.
 * Подключение к панели происходит только по нажатию — без фонового опроса.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  DoorOpen,
  DoorClosed,
  Video,
  KeyRound,
  RefreshCw,
  Lock,
  Unlock,
  X,
  AlertTriangle,
  Camera,
} from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import { intercomApi } from '@/api/intercom'
import {
  useCreatePanel,
  useUpdatePanel,
  useDeletePanel,
} from '@/hooks/useAddressCard'
import {
  useOpenDoor,
  useCloseDoor,
  useLockStatus,
  useMifareScanCode,
} from '@/hooks/useIntercom'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import type {
  IntercomPanel,
  CreateIntercomPanelData,
} from '@/types/address'

// ============================================
// Форма панели (создание/редактирование)
// ============================================

interface PanelFormProps {
  panel: IntercomPanel | null
  onSubmit: (data: CreateIntercomPanelData) => void
  onCancel: () => void
  isLoading?: boolean
}

function PanelForm({ panel, onSubmit, onCancel, isLoading }: PanelFormProps) {
  const [ip, setIp] = useState(panel?.ip || '')
  const [port, setPort] = useState(String(panel?.port ?? 80))
  const [entrance, setEntrance] = useState(panel?.entrance || '')
  const [label, setLabel] = useState(panel?.label || '')
  const [model, setModel] = useState(panel?.model || '')
  const [notes, setNotes] = useState(panel?.notes || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      vendor: panel?.vendor || 'beward',
      ip: ip.trim(),
      port: Number(port) || 80,
      entrance: entrance.trim() || null,
      label: label.trim() || null,
      model: model.trim() || null,
      notes: notes.trim() || null,
      is_active: panel?.is_active ?? true,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="IP-адрес"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="10.80.80.222"
          required
        />
        <Input
          label="Порт"
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="80"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Подъезд"
          value={entrance}
          onChange={(e) => setEntrance(e.target.value)}
          placeholder="4"
        />
        <Input
          label="Модель"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="DKS15198"
        />
      </div>
      <Input
        label="Название"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Например: Главный вход"
      />
      <Textarea
        label="Заметки"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Отмена
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {panel ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  )
}

// ============================================
// Видео-модалка (опрос JPEG-кадров, только пока открыта)
// ============================================

function PanelVideoModal({
  addressId,
  panel,
  onClose,
}: {
  addressId: number
  panel: IntercomPanel
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
        const blob = await intercomApi.getSnapshot(addressId, panel.id)
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
  }, [addressId, panel.id])

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Видео — ${panel.label || panel.ip}`}
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

// ============================================
// Карточка одной панели + её действия
// ============================================

function PanelCard({
  addressId,
  panel,
  onEdit,
  onDelete,
  onVideo,
}: {
  addressId: number
  panel: IntercomPanel
  onEdit: () => void
  onDelete: () => void
  onVideo: () => void
}) {
  const [confirmAction, setConfirmAction] = useState<'open' | 'close' | null>(null)

  const lockQuery = useLockStatus(addressId, panel.id)
  const scanQuery = useMifareScanCode(addressId, panel.id)
  const openDoor = useOpenDoor(addressId)
  const closeDoor = useCloseDoor(addressId)

  const doorPending = openDoor.isPending || closeDoor.isPending

  const runDoor = (action: 'open' | 'close') => {
    const mut = action === 'open' ? openDoor : closeDoor
    mut.mutate(panel.id, {
      onSuccess: (data) => {
        showApiSuccess(data.is_open ? 'Дверь открыта' : 'Дверь закрыта')
        lockQuery.refetch()
      },
      onError: (err) => showApiError(err, 'Не удалось выполнить команду'),
    })
    setConfirmAction(null)
  }

  const lockBadge = (() => {
    if (lockQuery.isFetching) return { text: 'Проверка…', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
    if (lockQuery.data?.is_open === true)
      return { text: 'Открыта', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
    if (lockQuery.data?.is_open === false)
      return { text: 'Закрыта', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
    return null
  })()

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white">
              {panel.label || panel.ip}
            </span>
            {panel.entrance && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Подъезд {panel.entrance}
              </span>
            )}
            {!panel.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">
                выключена
              </span>
            )}
            {lockBadge && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${lockBadge.cls}`}>
                {lockBadge.text}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
            <span>{panel.ip}{panel.port !== 80 ? `:${panel.port}` : ''}</span>
            {panel.model && <span>{panel.model}</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Редактировать">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Удалить">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Код записи ключей */}
      {scanQuery.data && (
        <div className="mt-2 text-sm flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <KeyRound className="h-4 w-4 text-gray-400" />
          Код записи ключей:{' '}
          <span className="font-mono font-semibold">{scanQuery.data.code ?? '—'}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${scanQuery.data.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
            {scanQuery.data.active ? 'активен' : 'выключен'}
          </span>
        </div>
      )}

      {/* Действия */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setConfirmAction('open')}
          isLoading={openDoor.isPending}
          disabled={doorPending}
        >
          <DoorOpen className="h-4 w-4 mr-1" /> Открыть
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmAction('close')}
          isLoading={closeDoor.isPending}
          disabled={doorPending}
        >
          <DoorClosed className="h-4 w-4 mr-1" /> Закрыть
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => lockQuery.refetch()}
          isLoading={lockQuery.isFetching}
        >
          {lockQuery.data?.is_open ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
          Статус замка
        </Button>
        <Button variant="ghost" size="sm" onClick={onVideo}>
          <Video className="h-4 w-4 mr-1" /> Видео
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scanQuery.refetch()}
          isLoading={scanQuery.isFetching}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Код ключей
        </Button>
      </div>

      {confirmAction && (
        <Modal
          isOpen
          onClose={() => setConfirmAction(null)}
          title={confirmAction === 'open' ? 'Открыть дверь?' : 'Закрыть дверь?'}
          size="sm"
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {confirmAction === 'open'
              ? 'Это физически откроет дверь на объекте.'
              : 'Это физически закроет дверь на объекте.'}{' '}
            Панель «{panel.label || panel.ip}».
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Отмена
            </Button>
            <Button
              variant={confirmAction === 'open' ? 'primary' : 'danger'}
              onClick={() => runDoor(confirmAction)}
            >
              {confirmAction === 'open' ? 'Открыть' : 'Закрыть'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============================================
// Раздел целиком
// ============================================

export default function IntercomPanelsSection({
  addressId,
  panels,
}: {
  addressId: number
  panels: IntercomPanel[]
}) {
  const [formModal, setFormModal] = useState<{ open: boolean; panel: IntercomPanel | null }>({
    open: false,
    panel: null,
  })
  const [deleteConfirm, setDeleteConfirm] = useState<IntercomPanel | null>(null)
  const [videoPanel, setVideoPanel] = useState<IntercomPanel | null>(null)

  const createPanel = useCreatePanel(addressId)
  const updatePanel = useUpdatePanel(addressId)
  const deletePanel = useDeletePanel(addressId)

  const handleSubmit = async (data: CreateIntercomPanelData) => {
    try {
      if (formModal.panel) {
        await updatePanel.mutateAsync({ panelId: formModal.panel.id, data })
        showApiSuccess('Панель обновлена')
      } else {
        await createPanel.mutateAsync(data)
        showApiSuccess('Панель добавлена')
      }
      setFormModal({ open: false, panel: null })
    } catch (err) {
      showApiError(err, 'Ошибка сохранения панели')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deletePanel.mutateAsync(deleteConfirm.id)
      showApiSuccess('Панель удалена')
      setDeleteConfirm(null)
    } catch (err) {
      showApiError(err, 'Ошибка удаления панели')
    }
  }

  // Упорядочиваем по номеру подъезда (натурально: «1п, 2п, …»), затем по id.
  const sortedPanels = [...panels].sort((a, b) => {
    const num = (p: IntercomPanel) => {
      const m = (p.entrance || p.label || '').match(/\d+/)
      return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER
    }
    return num(a) - num(b) || a.id - b.id
  })

  return (
    <Card
      title="Сетевые панели"
      action={
        <Button size="sm" onClick={() => setFormModal({ open: true, panel: null })}>
          <Plus className="h-4 w-4 mr-1" /> Добавить панель
        </Button>
      }
    >
      {panels.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          На этом объекте пока нет сетевых панелей.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPanels.map((panel) => (
            <PanelCard
              key={panel.id}
              addressId={addressId}
              panel={panel}
              onEdit={() => setFormModal({ open: true, panel })}
              onDelete={() => setDeleteConfirm(panel)}
              onVideo={() => setVideoPanel(panel)}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={formModal.open}
        onClose={() => setFormModal({ open: false, panel: null })}
        title={formModal.panel ? 'Редактировать панель' : 'Добавить панель'}
      >
        <PanelForm
          panel={formModal.panel}
          onSubmit={handleSubmit}
          onCancel={() => setFormModal({ open: false, panel: null })}
          isLoading={createPanel.isPending || updatePanel.isPending}
        />
      </Modal>

      {deleteConfirm && (
        <Modal
          isOpen
          onClose={() => setDeleteConfirm(null)}
          title="Удалить панель?"
          size="sm"
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Панель «{deleteConfirm.label || deleteConfirm.ip}» будет удалена из объекта.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              <X className="h-4 w-4 mr-1" /> Отмена
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deletePanel.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Удалить
            </Button>
          </div>
        </Modal>
      )}

      {videoPanel && (
        <PanelVideoModal
          addressId={addressId}
          panel={videoPanel}
          onClose={() => setVideoPanel(null)}
        />
      )}
    </Card>
  )
}

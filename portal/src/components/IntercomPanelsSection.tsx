/**
 * Раздел «Сетевые панели» карточки адреса.
 *
 * Список домофонных панелей (Beward) на объекте + «живые» действия по запросу:
 * статус замка, открыть/закрыть, показать видео, код записи ключей.
 * Подключение к панели происходит только по нажатию — без фонового опроса.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
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
  Server,
} from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import PanelVideoModal from '@/components/PanelVideoModal'
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
    <li className="flex flex-col gap-1 px-4 py-1.5 text-sm sm:flex-row sm:items-center sm:gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Server className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="font-medium text-gray-900 dark:text-white">{panel.label || panel.ip}</span>
            {panel.entrance && !/подъезд/i.test(panel.label || '') && <Pill cls="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">подъезд {panel.entrance}</Pill>}
            {!panel.is_active && <Pill cls="bg-gray-100 text-gray-500 dark:bg-gray-700">выключена</Pill>}
            {lockBadge && <Pill cls={lockBadge.cls}>{lockBadge.text}</Pill>}
          </div>
          <p className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
            {panel.ip}{panel.port !== 80 ? `:${panel.port}` : ''}
            {panel.model && ` · ${panel.model}`}
            {scanQuery.data && (
              <>
                {' · код ключей '}
                <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">{scanQuery.data.code ?? '—'}</span>
                {!scanQuery.data.active && ' (выкл.)'}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-0.5">
        <Button
          size="sm"
          variant="outline"
          className="mr-1 h-7 px-2.5 text-primary-700 dark:text-primary-400"
          onClick={() => setConfirmAction('open')}
          isLoading={openDoor.isPending}
          disabled={doorPending}
        >
          <DoorOpen className="h-4 w-4 mr-1" /> Открыть
        </Button>
        <PanelAction title="Закрыть дверь" onClick={() => setConfirmAction('close')} disabled={doorPending}>
          <DoorClosed className="h-3.5 w-3.5" />
        </PanelAction>
        <PanelAction title="Проверить замок" onClick={() => lockQuery.refetch()} disabled={lockQuery.isFetching}>
          {lockQuery.data?.is_open ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        </PanelAction>
        <PanelAction title="Видео" onClick={onVideo}>
          <Video className="h-3.5 w-3.5" />
        </PanelAction>
        <PanelAction title="Код записи ключей" onClick={() => scanQuery.refetch()} disabled={scanQuery.isFetching}>
          {scanQuery.isFetching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
        </PanelAction>
        <span className="mx-1 hidden h-4 w-px bg-gray-200 dark:bg-gray-700 sm:block" aria-hidden />
        <PanelAction title="Редактировать" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </PanelAction>
        <PanelAction title="Удалить" danger onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </PanelAction>
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
    </li>
  )
}

function Pill({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs ${cls}`}>{children}</span>
}

function PanelAction({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700 ${danger ? 'hover:text-red-600 dark:hover:text-red-400' : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
    >
      {children}
    </button>
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
      flush
      title="Сетевые панели"
      action={
        <Button size="sm" variant="outline" onClick={() => setFormModal({ open: true, panel: null })}>
          <Plus className="h-4 w-4 mr-1" /> Добавить панель
        </Button>
      }
    >
      {panels.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          На этом объекте пока нет сетевых панелей.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
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
        </ul>
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
          panelId={videoPanel.id}
          title={videoPanel.label || videoPanel.ip}
          onClose={() => setVideoPanel(null)}
        />
      )}
    </Card>
  )
}

import { useState } from 'react'
import { Camera, CheckCircle2, DoorOpen, KeyRound, Lock, Unlock } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import { useLockStatus } from '@/hooks/useIntercom'
import {
  useResolveRemotely,
  useSnapshotPhoto,
  useTaskDoor,
  useTaskPanels,
  useTaskScanCode,
} from '@/hooks/useRemoteResolution'
import type { TaskPanel } from '@/types/address'
import type { TaskDetail } from '@/types/task'
import { showApiError, showApiSuccess } from '@/utils/apiError'

function panelTitle(panel: TaskPanel): string {
  return panel.label || (panel.entrance ? `Подъезд ${panel.entrance}` : `Панель ${panel.id}`)
}

function PanelRow({ panel, taskId }: { panel: TaskPanel; taskId: number }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const lock = useLockStatus(panel.address_id, panel.id)
  const door = useTaskDoor(panel.address_id, taskId)
  const scanCode = useTaskScanCode(panel.address_id, taskId)
  const snapshot = useSnapshotPhoto(taskId)

  const openDoor = () => {
    setConfirmOpen(false)
    door.mutate(panel.id, {
      onSuccess: () => {
        showApiSuccess('Дверь открыта')
        lock.refetch()
      },
      onError: (error) => showApiError(error, 'Не удалось открыть дверь'),
    })
  }

  const lockText =
    lock.data?.is_open === true ? 'открыта' : lock.data?.is_open === false ? 'закрыта' : null

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900 dark:text-white">{panelTitle(panel)}</span>
        {panel.model && <span className="text-xs text-gray-500 dark:text-gray-400">{panel.model}</span>}
        {lockText && (
          <span className="text-xs text-gray-500 dark:text-gray-400">· дверь {lockText}</span>
        )}
      </div>
      {scanCode.data && (
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Код записи ключей: <span className="font-mono font-semibold">{scanCode.data.code ?? '—'}</span>
          {!scanCode.data.active && <span className="text-gray-500"> (режим выключен на панели)</span>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" isLoading={door.isPending} onClick={() => setConfirmOpen(true)}>
          <DoorOpen className="mr-1 h-4 w-4" />
          Открыть дверь
        </Button>
        <Button size="sm" variant="ghost" isLoading={lock.isFetching} onClick={() => lock.refetch()}>
          {lock.data?.is_open ? <Unlock className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
          Замок
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isLoading={scanCode.isPending}
          onClick={() =>
            scanCode.mutate(panel.id, {
              onError: (error) => showApiError(error, 'Не удалось получить код'),
            })
          }
        >
          <KeyRound className="mr-1 h-4 w-4" />
          Код ключей
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isLoading={snapshot.isPending}
          onClick={() =>
            snapshot.mutate(panel.id, {
              onSuccess: () => showApiSuccess('Кадр с панели добавлен в фото'),
              onError: (error) => showApiError(error, 'Не удалось получить кадр'),
            })
          }
        >
          <Camera className="mr-1 h-4 w-4" />
          Кадр в фото
        </Button>
      </div>
      {lock.isError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Панель не ответила</p>}

      {confirmOpen && (
        <Modal isOpen onClose={() => setConfirmOpen(false)} title="Открыть дверь?" size="sm">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Это физически откроет дверь на объекте — «{panelTitle(panel)}». Действие запишется в историю заявки.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button onClick={openDoor}>Открыть</Button>
          </div>
        </Modal>
      )}
    </li>
  )
}

function ResolveModal({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const [comment, setComment] = useState('')
  const resolve = useResolveRemotely(taskId)
  const submit = () =>
    resolve.mutate(comment.trim(), {
      onSuccess: () => {
        showApiSuccess('Заявка закрыта как решённая удалённо')
        onClose()
      },
      onError: (error) => showApiError(error, 'Не удалось закрыть заявку'),
    })

  return (
    <Modal isOpen onClose={onClose} title="Решено удалённо" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Заявка закроется без выезда: если никто не назначен — на вас, и попадёт в долю удалённо решённых.
        </p>
        <Textarea
          label="Что сделали"
          rows={3}
          maxLength={1000}
          placeholder="Открыли дверь жильцу, выдали код записи ключей…"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={comment.trim().length < 3} isLoading={resolve.isPending} onClick={submit}>
            Закрыть заявку
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Домофон на адресе заявки: открыть дверь, код ключей, кадр — и закрыть без выезда. */
export default function TaskRemoteSection({ task, canResolve }: { task: TaskDetail; canResolve: boolean }) {
  const { data: panels = [] } = useTaskPanels(task.id, task.address_id != null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const isOpen = task.status === 'NEW' || task.status === 'IN_PROGRESS'

  if (panels.length === 0) return null

  return (
    <Card
      compact
      title="Удалённо"
      action={
        canResolve &&
        isOpen && (
          <Button size="sm" variant="outline" onClick={() => setResolveOpen(true)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Решено удалённо
          </Button>
        )
      }
    >
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {panels.map((panel) => (
          <PanelRow key={panel.id} panel={panel} taskId={task.id} />
        ))}
      </ul>
      {resolveOpen && <ResolveModal taskId={task.id} onClose={() => setResolveOpen(false)} />}
    </Card>
  )
}

import { useRef, useState } from 'react'
import { FilePlus2, FileText, Paperclip, Upload } from 'lucide-react'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import ActFormModal from '@/components/acts/ActFormModal'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import { useCancelAct, useTaskActs, useUploadActScan } from '@/hooks/useActs'
import { actsApi, type Act } from '@/api/acts'
import type { TaskDetail } from '@/types/task'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'

function CancelActModal({ act, onClose }: { act: Act; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const cancelAct = useCancelAct()
  const submit = () =>
    cancelAct.mutate(
      { id: act.id, reason: reason.trim() },
      {
        onSuccess: () => {
          showApiSuccess(`Акт №${act.number} аннулирован`)
          onClose()
        },
        onError: (error) => showApiError(error, 'Не удалось аннулировать акт'),
      },
    )
  return (
    <Modal isOpen onClose={onClose} title={`Аннулировать акт №${act.number}`} size="sm">
      <div className="space-y-4">
        <Textarea
          label="Причина"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" disabled={reason.trim().length < 3} isLoading={cancelAct.isPending} onClick={submit}>
            Аннулировать
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Акты по заявке: оформить, распечатать на подпись, приложить подписанный скан. */
export default function TaskActsSection({
  task,
  canCreate,
  canManage,
}: {
  task: TaskDetail
  canCreate: boolean
  canManage: boolean
}) {
  const { data: acts = [], isLoading } = useTaskActs(task.id)
  const uploadScan = useUploadActScan()
  const fileInput = useRef<HTMLInputElement>(null)
  const [scanTarget, setScanTarget] = useState<Act | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [supersedes, setSupersedes] = useState<Act | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Act | null>(null)

  const open = (action: () => Promise<void>) =>
    action().catch((error) => showApiError(error, 'Не удалось открыть файл'))

  const onScanPicked = (file: File | undefined) => {
    if (!file || !scanTarget) return
    uploadScan.mutate(
      { id: scanTarget.id, file },
      {
        onSuccess: (act) => showApiSuccess(`Акт №${act.number} подписан`),
        onError: (error) => showApiError(error, 'Не удалось загрузить скан'),
        onSettled: () => setScanTarget(null),
      },
    )
  }

  return (
    <Card
      compact
      title="Акты"
      action={
        canCreate && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSupersedes(null)
              setFormOpen(true)
            }}
          >
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            Оформить акт
          </Button>
        )
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(event) => {
          onScanPicked(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Загружаем…</p>
      ) : acts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Актов нет. Оформите акт, распечатайте его на подпись и приложите скан подписанного.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {acts.map((act) => {
            const status = ACT_STATUS[act.status]
            const active = act.status !== 'cancelled'
            return (
              <li key={act.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-gray-900 dark:text-white">№{act.number}</span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    от {formatDateOnly(act.created_at)} · {formatRub(act.total_amount)}
                    {act.customer_name && ` · ${act.customer_name}`}
                    {act.cancel_reason && ` · ${act.cancel_reason}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => open(() => actsApi.openPdf(act.id))}>
                    <FileText className="mr-1 h-4 w-4" />
                    PDF
                  </Button>
                  {act.has_scan && (
                    <Button size="sm" variant="ghost" onClick={() => open(() => actsApi.openScan(act.id))}>
                      <Paperclip className="mr-1 h-4 w-4" />
                      Скан
                    </Button>
                  )}
                  {canCreate && act.status === 'pending_signature' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={uploadScan.isPending && scanTarget?.id === act.id}
                      onClick={() => {
                        setScanTarget(act)
                        fileInput.current?.click()
                      }}
                    >
                      <Upload className="mr-1 h-4 w-4" />
                      Подписанный скан
                    </Button>
                  )}
                  {canCreate && active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSupersedes(act)
                        setFormOpen(true)
                      }}
                    >
                      Исправить
                    </Button>
                  )}
                  {canManage && active && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelTarget(act)}>
                      Аннулировать
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {formOpen && (
        <ActFormModal task={task} supersedes={supersedes} isOpen={formOpen} onClose={() => setFormOpen(false)} />
      )}
      {cancelTarget && <CancelActModal act={cancelTarget} onClose={() => setCancelTarget(null)} />}
    </Card>
  )
}

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, PenLine } from 'lucide-react'
import { cabinetApi, type CabinetAct } from '@/api/cabinet'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import SignaturePad, { type SignaturePadHandle } from '@/components/acts/SignaturePad'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { actTitle } from './cabinetLabels'

const TASK_STATUS: Record<string, 'info' | 'warning' | 'success' | 'gray'> = {
  NEW: 'info',
  IN_PROGRESS: 'warning',
  DONE: 'success',
  CANCELLED: 'gray',
}

export function TaskStatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge variant={TASK_STATUS[status] ?? 'gray'}>{label}</Badge>
}

export function ActStatusBadge({ status }: { status: string }) {
  const meta = ACT_STATUS[status as keyof typeof ACT_STATUS] ?? { label: status, variant: 'gray' as const }
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

/** Строка акта: номер, сумма, статус, PDF и подпись, если акт её ждёт. */
export function ActRow({ act }: { act: CabinetAct }) {
  const [signing, setSigning] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    setDownloading(true)
    try {
      await cabinetApi.downloadActPdf(act)
    } catch (error) {
      showApiError(error, 'Не удалось скачать PDF')
    } finally {
      setDownloading(false)
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{actTitle(act)}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          № {act.number} от {formatDateOnly(act.created_at)}
          {act.signed_at && ` · подписан ${formatDateOnly(act.signed_at)}`}
        </p>
      </div>
      <span className="text-sm tabular-nums text-gray-900 dark:text-white">{formatRub(Number(act.total_amount))}</span>
      <ActStatusBadge status={act.status} />
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" isLoading={downloading} onClick={download} aria-label={`PDF акта ${act.number}`}>
          <Download className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">PDF</span>
        </Button>
        {act.status === 'pending_signature' && (
          <Button size="sm" onClick={() => setSigning(true)}>
            <PenLine className="mr-1 h-4 w-4" />
            Подписать
          </Button>
        )}
      </div>
      {signing && <SignActModal act={act} onClose={() => setSigning(false)} />}
    </li>
  )
}

function SignActModal({ act, onClose }: { act: CabinetAct; onClose: () => void }) {
  const pad = useRef<SignaturePadHandle>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [consent, setConsent] = useState(false)
  const client = useQueryClient()
  const sign = useMutation({
    mutationFn: async () => {
      const png = await pad.current?.toPng()
      if (!png || !pad.current) throw new Error('Распишитесь на площадке')
      return cabinetApi.signAct(act.id, png, pad.current.strokes())
    },
    onSuccess: () => {
      showApiSuccess('Акт подписан')
      client.invalidateQueries({ queryKey: ['cabinet'] })
      onClose()
    },
    onError: (error) => showApiError(error, 'Не удалось подписать акт'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Подписать акт № ${act.number}`}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {actTitle(act)} на сумму {formatRub(Number(act.total_amount))}. Перед подписью откройте PDF и проверьте акт.
        </p>
        <SignaturePad ref={pad} onChange={setIsEmpty} />
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          С актом ознакомлен(а), работы принимаю. Подпись ставлю от имени контрагента.
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={isEmpty || !consent} isLoading={sign.isPending} onClick={() => sign.mutate()}>
            Подписать
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">{children}</p>
}

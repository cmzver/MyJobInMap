import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileText } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Spinner from '@/components/Spinner'
import SignaturePad, { type SignaturePadHandle } from '@/components/acts/SignaturePad'
import { formatRub } from '@/components/acts/actLabels'
import { publicActsApi, type PublicAct } from '@/api/publicActs'
import { formatDateOnly } from '@/utils/dateFormat'
import { getApiErrorMessage } from '@/utils/apiError'
import PublicShell, { PublicCard } from './PublicShell'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const publicActKey = (token: string) => ['public-act', token] as const

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 break-words text-sm text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

function ActBody({ act }: { act: PublicAct }) {
  const lines = act.lines ?? []
  return (
    <PublicCard className="space-y-5">
      <div>
        {act.organization && <p className="eyebrow">{act.organization}</p>}
        <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{act.title}</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          № {act.number}
          {act.issued_local && ` от ${act.issued_local}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Заявка" value={act.task_number} />
        <Fact label="Адрес" value={act.address} />
        <Fact label="Исполнитель" value={act.worker} />
        <Fact label="Заказчик" value={act.customer_name} />
      </div>

      {lines.length > 0 && (
        <div>
          <p className="eyebrow">Работы и материалы</p>
          <ul className="mt-2 space-y-2">
            {lines.map((line, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-gray-900 dark:text-white">{line.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {line.line_type === 'material' ? 'материал · ' : ''}
                    {line.qty} {line.unit}
                    {act.show_prices && line.price && ` × ${formatRub(Number(line.price))}`}
                  </p>
                </div>
                {act.show_prices && line.amount && (
                  <span className="shrink-0 font-medium text-gray-900 dark:text-white">
                    {formatRub(Number(line.amount))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {act.show_prices && act.total && Number(act.total) > 0 && (
            <p className="mt-3 text-right text-base font-semibold text-gray-900 dark:text-white">
              Итого: {formatRub(Number(act.total))}
            </p>
          )}
        </div>
      )}

      {act.work_summary && (
        <div>
          <p className="eyebrow">Выполненные работы</p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-900 dark:text-white">{act.work_summary}</p>
        </div>
      )}
      {act.no_claims && act.acceptance_text && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{act.acceptance_text}</p>
      )}
      {act.customer_remarks && (
        <div>
          <p className="eyebrow">Замечания заказчика</p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-900 dark:text-white">{act.customer_remarks}</p>
        </div>
      )}
    </PublicCard>
  )
}

function SignForm({ act, token }: { act: PublicAct; token: string }) {
  const queryClient = useQueryClient()
  const pad = useRef<SignaturePadHandle>(null)
  const [name, setName] = useState(act.customer_name ?? '')
  const [consent, setConsent] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const sign = useMutation({
    mutationFn: async () => {
      const png = await pad.current?.toPng()
      if (!png || !pad.current) throw new Error('Распишитесь на площадке')
      return publicActsApi.sign(token, { png, strokes: pad.current.strokes(), signerName: name.trim() })
    },
    onSuccess: (signed) => queryClient.setQueryData(publicActKey(token), signed),
  })
  const ready = name.trim().length >= 2 && consent && !isEmpty

  return (
    <PublicCard className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Подпись заказчика</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Проверьте работы и сумму, затем распишитесь пальцем или мышью.
        </p>
      </div>
      <Input
        label="Фамилия и инициалы"
        value={name}
        maxLength={200}
        autoComplete="name"
        onChange={(event) => setName(event.target.value)}
      />
      <SignaturePad ref={pad} onChange={setIsEmpty} />
      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        С актом ознакомлен(а) и подписываю его
      </label>
      {sign.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {getApiErrorMessage(sign.error, 'Не удалось подписать акт')}
        </p>
      )}
      <Button className="w-full" size="lg" disabled={!ready} isLoading={sign.isPending} onClick={() => sign.mutate()}>
        Подписать акт
      </Button>
    </PublicCard>
  )
}

/** Акт по ссылке от мастера: посмотреть, скачать PDF, подписать, если ждёт подписи. */
export default function PublicActPage() {
  const { token = '' } = useParams()
  const { data: act, isLoading, error } = useQuery({
    queryKey: publicActKey(token),
    queryFn: () => publicActsApi.get(token),
    retry: false,
    enabled: token.length > 0,
  })
  useDocumentTitle(act ? `Акт № ${act.number}` : 'Акт')

  if (isLoading) {
    return (
      <PublicShell>
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      </PublicShell>
    )
  }

  if (!act) {
    return (
      <PublicShell>
        <PublicCard className="text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Акт недоступен</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {getApiErrorMessage(error, 'Ссылка недействительна или устарела — попросите новую')}
          </p>
        </PublicCard>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      {act.status === 'signed' && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Акт подписан{act.signed_local && ` ${act.signed_local}`}. Скачайте PDF — это ваш экземпляр.
          </p>
        </div>
      )}
      <ActBody act={act} />
      <a
        href={publicActsApi.pdfUrl(token)}
        className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
      >
        <Download className="h-4 w-4" />
        Скачать PDF
      </a>
      {act.can_sign && <SignForm act={act} token={token} />}
      <p className="text-center text-xs text-gray-400">Ссылка действует до {formatDateOnly(act.expires_at)}</p>
    </PublicShell>
  )
}

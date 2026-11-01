import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { AlertTriangle, ShieldCheck, ShieldX } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Spinner from '@/components/Spinner'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import { publicActsApi, type ActVerification } from '@/api/publicActs'
import { getApiErrorMessage } from '@/utils/apiError'
import PublicShell, { PublicCard } from './PublicShell'

const MIN_HASH = 16

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 break-words text-sm text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

function signedText(result: ActVerification): string | null {
  if (!result.signed_local) return null
  const how = { screen: 'на экране', link: 'по ссылке', paper: 'на бумаге' }[result.signed_via ?? ''] ?? ''
  return `${result.signed_local}${how && `, ${how}`}`
}

function Result({ result }: { result: ActVerification }) {
  const cancelled = result.status === 'cancelled'
  return (
    <PublicCard className="space-y-4">
      <div className="flex items-start gap-3">
        {cancelled ? (
          <AlertTriangle className="h-7 w-7 shrink-0 text-amber-500" />
        ) : (
          <ShieldCheck className="h-7 w-7 shrink-0 text-green-600 dark:text-green-400" />
        )}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {cancelled ? 'Акт аннулирован' : 'Акт подлинный'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {cancelled
              ? result.replaced_by
                ? `Заменён актом №${result.replaced_by}.`
                : 'Документ больше не действует.'
              : 'Распечатка совпадает с актом в системе.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Номер" value={`№ ${result.number}${result.issued_local ? ` от ${result.issued_local}` : ''}`} />
        <Fact label="Организация" value={result.organization} />
        <Fact label="Статус" value={ACT_STATUS[result.status].label} />
        <Fact label="Подписан" value={signedText(result)} />
        <Fact label="Исполнитель" value={result.worker} />
        <Fact label="Сумма" value={result.total ? formatRub(Number(result.total)) : null} />
      </div>
      <div>
        <p className="eyebrow">Контрольная сумма</p>
        <p className="mt-0.5 break-all font-mono text-xs text-gray-600 dark:text-gray-300">{result.document_hash}</p>
      </div>
    </PublicCard>
  )
}

/** Проверка подлинности распечатки: номер и контрольная сумма из подвала или QR. */
export default function ActVerifyPage() {
  const [params, setParams] = useSearchParams()
  const number = params.get('n')?.trim() ?? ''
  const hash = params.get('h')?.trim().toLowerCase() ?? ''
  const [form, setForm] = useState({ number, hash })
  const enabled = number.length > 0 && hash.length >= MIN_HASH

  const { data, isFetching, error } = useQuery({
    queryKey: ['act-verify', number, hash],
    queryFn: () => publicActsApi.verify(number, hash),
    enabled,
    retry: false,
  })
  const notFound = axios.isAxiosError(error) && error.response?.status === 404

  return (
    <PublicShell>
      <PublicCard>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Проверка акта</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Номер и контрольная сумма — в подвале каждой страницы акта. Можно отсканировать QR-код рядом.
        </p>
        <form
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            setParams({ n: form.number.trim(), h: form.hash.trim().toLowerCase() })
          }}
        >
          <Input
            label="Номер акта"
            value={form.number}
            maxLength={32}
            onChange={(event) => setForm({ ...form, number: event.target.value })}
          />
          <Input
            label="Контрольная сумма"
            value={form.hash}
            maxLength={64}
            placeholder="16 знаков"
            className="font-mono"
            onChange={(event) => setForm({ ...form, hash: event.target.value })}
          />
          <Button type="submit" disabled={!form.number.trim() || form.hash.trim().length < MIN_HASH}>
            Проверить
          </Button>
        </form>
      </PublicCard>

      {isFetching && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {!isFetching && data && <Result result={data} />}
      {!isFetching && error && (
        <PublicCard className="flex items-start gap-3">
          <ShieldX className="h-7 w-7 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {notFound ? 'Акт не найден' : 'Не удалось проверить'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {notFound
                ? 'Номер или контрольная сумма не совпадают. Если акт подписали после печати, сверяйте с подписанным экземпляром.'
                : getApiErrorMessage(error)}
            </p>
          </div>
        </PublicCard>
      )}
    </PublicShell>
  )
}

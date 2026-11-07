import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Ban, Building2, Edit, FileCheck2, FileText, Search, Upload } from 'lucide-react'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import ClientAccountsCard from '@/components/counterparties/ClientAccountsCard'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Spinner from '@/components/Spinner'
import CounterpartyFormModal from '@/components/counterparties/CounterpartyFormModal'
import { CancelActModal } from '@/components/acts/TaskActsSection'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import { useUploadActScan } from '@/hooks/useActs'
import { useAddresses } from '@/hooks/useAddresses'
import {
  counterpartyKeys,
  useCounterparties,
  useCounterparty,
  useCounterpartyAddresses,
  useCounterpartyMutations,
  useSummaryActs,
  useSummaryPreview,
} from '@/hooks/useCounterparties'
import { actsApi, type Act } from '@/api/acts'
import type { Counterparty } from '@/api/counterparties'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'

/** Контрагент: реквизиты, объекты и сводный акт за месяц. */
export default function CounterpartyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const counterpartyId = Number(id)
  const navigate = useNavigate()
  const query = useCounterparty(counterpartyId)
  const addresses = useCounterpartyAddresses(counterpartyId)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)

  if (!query.data) {
    return <QueryStatePanel state={query.isError ? 'error' : 'loading'} onRetry={query.refetch} isRetrying={query.isFetching} />
  }
  const counterparty = query.data
  const contract = [counterparty.contract_number, counterparty.contract_date && `от ${counterparty.contract_date}`]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="space-y-4">
      <PageHeader
        onBack={() => navigate('/counterparties')}
        icon={Building2}
        title={<span className="truncate">{counterparty.name}</span>}
        description={counterparty.legal_name || 'Контрагент'}
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Редактировать
          </Button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card flush title="Реквизиты">
            <dl className="space-y-2 px-4 py-3 text-sm">
              <Fact label="ИНН" value={counterparty.inn} />
              <Fact label="КПП" value={counterparty.kpp} />
              <Fact label="ОГРН" value={counterparty.ogrn} />
              <Fact label="Договор" value={contract} />
              <Fact
                label="Подписант"
                value={[counterparty.signer_position, counterparty.signer_name].filter(Boolean).join(', ')}
              />
              <Fact label="Телефон" value={counterparty.phone} />
              <Fact label="Email" value={counterparty.email} />
            </dl>
            {(counterparty.legal_address || counterparty.bank_name) && (
              <div className="space-y-1 border-t border-gray-100 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                {counterparty.legal_address && <p>{counterparty.legal_address}</p>}
                {counterparty.bank_name && (
                  <p>
                    {counterparty.bank_name}
                    {counterparty.bik && `, БИК ${counterparty.bik}`}
                    {counterparty.account && `, р/с ${counterparty.account}`}
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card
            flush
            title={`Объекты · ${addresses.data?.length ?? 0}`}
            action={
              <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
                Изменить
              </Button>
            }
          >
            {addresses.isLoading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : !addresses.data?.length ? (
              <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Объекты не привязаны</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {addresses.data.map((address) => (
                  <li key={address.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <Link
                      to={`/addresses/${address.id}`}
                      className="min-w-0 flex-1 truncate text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                      title={address.address}
                    >
                      {address.address}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {address.monthly_cost ? formatRub(address.monthly_cost) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(counterparty.monthly_total ?? 0) > 0 && (
              <p className="border-t border-gray-100 px-4 py-2 text-right text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                абонплата в месяц: <span className="font-semibold text-gray-900 dark:text-white">{formatRub(counterparty.monthly_total ?? 0)}</span>
              </p>
            )}
          </Card>

          <ClientAccountsCard counterparty={counterparty} />
        </aside>

        <div className="min-w-0 space-y-4">
          <SummarySection counterparty={counterparty} />
          <IssuedActs counterpartyId={counterparty.id} />
        </div>
      </div>

      {editing && <CounterpartyFormModal counterparty={counterparty} onClose={() => setEditing(false)} />}
      {picking && (
        <AddressesPicker
          counterparty={counterparty}
          current={addresses.data?.map((address) => address.id) ?? []}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-gray-900 dark:text-white">
        {value ? value : <span className="font-normal text-gray-400 dark:text-gray-500">—</span>}
      </dd>
    </div>
  )
}

/** Сводный акт за месяц: что войдёт в документ — и выпуск. */
function SummarySection({ counterparty }: { counterparty: Counterparty }) {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [showVisits, setShowVisits] = useState(false)
  const preview = useSummaryPreview(counterparty.id, month)
  const { issue } = useCounterpartyMutations()
  const data = preview.data
  const existing = data?.existing_act_id
    ? { id: data.existing_act_id, number: data.existing_act_number }
    : null

  const submit = () =>
    issue.mutate(
      { id: counterparty.id, month, supersedes: existing?.id ?? null },
      {
        onSuccess: (act) => showApiSuccess(`Сводный акт №${act.number} выпущен`),
        onError: (error) => showApiError(error, 'Не удалось выпустить акт'),
      },
    )

  return (
    <Card
      flush
      title={`Сводный акт${data ? ` · ${data.period_label}` : ''}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            aria-label="Месяц"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="field h-8 w-36"
          />
          <Button
            size="sm"
            variant={existing ? 'outline' : 'primary'}
            disabled={!data || data.lines.length === 0}
            isLoading={issue.isPending}
            onClick={submit}
            title={existing ? `Выпустить исправленный — №${existing.number} будет аннулирован` : undefined}
          >
            {existing ? `Исправить №${existing.number}` : 'Выпустить акт'}
          </Button>
        </div>
      }
    >
      {preview.isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : !data ? (
        <QueryStatePanel state="error" onRetry={preview.refetch} className="border-0" />
      ) : data.lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          За {data.period_label} нечего выставить: у объектов нет абонплаты, актов «по договору» нет.
        </p>
      ) : (
        <>
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th className="w-10">№</th>
                <th>Начисление</th>
                <th className="text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.position}>
                  <td className="tabular-nums text-gray-500">{line.position}</td>
                  <td className="w-full min-w-[10rem] max-w-0">
                    <p className="truncate text-gray-900 dark:text-white">{line.name}</p>
                    {line.details && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={line.details}>
                        {line.details}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatRub(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-sm dark:border-gray-700">
            {data.subscription_total > 0 && (
              <span className="text-gray-500 dark:text-gray-400">абонплата {formatRub(data.subscription_total)}</span>
            )}
            {data.acts_total > 0 && (
              <span className="text-gray-500 dark:text-gray-400">работы {formatRub(data.acts_total)}</span>
            )}
            <span className="font-semibold text-gray-900 dark:text-white">Итого {formatRub(data.total)}</span>
          </div>
        </>
      )}
      {data && data.visits.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setShowVisits(!showVisits)}
            className="w-full px-4 py-2 text-left text-sm text-primary-600 hover:bg-gray-50 dark:text-primary-400 dark:hover:bg-gray-700/40"
          >
            {showVisits ? 'Скрыть' : 'Показать'} выполненные заявки за месяц — {data.visits.length} (войдут справочно)
          </button>
          {showVisits && (
            <table className="data-table min-w-full">
              <tbody>
                {data.visits.map((visit) => (
                  <tr key={visit.task_id}>
                    <td className="whitespace-nowrap text-xs text-gray-500">{visit.date}</td>
                    <td className="whitespace-nowrap">
                      <Link to={`/tasks/${visit.task_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                        {visit.task_number}
                      </Link>
                    </td>
                    <td className="w-full min-w-[10rem] max-w-0">
                      <p className="truncate" title={visit.address}>
                        {visit.address}
                        <span className="text-gray-500 dark:text-gray-400"> · {visit.title}{visit.remote ? ' (удалённо)' : ''}</span>
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-xs text-gray-500">{visit.worker || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  )
}

/** Выпущенные сводные акты: PDF, скан подписанного, аннулирование. */
function IssuedActs({ counterpartyId }: { counterpartyId: number }) {
  const acts = useSummaryActs(counterpartyId)
  const queryClient = useQueryClient()
  const uploadScan = useUploadActScan()
  const fileInput = useRef<HTMLInputElement>(null)
  const [scanTarget, setScanTarget] = useState<Act | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Act | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: counterpartyKeys.all })
  const items = useMemo(() => acts.data ?? [], [acts.data])

  const onScanPicked = (file: File | undefined) => {
    if (!file || !scanTarget) return
    uploadScan.mutate(
      { id: scanTarget.id, file },
      {
        onSuccess: (act) => {
          showApiSuccess(`Акт №${act.number} подписан`)
          refresh()
        },
        onError: (error) => showApiError(error, 'Не удалось загрузить скан'),
        onSettled: () => setScanTarget(null),
      },
    )
  }

  return (
    <Card flush title={`Выпущенные акты · ${items.length}`}>
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
      {acts.isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500">Сводных актов ещё нет</p>
      ) : (
        <table className="data-table min-w-full">
          <thead>
            <tr>
              <th>Акт</th>
              <th>Период</th>
              <th className="text-right">Сумма</th>
              <th>Статус</th>
              <th className="w-28" aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {items.map((act) => {
              const status = ACT_STATUS[act.status]
              const active = act.status !== 'cancelled'
              return (
                <tr key={act.id}>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-xs">{act.number}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400"> · {formatDateOnly(act.created_at)}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    {act.period ? format(parseISO(`${act.period}-01`), 'LLLL yyyy', { locale: ru }) : '—'}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatRub(act.total_amount)}</td>
                  <td>
                    <Badge variant={status.variant} title={act.cancel_reason ?? undefined}>{status.label}</Badge>
                  </td>
                  <td>
                    <div className="flex justify-end gap-0.5">
                      <ActIcon
                        title="Открыть PDF"
                        onClick={() => actsApi.openPdf(act.id).catch((error) => showApiError(error, 'Не удалось открыть PDF'))}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </ActIcon>
                      {act.has_scan && (
                        <ActIcon
                          title="Скан подписанного"
                          onClick={() => actsApi.openScan(act.id).catch((error) => showApiError(error, 'Не удалось открыть скан'))}
                        >
                          <FileCheck2 className="h-3.5 w-3.5" />
                        </ActIcon>
                      )}
                      {act.status === 'pending_signature' && (
                        <ActIcon
                          title="Загрузить скан подписанного — акт станет подписанным"
                          busy={uploadScan.isPending && scanTarget?.id === act.id}
                          onClick={() => {
                            setScanTarget(act)
                            fileInput.current?.click()
                          }}
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </ActIcon>
                      )}
                      {active && (
                        <ActIcon title="Аннулировать" danger onClick={() => setCancelTarget(act)}>
                          <Ban className="h-3.5 w-3.5" />
                        </ActIcon>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {cancelTarget && (
        <CancelActModal
          act={cancelTarget}
          onClose={() => {
            setCancelTarget(null)
            refresh()
          }}
        />
      )}
    </Card>
  )
}

function ActIcon({
  title,
  onClick,
  busy = false,
  danger = false,
  children,
}: {
  title: string
  onClick: () => void
  busy?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 disabled:animate-pulse dark:hover:bg-gray-700 ${danger ? 'hover:text-red-600 dark:hover:text-red-400' : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
    >
      {children}
    </button>
  )
}

/** Какие объекты обслуживаются по договору с контрагентом. */
function AddressesPicker({
  counterparty,
  current,
  onClose,
}: {
  counterparty: Counterparty
  current: number[]
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set(current))
  const addresses = useAddresses({ search: search.trim() || undefined, size: 100 })
  const counterparties = useCounterparties(true)
  const { setAddresses } = useCounterpartyMutations()
  const names = useMemo(
    () => new Map((counterparties.data ?? []).map((item) => [item.id, item.name])),
    [counterparties.data],
  )

  const toggle = (id: number) =>
    setSelected((value) => {
      const next = new Set(value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = () =>
    setAddresses.mutate(
      { id: counterparty.id, addressIds: [...selected] },
      {
        onSuccess: () => {
          showApiSuccess('Объекты сохранены')
          onClose()
        },
        onError: (error) => showApiError(error, 'Не удалось сохранить объекты'),
      },
    )

  return (
    <Modal isOpen onClose={onClose} title={`Объекты — ${counterparty.name}`} size="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            aria-label="Поиск по адресу"
            className="field pl-9"
            placeholder="Поиск по адресу"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {addresses.isLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {(addresses.data?.items ?? []).map((address) => {
                const other =
                  address.counterparty_id && address.counterparty_id !== counterparty.id
                    ? names.get(address.counterparty_id)
                    : null
                return (
                  <li key={address.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <input type="checkbox" checked={selected.has(address.id)} onChange={() => toggle(address.id)} />
                      <span className="min-w-0 flex-1 truncate">{address.address}</span>
                      {other && <span className="shrink-0 text-xs text-amber-600">сейчас у «{other}»</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Выбрано: {selected.size}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button isLoading={setAddresses.isPending} onClick={save}>
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

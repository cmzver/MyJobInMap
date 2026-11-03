import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeftRight, Boxes, FileSpreadsheet, History, Package, Pencil, Plus, Table2 } from 'lucide-react'
import {
  materialsApi,
  type Material,
  type MaterialBalance,
  type MaterialOperationKind,
} from '@/api/materials'
import {
  useMaterialBalances,
  useMaterialCatalog,
  useMaterialMovements,
  useMaterialMutations,
  useMaterialTurnover,
  useStocks,
} from '@/hooks/useMaterials'
import { useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { cn } from '@/utils/cn'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Select from '@/components/Select'

type Tab = 'balances' | 'journal' | 'turnover' | 'catalog'

const TABS: { id: Tab; label: string; Icon: typeof Boxes }[] = [
  { id: 'balances', label: 'Остатки', Icon: Boxes },
  { id: 'journal', label: 'Журнал', Icon: History },
  { id: 'turnover', label: 'Обороты', Icon: Table2 },
  { id: 'catalog', label: 'Справочник', Icon: Package },
]

const KIND_LABELS: Record<string, string> = {
  receipt: 'Приход',
  issue: 'Выдача',
  return: 'Возврат на склад',
  write_off: 'Списание',
  act: 'По акту',
  act_cancel: 'Возврат по акту',
  adjust: 'Инвентаризация',
}

const OPERATIONS: { value: MaterialOperationKind; label: string; hint: string }[] = [
  { value: 'receipt', label: 'Приход', hint: 'Закупка: на склад или сразу исполнителю.' },
  { value: 'issue', label: 'Выдать исполнителю', hint: 'Со склада исполнителю.' },
  { value: 'return', label: 'Вернуть на склад', hint: 'От исполнителя на склад.' },
  { value: 'write_off', label: 'Списать', hint: 'Брак, потеря — вне заявки.' },
  { value: 'adjust', label: 'Инвентаризация', hint: 'Укажите фактический остаток — разница проведётся.' },
]

const qty = (value: string | number) => Number(value).toLocaleString('ru', { maximumFractionDigits: 3 })
const rub = (value: string | number) =>
  Number(value).toLocaleString('ru', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const currentMonth = () => format(new Date(), 'yyyy-MM')

/** Остаток: минус — недостача (красным). signed — движение: «+» приход, «−» расход. */
function Quantity({ value, unit, signed = false }: { value: string | number; unit?: string; signed?: boolean }) {
  const number = Number(value)
  const shortage = !signed && number < 0
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        shortage && 'font-medium text-red-600 dark:text-red-400',
        signed && number > 0 && 'text-green-700 dark:text-green-400',
      )}
      title={shortage ? 'Недостача: списано больше, чем было выдано' : undefined}
    >
      {signed && number > 0 ? '+' : ''}
      {number < 0 ? `−${qty(-number)}` : qty(value)}
      {unit ? ` ${unit}` : ''}
    </span>
  )
}

/** Склад материалов: остатки, журнал операций, обороты за месяц, справочник. */
export default function MaterialsPage() {
  const user = useAuthStore((state) => state.user)
  const manager = user?.baseAccess !== 'worker'
  const [tab, setTab] = useState<Tab>('balances')
  const [operation, setOperation] = useState<{ kind: MaterialOperationKind; materialId?: number } | null>(null)
  const [editing, setEditing] = useState<Material | 'new' | null>(null)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Материалы"
        description={
          manager
            ? 'Склад и остатки у исполнителей. Материалы из прайса списываются по актам автоматически.'
            : 'Материалы на руках. Расход фиксируется в карточке заявки и в акте.'
        }
        actions={
          manager && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing('new')}>
                <Plus className="mr-1 h-4 w-4" />
                Материал
              </Button>
              <Button onClick={() => setOperation({ kind: 'issue' })}>
                <ArrowLeftRight className="mr-1 h-4 w-4" />
                Операция
              </Button>
            </div>
          )
        }
      />

      {manager ? (
        <>
          <nav
            role="tablist"
            className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_theme(colors.gray.200)] dark:shadow-[inset_0_-1px_0_theme(colors.gray.700)]"
          >
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
          {tab === 'balances' && <BalancesTab onOperate={(kind, materialId) => setOperation({ kind, materialId })} />}
          {tab === 'journal' && <JournalTab />}
          {tab === 'turnover' && <TurnoverTab />}
          {tab === 'catalog' && <CatalogTab onEdit={setEditing} />}
        </>
      ) : (
        <OwnStocks />
      )}

      {operation && (
        <OperationModal
          initialKind={operation.kind}
          initialMaterialId={operation.materialId}
          onClose={() => setOperation(null)}
        />
      )}
      {editing && <MaterialModal material={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function OwnStocks() {
  const stocks = useStocks()
  return (
    <Card flush title="Мои остатки">
      {stocks.isPending ? (
        <QueryStatePanel state="loading" />
      ) : stocks.isError ? (
        <QueryStatePanel state="error" onRetry={() => stocks.refetch()} />
      ) : stocks.data.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Материалы ещё не выданы.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Материал</th>
              <th className="w-40 text-right">Остаток</th>
            </tr>
          </thead>
          <tbody>
            {stocks.data.map((stock) => (
              <tr key={stock.material_id}>
                <td>{stock.name}</td>
                <td className="text-right">
                  <Quantity value={stock.quantity} unit={stock.unit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function BalancesTab({ onOperate }: { onOperate: (kind: MaterialOperationKind, materialId: number) => void }) {
  const balances = useMaterialBalances()
  const totals = useMemo(
    () => (balances.data ?? []).reduce((sum, row) => sum + Number(row.total_cost), 0),
    [balances.data],
  )
  const low = (balances.data ?? []).filter((row) => row.low).length

  if (balances.isPending) return <QueryStatePanel state="loading" />
  if (balances.isError) return <QueryStatePanel state="error" onRetry={() => balances.refetch()} />
  if (balances.data.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Склад пуст. Добавьте материал в справочник и оформите приход.
        </p>
      </Card>
    )
  }
  return (
    <Card
      flush
      title="Остатки"
      action={
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {low > 0 && <Badge variant="warning" className="mr-2">Пора закупать: {low}</Badge>}
          Всего на {rub(totals)} ₽
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Материал</th>
              <th className="w-32 text-right">Склад</th>
              <th>У исполнителей</th>
              <th className="w-28 text-right">Всего</th>
              <th className="w-32 text-right">Сумма, ₽</th>
              <th className="w-40" />
            </tr>
          </thead>
          <tbody>
            {balances.data.map((row) => (
              <BalanceRow key={row.material_id} row={row} onOperate={onOperate} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function BalanceRow({
  row,
  onOperate,
}: {
  row: MaterialBalance
  onOperate: (kind: MaterialOperationKind, materialId: number) => void
}) {
  return (
    <tr>
      <td>
        <span className={cn(!row.active && 'text-gray-400 line-through')}>{row.name}</span>
        {row.low && (
          <Badge variant="warning" className="ml-2" title={`Минимум на складе: ${qty(row.min_quantity ?? 0)}`}>
            мало
          </Badge>
        )}
      </td>
      <td className="text-right">
        <Quantity value={row.warehouse_quantity} unit={row.unit} />
      </td>
      <td className="text-sm">
        {row.holders.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          row.holders.map((holder, index) => (
            <span key={holder.user_id} className="whitespace-nowrap">
              {index > 0 && ', '}
              {holder.name} <Quantity value={holder.quantity} />
            </span>
          ))
        )}
      </td>
      <td className="text-right">
        <Quantity value={row.total_quantity} />
      </td>
      <td className="text-right tabular-nums">{rub(row.total_cost)}</td>
      <td className="text-right">
        {row.active && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => onOperate('receipt', row.material_id)}>
              Приход
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOperate('issue', row.material_id)}>
              Выдать
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}

const PAGE = 50

function JournalTab() {
  const [month, setMonth] = useState(currentMonth)
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(0)
  const movements = useMaterialMovements({ month: month || undefined, kind: kind || undefined, limit: PAGE, offset: page * PAGE })
  const pages = Math.ceil((movements.data?.total ?? 0) / PAGE)

  return (
    <Card
      flush
      title="Журнал операций"
      action={
        <div className="flex flex-wrap gap-2">
          <input
            type="month"
            aria-label="Месяц"
            className="field h-8 w-40"
            value={month}
            onChange={(event) => { setMonth(event.target.value); setPage(0) }}
          />
          <select
            aria-label="Операция"
            className="field h-8 w-44"
            value={kind}
            onChange={(event) => { setKind(event.target.value); setPage(0) }}
          >
            <option value="">Все операции</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      }
    >
      {movements.isPending ? (
        <QueryStatePanel state="loading" />
      ) : movements.isError ? (
        <QueryStatePanel state="error" onRetry={() => movements.refetch()} />
      ) : movements.data.items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Операций нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-32">Когда</th>
                <th className="w-36">Операция</th>
                <th>Материал</th>
                <th>Держатель</th>
                <th className="w-28 text-right">Кол-во</th>
                <th className="w-28">Заявка</th>
                <th>Основание</th>
              </tr>
            </thead>
            <tbody>
              {movements.data.items.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap tabular-nums">{format(new Date(row.created_at), 'dd.MM HH:mm')}</td>
                  <td>{KIND_LABELS[row.kind] ?? row.kind}</td>
                  <td>{row.material_name}</td>
                  <td>{row.holder ?? '—'}</td>
                  <td className="text-right">
                    <Quantity value={row.quantity} unit={row.unit} signed />
                  </td>
                  <td>
                    {row.task_id ? (
                      <Link to={`/tasks/${row.task_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                        {row.task_number ?? `#${row.task_id}`}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-sm text-gray-600 dark:text-gray-300">
                    {row.reason || '—'}
                    {row.created_by && <span className="ml-1 text-xs text-gray-400">· {row.created_by}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-2 text-sm dark:border-gray-700">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</Button>
          <span className="tabular-nums text-gray-500">{page + 1} / {pages}</span>
          <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Дальше</Button>
        </div>
      )}
    </Card>
  )
}

function TurnoverTab() {
  const [month, setMonth] = useState(currentMonth)
  const [downloading, setDownloading] = useState(false)
  const turnover = useMaterialTurnover(month, Boolean(month))
  const download = async () => {
    setDownloading(true)
    try {
      await materialsApi.downloadTurnover(month)
    } catch (error) {
      showApiError(error, 'Не удалось выгрузить обороты')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card
      flush
      title="Обороты за месяц"
      action={
        <div className="flex gap-2">
          <input
            type="month"
            aria-label="Месяц"
            className="field h-8 w-40"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
          <Button size="sm" variant="secondary" isLoading={downloading} disabled={!month} onClick={download}>
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            Excel
          </Button>
        </div>
      }
    >
      {turnover.isPending ? (
        <QueryStatePanel state="loading" />
      ) : turnover.isError ? (
        <QueryStatePanel state="error" onRetry={() => turnover.refetch()} />
      ) : turnover.data.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">За месяц движений не было.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Держатель</th>
                <th>Материал</th>
                <th className="text-right">На начало</th>
                <th className="text-right">Получено</th>
                <th className="text-right">На заявки</th>
                <th className="text-right">Передано</th>
                <th className="text-right" title="Списания вне заявок и инвентаризация">Прочее</th>
                <th className="text-right">На конец</th>
                <th className="text-right">Сумма, ₽</th>
              </tr>
            </thead>
            <tbody>
              {turnover.data.map((row) => (
                <tr key={`${row.user_id ?? 'wh'}-${row.material_id}`}>
                  <td className={cn(row.user_id === null && 'font-medium')}>{row.holder}</td>
                  <td>{row.material}</td>
                  <td className="text-right"><Quantity value={row.opening} /></td>
                  <td className="text-right"><Quantity value={row.received} /></td>
                  <td className="text-right"><Quantity value={row.used} /></td>
                  <td className="text-right"><Quantity value={row.transferred} /></td>
                  <td className="text-right"><Quantity value={row.other} /></td>
                  <td className="text-right"><Quantity value={row.closing} unit={row.unit} /></td>
                  <td className="text-right tabular-nums">{rub(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function CatalogTab({ onEdit }: { onEdit: (material: Material) => void }) {
  const catalog = useMaterialCatalog(true)
  const { update } = useMaterialMutations()
  if (catalog.isPending) return <QueryStatePanel state="loading" />
  if (catalog.isError) return <QueryStatePanel state="error" onRetry={() => catalog.refetch()} />
  return (
    <Card flush title="Справочник материалов">
      {catalog.data.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Справочник пуст.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th className="w-20">Ед.</th>
              <th className="w-32 text-right">Цена, ₽</th>
              <th className="w-32 text-right">Минимум</th>
              <th className="w-48" />
            </tr>
          </thead>
          <tbody>
            {catalog.data.map((material) => (
              <tr key={material.id}>
                <td className={cn(!material.active && 'text-gray-400 line-through')}>{material.name}</td>
                <td>{material.unit}</td>
                <td className="text-right tabular-nums">{rub(material.unit_cost ?? 0)}</td>
                <td className="text-right tabular-nums">
                  {material.min_quantity != null ? qty(material.min_quantity) : '—'}
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Изменить: ${material.name}`} onClick={() => onEdit(material)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        update.mutate(
                          { id: material.id, data: { active: !material.active } },
                          { onError: (error) => showApiError(error, 'Не удалось изменить материал') },
                        )
                      }
                    >
                      {material.active ? 'В архив' : 'Вернуть'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function MaterialModal({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const { create, update } = useMaterialMutations()
  const [name, setName] = useState(material?.name ?? '')
  const [unit, setUnit] = useState(material?.unit ?? 'шт.')
  const [cost, setCost] = useState(String(material?.unit_cost ?? '0'))
  const [minimum, setMinimum] = useState(material?.min_quantity != null ? String(material.min_quantity) : '')
  const saving = create.isPending || update.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const data = {
      name: name.trim(),
      unit: unit.trim() || 'шт.',
      unit_cost: cost.replace(',', '.') || '0',
      min_quantity: minimum.trim() ? minimum.replace(',', '.') : null,
    }
    const options = {
      onSuccess: () => { showApiSuccess(material ? 'Материал сохранён' : 'Материал добавлен'); onClose() },
      onError: (error: unknown) => showApiError(error, 'Не удалось сохранить материал'),
    }
    if (material) update.mutate({ id: material.id, data }, options)
    else create.mutate(data, options)
  }

  return (
    <Modal isOpen onClose={onClose} title={material ? 'Материал' : 'Новый материал'} size="sm">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Название" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Единица" required maxLength={20} value={unit} onChange={(event) => setUnit(event.target.value)} />
          <Input label="Цена, ₽" inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
          <Input
            label="Минимум"
            inputMode="decimal"
            placeholder="нет"
            title="Остаток на складе ниже — материал подсвечивается «пора закупать»"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button type="submit" isLoading={saving} disabled={!name.trim()}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  )
}

function OperationModal({
  initialKind,
  initialMaterialId,
  onClose,
}: {
  initialKind: MaterialOperationKind
  initialMaterialId?: number
  onClose: () => void
}) {
  const catalog = useMaterialCatalog()
  const users = useUsers()
  const { operate } = useMaterialMutations()
  const [kind, setKind] = useState<MaterialOperationKind>(initialKind)
  const [materialId, setMaterialId] = useState(initialMaterialId ? String(initialMaterialId) : '')
  const [holder, setHolder] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  // Новый ключ на каждое изменение формы: повтор отправки той же формы не задвоит операцию
  const [operationId, setOperationId] = useState(() => crypto.randomUUID())
  const touch = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setOperationId(crypto.randomUUID()) }

  const needsHolder = kind === 'issue' || kind === 'return'
  const material = catalog.data?.find((m) => String(m.id) === materialId)
  const holderOptions = [
    ...(needsHolder ? [] : [{ value: '', label: 'Склад' }]),
    ...(users.data ?? []).filter((u) => u.is_active).map((u) => ({ value: String(u.id), label: u.full_name || u.username })),
  ]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    operate.mutate(
      {
        kind,
        material_id: Number(materialId),
        user_id: holder ? Number(holder) : null,
        quantity: quantity.replace(',', '.'),
        reason: reason.trim(),
        operation_id: operationId,
      },
      {
        onSuccess: () => { showApiSuccess('Операция проведена'); onClose() },
        onError: (error) => showApiError(error, 'Не удалось провести операцию'),
      },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Операция склада">
      <form onSubmit={submit} className="space-y-3">
        <Select
          label="Операция"
          options={OPERATIONS.map(({ value, label }) => ({ value, label }))}
          value={kind}
          onChange={(value) => touch(setKind)(value as MaterialOperationKind)}
        />
        <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">{OPERATIONS.find((op) => op.value === kind)?.hint}</p>
        <Select
          label="Материал"
          placeholder="Выберите материал"
          options={(catalog.data ?? []).map((m) => ({ value: String(m.id), label: `${m.name} (${m.unit})` }))}
          value={materialId}
          onChange={touch(setMaterialId)}
          required
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Select
            label={needsHolder ? 'Исполнитель' : 'Где'}
            placeholder={needsHolder ? 'Выберите исполнителя' : undefined}
            options={holderOptions}
            value={holder}
            onChange={touch(setHolder)}
            required={needsHolder}
          />
          <Input
            label={kind === 'adjust' ? 'Фактически' : 'Количество'}
            inputMode="decimal"
            required
            value={quantity}
            onChange={(event) => touch(setQuantity)(event.target.value)}
          />
        </div>
        <Input
          label="Основание"
          maxLength={500}
          placeholder="Накладная, причина списания…"
          value={reason}
          onChange={(event) => touch(setReason)(event.target.value)}
        />
        {material && <p className="text-xs text-gray-500 dark:text-gray-400">Единица: {material.unit}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button
            type="submit"
            isLoading={operate.isPending}
            disabled={!materialId || !quantity.trim() || (needsHolder && !holder)}
          >
            Провести
          </Button>
        </div>
      </form>
    </Modal>
  )
}

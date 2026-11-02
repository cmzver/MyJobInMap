import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import Textarea from '@/components/Textarea'
import { useCreateAct, useServiceCatalog } from '@/hooks/useActs'
import type { Act, ActCreate, ActLineInput } from '@/api/acts'
import type { TaskDetail } from '@/types/task'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import {
  CUSTOMER_ROLE_OPTIONS,
  LINE_TYPE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  formatRub,
} from '@/components/acts/actLabels'

type LineDraft = {
  key: number
  catalog_item_id: number | null
  line_type: 'work' | 'material'
  name: string
  unit: string
  qty: string
  price: string
  serial_number: string
  install_to_object: boolean
}

let lineKey = 0
const newLine = (fields: Partial<LineDraft> = {}): LineDraft => ({
  key: ++lineKey,
  catalog_item_id: null,
  line_type: 'work',
  name: '',
  unit: 'усл',
  qty: '1',
  price: '0',
  serial_number: '',
  install_to_object: false,
  ...fields,
})

const toNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Оформить акт по заявке (или исправленную версию прежнего — он будет аннулирован). */
export default function ActFormModal({
  task,
  supersedes,
  isOpen,
  onClose,
}: {
  task: TaskDetail
  supersedes?: Act | null
  isOpen: boolean
  onClose: () => void
}) {
  const { data: catalog = [] } = useServiceCatalog()
  const createAct = useCreateAct(task.id)

  const [lines, setLines] = useState<LineDraft[]>(() =>
    supersedes
      ? (supersedes.lines ?? []).map((line) =>
          newLine({
            catalog_item_id: line.catalog_item_id ?? null,
            line_type: line.line_type,
            name: line.name,
            unit: line.unit,
            qty: String(line.qty),
            price: String(line.price),
            serial_number: line.serial_number ?? '',
            // Исправленная версия не заводит оборудование второй раз
            install_to_object: false,
          }),
        )
      : [],
  )
  const [customerName, setCustomerName] = useState(supersedes?.customer_name ?? task.customer_name ?? '')
  const [customerRole, setCustomerRole] = useState<string>(supersedes?.customer_role ?? 'resident')
  const [customerPhone, setCustomerPhone] = useState(supersedes?.customer_phone ?? task.customer_phone ?? '')
  const [apartment, setApartment] = useState(supersedes?.apartment ?? '')
  const [workSummary, setWorkSummary] = useState(supersedes?.work_summary ?? '')
  const [noClaims, setNoClaims] = useState(supersedes?.no_claims ?? true)
  const [remarks, setRemarks] = useState(supersedes?.customer_remarks ?? '')
  const [paymentMethod, setPaymentMethod] = useState<string>(supersedes?.payment_method ?? 'none')

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round(toNumber(line.qty) * toNumber(line.price) * 100) / 100, 0),
    [lines],
  )

  const updateLine = (key: number, fields: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...fields } : line)))

  const addFromCatalog = (value: string) => {
    const item = catalog.find((entry) => String(entry.id) === value)
    if (!item) return
    setLines((current) => [
      ...current,
      newLine({
        catalog_item_id: item.id,
        line_type: item.line_type ?? 'work',
        name: item.name,
        unit: item.unit ?? 'усл',
        price: String(item.price ?? 0),
      }),
    ])
  }

  const submit = () => {
    const payload: ActCreate = {
      lines: lines
        .filter((line) => line.name.trim() || line.catalog_item_id)
        .map<ActLineInput>((line) => ({
          catalog_item_id: line.catalog_item_id,
          line_type: line.line_type,
          name: line.name.trim() || null,
          unit: line.unit.trim() || null,
          qty: toNumber(line.qty),
          price: toNumber(line.price),
          serial_number: line.line_type === 'material' ? line.serial_number.trim() || null : null,
          install_to_object: line.line_type === 'material' && line.install_to_object,
        })),
      customer_name: customerName.trim() || null,
      customer_role: customerRole as ActCreate['customer_role'],
      customer_phone: customerPhone.trim() || null,
      apartment: apartment.trim() || null,
      work_summary: workSummary.trim() || null,
      no_claims: noClaims,
      customer_remarks: noClaims ? null : remarks.trim() || null,
      payment_method: (total > 0 ? paymentMethod : 'none') as ActCreate['payment_method'],
      supersedes_act_id: supersedes?.id ?? null,
    }
    createAct.mutate(payload, {
      onSuccess: (act) => {
        showApiSuccess(`Акт №${act.number} оформлен`)
        onClose()
      },
      onError: (error) => showApiError(error, 'Не удалось оформить акт'),
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={supersedes ? `Исправить акт №${supersedes.number}` : 'Оформить акт'}
      size="xl"
    >
      <div className="space-y-5">
        {supersedes && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Будет выпущен новый акт, а №{supersedes.number} — аннулирован.
          </p>
        )}

        <section className="space-y-3">
          <p className="eyebrow">Работы и материалы</p>
          {lines.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Добавьте строки из прайса или свободные — или опишите работы ниже.
            </p>
          )}
          {lines.map((line) => (
            <div
              key={line.key}
              className="space-y-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700 md:border-0 md:p-0"
            >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_8.5rem_5rem_4rem_7rem_6rem_auto] md:items-end">
              <div className="col-span-2 md:col-span-1">
                <Input
                  label="Наименование"
                  value={line.name}
                  onChange={(event) => updateLine(line.key, { name: event.target.value })}
                />
              </div>
              <Select
                label="Тип"
                options={LINE_TYPE_OPTIONS}
                value={line.line_type}
                onChange={(value) => updateLine(line.key, { line_type: value as LineDraft['line_type'] })}
              />
              <Input
                label="Кол-во"
                inputMode="decimal"
                value={line.qty}
                onChange={(event) => updateLine(line.key, { qty: event.target.value })}
              />
              <Input
                label="Ед."
                value={line.unit}
                onChange={(event) => updateLine(line.key, { unit: event.target.value })}
              />
              <Input
                label="Цена, ₽"
                inputMode="decimal"
                value={line.price}
                onChange={(event) => updateLine(line.key, { price: event.target.value })}
              />
              <p className="self-center text-right text-sm font-medium text-gray-900 dark:text-white md:pb-2">
                {formatRub(Math.round(toNumber(line.qty) * toNumber(line.price) * 100) / 100)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-end"
                aria-label="Удалить строку"
                onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {line.line_type === 'material' && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <input
                  aria-label="Серийный номер"
                  placeholder="S/N (необязательно)"
                  value={line.serial_number}
                  onChange={(event) => updateLine(line.key, { serial_number: event.target.value })}
                  className="field h-8 w-56"
                />
                <label
                  className={`flex items-center gap-2 text-sm ${task.address_id ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}`}
                  title={task.address_id ? undefined : 'У заявки нет объекта — оборудование некуда завести'}
                >
                  <input
                    type="checkbox"
                    checked={line.install_to_object}
                    disabled={!task.address_id}
                    onChange={(event) => updateLine(line.key, { install_to_object: event.target.checked })}
                  />
                  Установлено на объект — завести в оборудование адреса
                </label>
              </div>
            )}
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            {catalog.length > 0 && (
              <div className="sm:w-80">
                <Select
                  label="Из прайса"
                  placeholder="Выберите позицию"
                  options={catalog.map((item) => ({
                    value: String(item.id),
                    label: `${item.name} — ${formatRub(item.price ?? 0)}`,
                  }))}
                  value=""
                  onChange={addFromCatalog}
                />
              </div>
            )}
            <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, newLine()])}>
              <Plus className="mr-1.5 h-4 w-4" />
              Свободная строка
            </Button>
            <p className="text-sm font-semibold text-gray-900 dark:text-white sm:ml-auto sm:pb-2">
              Итого: {formatRub(total)}
            </p>
          </div>
        </section>

        <Textarea
          label="Выполненные работы"
          rows={3}
          maxLength={4000}
          value={workSummary}
          onChange={(event) => setWorkSummary(event.target.value)}
        />

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="Заказчик (ФИО)" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          <Select label="Кто подписывает" options={CUSTOMER_ROLE_OPTIONS} value={customerRole} onChange={setCustomerRole} />
          <Input label="Телефон" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
          <Input label="Квартира" value={apartment} onChange={(event) => setApartment(event.target.value)} />
          {total > 0 && (
            <Select label="Оплата" options={PAYMENT_METHOD_OPTIONS} value={paymentMethod} onChange={setPaymentMethod} />
          )}
        </section>

        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={noClaims}
            onChange={(event) => setNoClaims(event.target.checked)}
          />
          Заказчик претензий по объёму, качеству и срокам не имеет
        </label>
        {!noClaims && (
          <Textarea
            label="Замечания заказчика"
            rows={2}
            maxLength={2000}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" onClick={submit} isLoading={createAct.isPending}>
            {supersedes ? 'Выпустить исправленный' : 'Оформить акт'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

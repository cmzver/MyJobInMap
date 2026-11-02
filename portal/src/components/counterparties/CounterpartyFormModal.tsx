import { useState } from 'react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import { useCounterpartyMutations } from '@/hooks/useCounterparties'
import type { Counterparty, CounterpartyCreate } from '@/api/counterparties'
import { showApiError, showApiSuccess } from '@/utils/apiError'

type Draft = Record<keyof CounterpartyCreate, string>

const FIELDS: (keyof CounterpartyCreate)[] = [
  'name',
  'legal_name',
  'inn',
  'kpp',
  'ogrn',
  'legal_address',
  'bank_name',
  'bik',
  'account',
  'corr_account',
  'contract_number',
  'contract_date',
  'signer_name',
  'signer_position',
  'phone',
  'email',
  'notes',
]

/** Контрагент (УК/ТСЖ): реквизиты, договор и подписант сводного акта. */
export default function CounterpartyFormModal({
  counterparty,
  onClose,
  onSaved,
}: {
  counterparty?: Counterparty | null
  onClose: () => void
  onSaved?: (saved: Counterparty) => void
}) {
  const { create, update } = useCounterpartyMutations()
  const [draft, setDraft] = useState<Draft>(
    () => Object.fromEntries(FIELDS.map((field) => [field, String(counterparty?.[field] ?? '')])) as Draft,
  )
  const set = (field: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }))
  const digits = (field: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value.replace(/\D/g, '') }))

  const submit = () => {
    const body = Object.fromEntries(
      FIELDS.map((field) => [field, draft[field].trim() || null]),
    ) as CounterpartyCreate
    body.name = draft.name.trim()
    const done = {
      onSuccess: (saved: Counterparty) => {
        showApiSuccess(counterparty ? 'Контрагент сохранён' : 'Контрагент добавлен')
        onSaved?.(saved)
        onClose()
      },
      onError: (error: unknown) => showApiError(error, 'Не удалось сохранить контрагента'),
    }
    if (counterparty) update.mutate({ id: counterparty.id, body }, done)
    else create.mutate(body, done)
  }

  return (
    <Modal isOpen onClose={onClose} title={counterparty ? counterparty.name : 'Новый контрагент'} size="lg">
      <div className="space-y-4">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Короткое название *" placeholder="УК Жилкомсервис №2" value={draft.name} onChange={set('name')} />
          <Input label="Полное наименование" placeholder="ООО «Жилкомсервис №2»" value={draft.legal_name} onChange={set('legal_name')} />
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Input label="ИНН" inputMode="numeric" maxLength={12} value={draft.inn} onChange={digits('inn')} />
            <Input label="КПП" inputMode="numeric" maxLength={9} value={draft.kpp} onChange={digits('kpp')} />
            <Input label="ОГРН" inputMode="numeric" maxLength={15} value={draft.ogrn} onChange={digits('ogrn')} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Юридический адрес" value={draft.legal_address} onChange={set('legal_address')} />
          </div>
        </section>

        <section className="space-y-2">
          <p className="eyebrow">Договор и подписант</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
            <Input label="Номер договора" value={draft.contract_number} onChange={set('contract_number')} />
            <Input label="Дата" placeholder="01.01.2026" value={draft.contract_date} onChange={set('contract_date')} />
            <Input label="Подписант (ФИО)" value={draft.signer_name} onChange={set('signer_name')} />
            <Input label="Должность" value={draft.signer_position} onChange={set('signer_position')} />
          </div>
        </section>

        <section className="space-y-2">
          <p className="eyebrow">Банк</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Банк" value={draft.bank_name} onChange={set('bank_name')} />
            <Input label="БИК" inputMode="numeric" maxLength={9} value={draft.bik} onChange={digits('bik')} />
            <Input label="Расчётный счёт" inputMode="numeric" maxLength={20} value={draft.account} onChange={digits('account')} />
            <Input label="Корр. счёт" inputMode="numeric" maxLength={20} value={draft.corr_account} onChange={digits('corr_account')} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Телефон" value={draft.phone} onChange={set('phone')} />
          <Input label="Email" type="email" value={draft.email} onChange={set('email')} />
          <div className="sm:col-span-2">
            <Textarea label="Заметки" rows={2} value={draft.notes} onChange={set('notes')} />
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!draft.name.trim()} isLoading={create.isPending || update.isPending} onClick={submit}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  )
}

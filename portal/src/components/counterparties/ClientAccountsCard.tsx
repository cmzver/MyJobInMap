import { useState, type FormEvent } from 'react'
import { Copy, KeyRound, Plus, Trash2, UserRound } from 'lucide-react'
import type { ClientAccount, Counterparty } from '@/api/counterparties'
import { useClientAccountMutations, useClientAccounts } from '@/hooks/useCounterparties'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { APP_BASENAME } from '@/config/appConfig'
import { cn } from '@/utils/cn'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import Spinner from '@/components/Spinner'

/** Пароль без похожих символов (0/O, 1/l) — его диктуют по телефону. */
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

const cabinetUrl = () => `${window.location.origin}${APP_BASENAME}/client/login`

/** Вход в кабинет клиента: представители контрагента видят свои объекты, заявки и акты. */
export default function ClientAccountsCard({ counterparty }: { counterparty: Counterparty }) {
  const accounts = useClientAccounts(counterparty.id)
  const { update, remove } = useClientAccountMutations(counterparty.id)
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<{ login: string; password: string } | null>(null)

  const resetPassword = (account: ClientAccount) => {
    const password = generatePassword()
    update.mutate(
      { id: account.id, body: { password } },
      {
        onSuccess: () => setIssued({ login: account.login, password }),
        onError: (error) => showApiError(error, 'Не удалось сбросить пароль'),
      },
    )
  }

  return (
    <Card
      flush
      title={`Кабинет клиента · ${accounts.data?.length ?? 0}`}
      action={
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Вход
        </Button>
      }
    >
      {accounts.isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : !accounts.data?.length ? (
        <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
          Дайте представителю вход — он увидит объекты, заявки и акты контрагента и сможет подать заявку.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {accounts.data.map((account) => (
            <li key={account.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-gray-900 dark:text-white', !account.is_active && 'text-gray-400 line-through')}>
                  {account.full_name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {account.login}
                  {account.position && ` · ${account.position}`}
                </p>
              </div>
              {!account.is_active && <Badge>откл.</Badge>}
              <button
                type="button"
                title="Новый пароль"
                aria-label={`Новый пароль: ${account.full_name}`}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                onClick={() => resetPassword(account)}
              >
                <KeyRound className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={account.is_active ? 'Отключить вход' : 'Включить вход'}
                className="rounded px-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() =>
                  update.mutate(
                    { id: account.id, body: { is_active: !account.is_active } },
                    { onError: (error) => showApiError(error, 'Не удалось изменить вход') },
                  )
                }
              >
                {account.is_active ? 'Откл.' : 'Вкл.'}
              </button>
              <button
                type="button"
                title="Удалить вход"
                aria-label={`Удалить вход: ${account.full_name}`}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                onClick={() => {
                  if (window.confirm(`Удалить вход «${account.login}»?`)) {
                    remove.mutate(account.id, { onError: (error) => showApiError(error, 'Не удалось удалить вход') })
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <AccountModal
          counterparty={counterparty}
          onClose={() => setCreating(false)}
          onCreated={(login, password) => { setCreating(false); setIssued({ login, password }) }}
        />
      )}
      {issued && <IssuedModal {...issued} onClose={() => setIssued(null)} />}
    </Card>
  )
}

function AccountModal({
  counterparty,
  onClose,
  onCreated,
}: {
  counterparty: Counterparty
  onClose: () => void
  onCreated: (login: string, password: string) => void
}) {
  const { create } = useClientAccountMutations(counterparty.id)
  const [fullName, setFullName] = useState(counterparty.signer_name ?? '')
  const [position, setPosition] = useState(counterparty.signer_position ?? '')
  const [login, setLogin] = useState('')
  const [phone, setPhone] = useState(counterparty.phone ?? '')
  const [email, setEmail] = useState(counterparty.email ?? '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const password = generatePassword()
    create.mutate(
      {
        login: login.trim(),
        password,
        full_name: fullName.trim(),
        position: position.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      },
      {
        onSuccess: (account) => onCreated(account.login, password),
        onError: (error) => showApiError(error, 'Не удалось создать вход'),
      },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="Вход в кабинет клиента">
      <form onSubmit={submit} className="space-y-3">
        <Input label="ФИО представителя" required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Должность" value={position} onChange={(event) => setPosition(event.target.value)} />
          <Input
            label="Логин"
            required
            minLength={3}
            pattern="[A-Za-z0-9._@\-]+"
            title="Латиница, цифры, точка, дефис, @"
            placeholder="uk-ivanova"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
          <Input label="Телефон" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Пароль сгенерируется — покажем его один раз.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button type="submit" isLoading={create.isPending}>Создать</Button>
        </div>
      </form>
    </Modal>
  )
}

function IssuedModal({ login, password, onClose }: { login: string; password: string; onClose: () => void }) {
  const text = `Кабинет: ${cabinetUrl()}\nЛогин: ${login}\nПароль: ${password}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      showApiSuccess('Скопировано')
    } catch {
      showApiError(null, 'Не удалось скопировать — выделите текст вручную')
    }
  }
  return (
    <Modal isOpen onClose={onClose} title="Данные для входа" size="sm">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Передайте представителю. Пароль больше не покажем — при потере выдайте новый.
      </p>
      <pre className="mt-3 select-all whitespace-pre-wrap break-all rounded-lg bg-gray-50 p-3 text-sm text-gray-900 dark:bg-gray-900 dark:text-white">
        {text}
      </pre>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={copy}>
          <Copy className="mr-1 h-4 w-4" />
          Скопировать
        </Button>
        <Button onClick={onClose}>Готово</Button>
      </div>
    </Modal>
  )
}

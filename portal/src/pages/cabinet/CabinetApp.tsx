import { useState, type FormEvent } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Building2, ClipboardList, FileText, KeyRound, LogOut, Wrench } from 'lucide-react'
import { cabinetApi, useCabinetSession } from '@/api/cabinet'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { cn } from '@/utils/cn'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import CabinetLoginPage from './CabinetLoginPage'
import CabinetTasksPage from './CabinetTasksPage'
import CabinetTaskPage from './CabinetTaskPage'
import CabinetObjectsPage from './CabinetObjectsPage'
import CabinetActsPage from './CabinetActsPage'
import CabinetMaintenancePage from './CabinetMaintenancePage'

// Свой кэш запросов: данные кабинета не смешиваются с кэшем сотрудника
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000 } },
})

const NAV = [
  { to: '/client', end: true, label: 'Заявки', Icon: ClipboardList },
  { to: '/client/objects', end: false, label: 'Объекты', Icon: Building2 },
  { to: '/client/acts', end: false, label: 'Акты', Icon: FileText },
  { to: '/client/maintenance', end: false, label: 'ТО', Icon: Wrench },
]

/** Кабинет клиента: /portal/client/* — вход представителя УК/ТСЖ. */
export default function CabinetApp() {
  const token = useCabinetSession((state) => state.token)
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="login" element={token ? <Navigate to="/client" replace /> : <CabinetLoginPage />} />
        <Route path="*" element={token ? <CabinetLayout /> : <Navigate to="/client/login" replace />} />
      </Routes>
    </QueryClientProvider>
  )
}

function CabinetLayout() {
  const me = useCabinetSession((state) => state.me)
  const logout = useCabinetSession((state) => state.logout)
  const navigate = useNavigate()
  const [changingPassword, setChangingPassword] = useState(false)

  const exit = () => {
    logout()
    queryClient.clear()
    navigate('/client/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-gray-900 dark:text-white">{me?.counterparty_name}</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              Обслуживает {me?.organization_name}
              {me?.organization_phone && (
                <>
                  {' · '}
                  <a href={`tel:${me.organization_phone}`} className="text-primary-600 hover:underline dark:text-primary-400">
                    {me.organization_phone}
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm text-gray-900 dark:text-white">{me?.full_name}</p>
            {me?.position && <p className="text-xs text-gray-500 dark:text-gray-400">{me.position}</p>}
          </div>
          <button
            type="button"
            title="Сменить пароль"
            aria-label="Сменить пароль"
            onClick={() => setChangingPassword(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <KeyRound className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Выйти"
            aria-label="Выйти"
            onClick={exit}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2">
          {NAV.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <Routes>
          <Route index element={<CabinetTasksPage />} />
          <Route path="tasks/:id" element={<CabinetTaskPage />} />
          <Route path="objects" element={<CabinetObjectsPage />} />
          <Route path="acts" element={<CabinetActsPage />} />
          <Route path="maintenance" element={<CabinetMaintenancePage />} />
          <Route path="*" element={<Navigate to="/client" replace />} />
        </Routes>
      </main>

      {changingPassword && <PasswordModal onClose={() => setChangingPassword(false)} onChanged={exit} />}
    </div>
  )
}

function PasswordModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await cabinetApi.changePassword(current, next)
      showApiSuccess('Пароль изменён — войдите заново')
      onChanged()
    } catch (error) {
      showApiError(error, 'Не удалось сменить пароль')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal isOpen onClose={onClose} title="Смена пароля" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Текущий пароль" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
        <Input
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">Не короче 8 символов.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button type="submit" isLoading={saving}>Сменить</Button>
        </div>
      </form>
    </Modal>
  )
}

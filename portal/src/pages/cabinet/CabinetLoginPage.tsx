import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { cabinetApi, useCabinetSession } from '@/api/cabinet'
import { getApiErrorMessage } from '@/utils/apiError'
import Button from '@/components/Button'
import Input from '@/components/Input'
import PublicShell, { PublicCard } from '@/pages/public/PublicShell'

export default function CabinetLoginPage() {
  const setSession = useCabinetSession((state) => state.setSession)
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await cabinetApi.login(login, password)
      setSession(data.access_token, data.account)
      navigate('/client', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Не удалось войти'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-sm pt-6 sm:pt-16">
        <PublicCard>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Кабинет клиента</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Заявки, акты и ТО ваших объектов</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Input label="Логин" autoComplete="username" required value={login} onChange={(event) => setLogin(event.target.value)} />
            <Input
              label="Пароль"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" isLoading={loading} disabled={!login.trim() || !password}>
              Войти
            </Button>
          </form>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Логин и пароль выдаёт обслуживающая организация. Забыли пароль — попросите выдать новый.
          </p>
        </PublicCard>
      </div>
    </PublicShell>
  )
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  Phone,
} from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { getHomePathForRole } from '@/config/menuConfig'
import { resolveLoginBranding } from '@/config/appConfig'
import { usePublicLoginBranding } from '@/hooks/useSettings'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, user } = useAuthStore()
  const { data: publicBranding } = usePublicLoginBranding()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [shake, setShake] = useState(false)
  const branding = resolveLoginBranding(publicBranding, location.search)

  useEffect(() => {
    if (isAuthenticated && user?.role) {
      navigate(getHomePathForRole(user.role), { replace: true })
    }
  }, [isAuthenticated, navigate, user?.role])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(username, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка входа'
      setError(message)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (import.meta.env.DEV) console.error('Login error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="w-full max-w-[420px]">
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-7 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:px-7">
          <div className="mb-6 space-y-1 text-left">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {branding.organizationName
                ? `Вход в ${branding.organizationName}`
                : branding.appName}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {branding.organizationName
                ? 'Используйте рабочую учётную запись.'
                : 'Введите логин и пароль для входа в систему.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-3 animate-login-fade-in dark:border-red-900/50 dark:bg-red-950/30">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {import.meta.env.DEV && (
            <div className="mb-5 flex items-center gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-amber-800 dark:text-amber-200">
                <span className="font-medium">Dev:</span> admin / admin
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className={shake ? 'animate-login-shake' : ''}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Логин
                </label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  disabled={isLoading}
                  autoComplete="username"
                  autoFocus
                  className="h-11 rounded-lg border-gray-300 bg-white px-3.5 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Пароль
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="h-11 rounded-lg border-gray-300 bg-white px-3.5 pr-11 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              disabled={isLoading || !username.trim() || !password.trim()}
              className="mt-6 h-11 w-full rounded-lg bg-gray-900 text-sm font-medium transition-colors hover:bg-gray-800 active:bg-gray-950 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              {!isLoading && (
                <>
                  <span>Войти</span>
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        {(branding.supportEmail || branding.supportPhone) && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="font-medium text-gray-900 dark:text-white">Поддержка</p>
            <div className="mt-3 space-y-2">
              {branding.supportEmail && (
                <a
                  href={`mailto:${branding.supportEmail}`}
                  className="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                  <Mail className="h-4 w-4" />
                  <span>{branding.supportEmail}</span>
                </a>
              )}
              {branding.supportPhone && (
                <a
                  href={`tel:${branding.supportPhone}`}
                  className="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                  <Phone className="h-4 w-4" />
                  <span>{branding.supportPhone}</span>
                </a>
              )}
            </div>
            {branding.supportHours && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{branding.supportHours}</p>
            )}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          &copy; {new Date().getFullYear()} {branding.appName}
        </p>
      </div>
    </div>
  )
}

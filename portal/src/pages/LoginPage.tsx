import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LogIn,
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white">
              <LogIn className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {branding.organizationName
                ? `Вход — ${branding.organizationName}`
                : branding.appName}
            </h1>
            <p className="mt-1.5 text-sm text-gray-500">
              {branding.organizationName
                ? 'Используйте рабочую учётную запись.'
                : 'Введите данные для входа в систему.'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 animate-login-fade-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Dev hint */}
          {import.meta.env.DEV && (
            <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="text-amber-800">
                <span className="font-medium">Dev:</span> admin / admin
              </p>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className={shake ? 'animate-login-shake' : ''}
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
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
                  className="h-11 rounded-lg border-gray-300 bg-white px-3.5 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
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
                    className="h-11 rounded-lg border-gray-300 bg-white px-3.5 pr-11 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-gray-400 transition-colors hover:text-gray-600"
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
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
              className="mt-6 h-11 w-full rounded-lg bg-gray-900 text-sm font-medium transition-colors hover:bg-gray-800 active:bg-gray-950"
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

        {/* Support info — below the card */}
        {(branding.supportEmail || branding.supportPhone) && (
          <div className="mt-5 text-center text-sm text-gray-500">
            <p className="mb-1.5">Нужна помощь?</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {branding.supportEmail && (
                <a
                  href={`mailto:${branding.supportEmail}`}
                  className="inline-flex items-center gap-1.5 text-gray-600 transition-colors hover:text-gray-900"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>{branding.supportEmail}</span>
                </a>
              )}
              {branding.supportPhone && (
                <a
                  href={`tel:${branding.supportPhone}`}
                  className="inline-flex items-center gap-1.5 text-gray-600 transition-colors hover:text-gray-900"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>{branding.supportPhone}</span>
                </a>
              )}
            </div>
            {branding.supportHours && (
              <p className="mt-1 text-xs text-gray-400">{branding.supportHours}</p>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} {branding.appName}
        </p>
      </div>
    </div>
  )
}

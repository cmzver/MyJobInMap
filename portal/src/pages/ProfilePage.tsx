import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { 
  Lock, 
  Save,
  Camera,
  CheckCircle,
  Clock,
  Target,
  TrendingUp,
  Calendar,
  Flame,
  Star,
  Trophy,
} from 'lucide-react'
import Card from '@/components/Card'
import MetricCard from '@/components/MetricCard'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import Input from '@/components/Input'
import UserAvatar from '@/components/UserAvatar'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { getRoleBadgeVariant, getRoleLabel } from '@/types/user'
import Badge from '@/components/Badge'

interface ProfileForm {
  fullName: string
  email: string
  phone: string
}

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface UserStats {
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  completion_rate: number
  avg_completion_hours: number | null
  tasks_this_week: number
  tasks_this_month: number
  streak_days: number
}

const ACHIEVED_TONE = 'text-primary-600 dark:text-primary-400'

export default function ProfilePage() {
  const { user, setUser, token } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'stats'>('profile')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  // Загрузка статистики пользователя
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['userStats'],
    queryFn: async () => {
      const response = await apiClient.get('/users/me/stats')
      return response.data
    },
  })

  const profileForm = useForm<ProfileForm>({
    defaultValues: {
      fullName: user?.fullName || '',
      email: user?.email || '',
      phone: user?.phone || '',
    },
  })

  const passwordForm = useForm<PasswordForm>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const response = await apiClient.patch('/auth/profile', {
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
      })
      return response.data
    },
    onSuccess: (data) => {
      showApiSuccess('Профиль обновлён')
      if (user && token) {
        setUser({ ...user, fullName: data.full_name, email: data.email, phone: data.phone, avatarUrl: data.avatar_url ?? user.avatarUrl ?? null }, token)
      }
    },
    onError: (err) => {
      showApiError(err, 'Ошибка обновления профиля')
    },
  })

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: PasswordForm) => {
      await apiClient.patch('/auth/password', {
        current_password: data.currentPassword,
        new_password: data.newPassword,
      })
    },
    onSuccess: () => {
      showApiSuccess('Пароль изменён')
      passwordForm.reset()
    },
    onError: (err) => {
      showApiError(err, 'Ошибка изменения пароля')
    },
  })

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('avatar', file)
      const response = await apiClient.post('/auth/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: (data) => {
      showApiSuccess('Аватар обновлён')
      if (user && token) {
        setUser({ ...user, fullName: data.full_name, email: data.email, phone: data.phone, avatarUrl: data.avatar_url ?? null }, token)
      }
    },
    onError: (err) => {
      showApiError(err, 'Ошибка загрузки аватара')
    },
  })

  const onProfileSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data)
  }

  const onPasswordSubmit = (data: PasswordForm) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Пароли не совпадают')
      return
    }
    updatePasswordMutation.mutate(data)
  }

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    uploadAvatarMutation.mutate(file)
    event.target.value = ''
  }

  const formatHours = (hours: number | null) => {
    if (hours === null) return '—'
    if (hours < 1) return `${Math.round(hours * 60)} мин`
    if (hours < 24) return `${hours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`
    return `${Math.round(hours / 24)} д`
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <PageHeader title="Профиль" description="Управление вашим аккаунтом" />

      {/* User Card */}
      <Card>
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center">
            <div className="relative">
              <UserAvatar
                fullName={user?.fullName}
                avatarUrl={user?.avatarUrl}
                sizeClassName="h-20 w-20"
                textClassName="text-2xl"
              />
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarSelect}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadAvatarMutation.isPending}
                aria-label="Сменить фото профиля"
                title="Сменить фото профиля"
                className="absolute bottom-0 right-0 rounded-full border border-gray-200 bg-white p-1.5 shadow transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <Camera size={14} className="text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            <div className="ml-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{user?.fullName}</h2>
              <p className="text-gray-500 dark:text-gray-400">@{user?.username}</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                JPG, PNG, WEBP или GIF до 5 МБ
              </p>
              <Badge variant={getRoleBadgeVariant(user?.role, user?.baseAccess)} className="mt-2">
                {user?.roleLabel || getRoleLabel(user?.role)}
              </Badge>
            </div>
          </div>
          
          {/* Quick Stats */}
          {stats && (
            <div className="grid w-full grid-cols-3 gap-2 md:flex md:w-auto md:items-center md:gap-6 md:space-x-0">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_tasks}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Всего заявок</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completion_rate}%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Выполнено</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center text-2xl font-bold text-gray-900 dark:text-white">
                  <Flame size={20} className="mr-1 text-gray-400 dark:text-gray-500" />
                  {stats.streak_days}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Дней подряд</div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition ${
            activeTab === 'profile'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Личные данные
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition ${
            activeTab === 'stats'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Статистика
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition ${
            activeTab === 'password'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Пароль
        </button>
      </div>

      {/* Profile Form */}
      {activeTab === 'profile' && (
        <Card>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <Input
              label="Полное имя"
              {...profileForm.register('fullName', { required: 'Обязательное поле' })}
              error={profileForm.formState.errors.fullName?.message}
            />
            
            <Input
              label="Email"
              type="email"
              {...profileForm.register('email')}
            />
            
            <Input
              label="Телефон"
              type="tel"
              {...profileForm.register('phone')}
            />
            
            <Button
              type="submit"
              isLoading={updateProfileMutation.isPending}
              className="w-full"
            >
              <Save size={18} className="mr-2" />
              Сохранить
            </Button>
          </form>
        </Card>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {statsLoading ? (
            <Card>
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            </Card>
          ) : stats ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard icon={Target} label="Всего заявок" value={stats.total_tasks} />
                <MetricCard icon={CheckCircle} label="Выполнено" value={stats.completed_tasks} />
                <MetricCard icon={Clock} label="В работе" value={stats.in_progress_tasks} />
                <MetricCard icon={TrendingUp} label="% выполнения" value={`${stats.completion_rate}%`} />
              </div>

              {/* Progress Bar */}
              <Card title="Прогресс выполнения">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Выполнено</span>
                  <span className="font-medium text-gray-900 dark:text-white">{stats.completed_tasks} из {stats.total_tasks}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-2 rounded-full bg-primary-500 transition-all duration-500"
                    style={{ width: `${stats.completion_rate}%` }}
                  />
                </div>
              </Card>

              {/* Additional Stats */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card title="Активность">
                  <div className="space-y-2">
                    {[
                      { icon: Calendar, label: 'За эту неделю', value: stats.tasks_this_week },
                      { icon: Calendar, label: 'За этот месяц', value: stats.tasks_this_month },
                      { icon: Clock, label: 'Среднее время', value: formatHours(stats.avg_completion_hours) },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
                        <span className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <Icon size={16} className="mr-2 text-gray-400 dark:text-gray-500" />
                          {label}
                        </span>
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Достижения: нейтральные метрики, отметка — подписью акцентного цвета */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-1">
                  <MetricCard
                    icon={Flame}
                    label="Серия, дней"
                    value={stats.streak_days}
                    note={stats.streak_days >= 7 ? 'Достижение «7+ дней» получено' : `До «7+ дней» — ещё ${7 - stats.streak_days}`}
                    noteTone={stats.streak_days >= 7 ? ACHIEVED_TONE : undefined}
                  />
                  <MetricCard
                    icon={Trophy}
                    label="Выполнение 90%+"
                    value={`${stats.completion_rate}%`}
                    note={stats.completion_rate >= 90 ? 'Достижение получено' : 'Цель — 90% выполненных'}
                    noteTone={stats.completion_rate >= 90 ? ACHIEVED_TONE : undefined}
                  />
                  <MetricCard
                    icon={Star}
                    label="50+ выполненных"
                    value={stats.completed_tasks}
                    note={stats.completed_tasks >= 50 ? 'Достижение получено' : `Ещё ${50 - stats.completed_tasks}`}
                    noteTone={stats.completed_tasks >= 50 ? ACHIEVED_TONE : undefined}
                  />
                </div>
              </div>
            </>
          ) : (
            <Card>
              <p className="text-center text-gray-500 dark:text-gray-400">Нет данных о статистике</p>
            </Card>
          )}
        </div>
      )}

      {/* Password Form */}
      {activeTab === 'password' && (
        <Card>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <Input
              label="Текущий пароль"
              type="password"
              {...passwordForm.register('currentPassword', { required: 'Обязательное поле' })}
              error={passwordForm.formState.errors.currentPassword?.message}
            />
            
            <Input
              label="Новый пароль"
              type="password"
              {...passwordForm.register('newPassword', { 
                required: 'Обязательное поле',
                minLength: { value: 6, message: 'Минимум 6 символов' }
              })}
              error={passwordForm.formState.errors.newPassword?.message}
            />
            
            <Input
              label="Подтвердите пароль"
              type="password"
              {...passwordForm.register('confirmPassword', { required: 'Обязательное поле' })}
              error={passwordForm.formState.errors.confirmPassword?.message}
            />
            
            <Button
              type="submit"
              isLoading={updatePasswordMutation.isPending}
              className="w-full"
            >
              <Lock size={18} className="mr-2" />
              Изменить пароль
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}

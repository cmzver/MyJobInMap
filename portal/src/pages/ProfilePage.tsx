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
  Award,
  Flame,
  BarChart3
} from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Input from '@/components/Input'
import UserAvatar from '@/components/UserAvatar'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { getRoleLabel } from '@/types/user'

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
    if (hours < 24) return `${hours.toFixed(1)} ч`
    return `${Math.round(hours / 24)} д`
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Профиль</h1>
        <p className="text-gray-500 dark:text-gray-400">Управление вашим аккаунтом</p>
      </div>

      {/* User Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
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
              <span className="inline-block mt-2 px-3 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full">
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>
          
          {/* Quick Stats */}
          {stats && (
            <div className="hidden md:flex items-center space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_tasks}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Всего заявок</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.completion_rate}%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Выполнено</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center text-2xl font-bold text-orange-500">
                  <Flame size={20} className="mr-1" />
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
        <Card className="p-6">
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
              Сохранить изменения
            </Button>
          </form>
        </Card>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {statsLoading ? (
            <Card className="p-6">
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            </Card>
          ) : stats ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Target size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_tasks}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Всего заявок</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completed_tasks}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Выполнено</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <Clock size={20} className="text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.in_progress_tasks}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">В работе</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <TrendingUp size={20} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completion_rate}%</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">% выполнения</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Progress Bar */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Прогресс выполнения</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Выполнено</span>
                      <span className="font-medium text-gray-900 dark:text-white">{stats.completed_tasks} из {stats.total_tasks}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-green-600 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${stats.completion_rate}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Additional Stats */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <BarChart3 size={20} className="mr-2 text-primary-500" />
                    Активность
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center">
                        <Calendar size={18} className="text-blue-500 mr-3" />
                        <span className="text-gray-600 dark:text-gray-400">За эту неделю</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900 dark:text-white">{stats.tasks_this_week}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center">
                        <Calendar size={18} className="text-purple-500 mr-3" />
                        <span className="text-gray-600 dark:text-gray-400">За этот месяц</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900 dark:text-white">{stats.tasks_this_month}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center">
                        <Clock size={18} className="text-orange-500 mr-3" />
                        <span className="text-gray-600 dark:text-gray-400">Среднее время</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900 dark:text-white">{formatHours(stats.avg_completion_hours)}</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Award size={20} className="mr-2 text-yellow-500" />
                    Достижения
                  </h3>
                  <div className="space-y-3">
                    {/* Streak Achievement */}
                    <div className={`p-4 rounded-lg ${stats.streak_days > 0 ? 'bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Flame size={24} className={stats.streak_days > 0 ? 'text-orange-500' : 'text-gray-400'} />
                          <div className="ml-3">
                            <p className="font-medium text-gray-900 dark:text-white">Серия</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Дней подряд с заявками</p>
                          </div>
                        </div>
                        <span className={`text-2xl font-bold ${stats.streak_days > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                          {stats.streak_days}
                        </span>
                      </div>
                    </div>

                    {/* Performance Badges */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`p-3 text-center rounded-lg ${stats.completion_rate >= 90 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <span className={`text-2xl ${stats.completion_rate >= 90 ? '' : 'grayscale opacity-50'}`}>🏆</span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">90%+</p>
                      </div>
                      <div className={`p-3 text-center rounded-lg ${stats.completed_tasks >= 50 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <span className={`text-2xl ${stats.completed_tasks >= 50 ? '' : 'grayscale opacity-50'}`}>⭐</span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">50+ дел</p>
                      </div>
                      <div className={`p-3 text-center rounded-lg ${stats.streak_days >= 7 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <span className={`text-2xl ${stats.streak_days >= 7 ? '' : 'grayscale opacity-50'}`}>🔥</span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">7+ дней</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-6">
              <p className="text-center text-gray-500 dark:text-gray-400">Нет данных о статистике</p>
            </Card>
          )}
        </div>
      )}

      {/* Password Form */}
      {activeTab === 'password' && (
        <Card className="p-6">
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
              Рзменить пароль
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}

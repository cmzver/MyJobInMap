import { useState } from 'react'
import toast from 'react-hot-toast'
import { 
  User, 
  Lock, 
  Bell, 
  Server, 
  Save,
  Eye,
  EyeOff
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Card from '@/components/Card'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  
  // Profile form
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  })
  
  // Password form
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    
    try {
      await apiClient.put('/auth/profile', profileData)
      toast.success('Профиль обновлён')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка обновления профиля')
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('Пароли не совпадают')
      return
    }
    
    if (passwordData.new_password.length < 6) {
      toast.error('Пароль должен быть не менее 6 символов')
      return
    }
    
    setPasswordLoading(true)
    
    try {
      await apiClient.put('/auth/password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      })
      toast.success('Пароль изменён')
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка смены пароля')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Настройки</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Управление профилем и настройками аккаунта
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Settings */}
        <Card 
          title="Профиль"
          action={<User className="h-5 w-5 text-gray-400" />}
        >
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Имя пользователя"
                value={user?.username || ''}
                disabled
                className="bg-gray-50 dark:bg-gray-900"
              />
              <Input
                label="Роль"
                value={user?.role === 'admin' ? 'Администратор' : user?.role === 'dispatcher' ? 'Диспетчер' : 'Работник'}
                disabled
                className="bg-gray-50 dark:bg-gray-900"
              />
            </div>
            
            <Input
              label="Полное имя"
              value={profileData.full_name}
              onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
              placeholder="Иван Иванов"
            />
            
            <Input
              type="email"
              label="Email"
              value={profileData.email}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
              placeholder="email@example.com"
            />
            
            <Input
              label="Телефон"
              value={profileData.phone}
              onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
              placeholder="+7 (999) 123-45-67"
            />
            
            <div className="flex justify-end">
              <Button type="submit" disabled={profileLoading}>
                <Save className="h-4 w-4 mr-2" />
                {profileLoading ? 'Сохранение...' : 'Сохранить профиль'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Password Change */}
        <Card 
          title="Изменить пароль"
          action={<Lock className="h-5 w-5 text-gray-400" />}
        >
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                label="Текущий пароль"
                value={passwordData.current_password}
                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            
            <Input
              type={showPassword ? 'text' : 'password'}
              label="Новый пароль"
              value={passwordData.new_password}
              onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
              placeholder="••••••••"
            />
            
            <Input
              type={showPassword ? 'text' : 'password'}
              label="Подтвердите пароль"
              value={passwordData.confirm_password}
              onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
              placeholder="••••••••"
            />
            
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                />
                {showPassword ? (
                  <><EyeOff className="h-4 w-4" /> Скрыть пароли</>
                ) : (
                  <><Eye className="h-4 w-4" /> Показать пароли</>
                )}
              </label>
              
              <Button type="submit" disabled={passwordLoading}>
                <Lock className="h-4 w-4 mr-2" />
                {passwordLoading ? 'Изменение...' : 'Изменить пароль'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Notifications */}
        <Card 
          title="Уведомления"
          action={<Bell className="h-5 w-5 text-gray-400" />}
        >
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Push-уведомления</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Получать уведомления о новых заявках</p>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 bg-white dark:bg-gray-700"
              />
            </label>
            
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Email-уведомления</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Дублировать важные уведомления на email</p>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 bg-white dark:bg-gray-700"
              />
            </label>
            
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Звуковые уведомления</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Воспроизводить звук при новых событиях</p>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="w-5 h-5 text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 bg-white dark:bg-gray-700"
              />
            </label>
          </div>
        </Card>

        {/* System Info */}
        <Card 
          title="Информация о системе"
          action={<Server className="h-5 w-5 text-gray-400" />}
        >
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Версия</span>
              <span className="font-mono text-gray-900 dark:text-white">2.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">API сервер</span>
              <span className="font-mono text-gray-900 dark:text-white">localhost:8001</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Веб-панель</span>
              <span className="font-mono text-gray-900 dark:text-white">React + TypeScript</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">UI Framework</span>
              <span className="font-mono text-gray-900 dark:text-white">TailwindCSS 3.4</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

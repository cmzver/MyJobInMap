import { useState } from 'react'
import toast from 'react-hot-toast'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { 
  User, 
  Lock, 
  Save,
  Eye,
  EyeOff
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Card from '@/components/Card'
import PageHeader from '@/components/PageHeader'
import { getRoleLabel } from '@/types/user'

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
      await apiClient.patch('/auth/profile', profileData)
      showApiSuccess('Профиль обновлён')
    } catch (error) {
      showApiError(error, 'Ошибка обновления профиля')
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
      await apiClient.patch('/auth/password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      })
      showApiSuccess('Пароль изменён')
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (error) {
      showApiError(error, 'Ошибка смены пароля')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        className="mb-6"
        title="Настройки"
        description="Управление профилем и настройками аккаунта"
      />

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
                value={user?.role ? getRoleLabel(user.role) : ''}
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

      </div>
    </div>
  )
}

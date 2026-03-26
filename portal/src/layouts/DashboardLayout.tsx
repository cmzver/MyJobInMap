import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useConversations } from '@/hooks/useChat'
import { useUnreadNotifications } from '@/hooks/useNotifications'
import { useWebSocket } from '@/hooks/useWebSocket'
import { getMenuForRole, type MenuSection, type MenuItem } from '@/config/menuConfig'
import { getRoleLabel, normalizeRoleForAccess } from '@/types/user'
import UserAvatar from '@/components/UserAvatar'
import portalPackage from '../../package.json'
import { 
  LayoutDashboard, 
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  Palette,
  Sparkles,
  ChevronDown,
  Building2,
  Clock,
} from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, setTheme, isDark } = useTheme()
  const { data: conversations = [] } = useConversations()
  const { data: unreadNotifications = [] } = useUnreadNotifications({ enabled: Boolean(user) })

  // WebSocket — реал-тайм уведомления (инвалидация React Query кэша)
  useWebSocket()

  const unreadChatCount = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.unread_count, 0),
    [conversations],
  )
  const mentionChatCount = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.unread_mention_count, 0),
    [conversations],
  )
  const unreadNotificationCount = unreadNotifications.length
  const unreadTaskCount = useMemo(
    () => unreadNotifications.filter((notification) => notification.task_id != null).length,
    [unreadNotifications],
  )
  const unreadSupportCount = useMemo(
    () => unreadNotifications.filter((notification) => notification.type === 'support').length,
    [unreadNotifications],
  )

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date())
    }

    const getNextDelay = () => 60000 - (Date.now() % 60000)

    let timerId = window.setTimeout(function tick() {
      updateClock()
      timerId = window.setTimeout(tick, getNextDelay())
    }, getNextDelay())

    return () => window.clearTimeout(timerId)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Получаем меню для роли пользователя
  const menuSections = user?.role ? getMenuForRole(user.role, user.organizationId) : []

  const themeOptions = [
    { value: 'light' as const, label: 'Светлая', icon: Sun },
    { value: 'dark' as const, label: 'Тёмная', icon: Moon },
    { value: 'system' as const, label: 'Системная', icon: Monitor },
    { value: 'modern' as const, label: 'Modern / Glass', icon: Sparkles },
    { value: 'mac' as const, label: 'macOS / iOS', icon: Palette },
    { value: 'aurora' as const, label: 'Aurora Night', icon: Sparkles },
  ]

  const CurrentThemeIcon = theme === 'modern' || theme === 'mac' || theme === 'aurora'
    ? Palette
    : isDark
      ? Moon
      : Sun

  const formattedTime = useMemo(
    () => currentTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    [currentTime],
  )

  const formattedDate = useMemo(
    () => currentTime.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }),
    [currentTime],
  )
  const portalVersion = portalPackage.version

  const renderMenuItem = (item: MenuItem, closeSidebar?: () => void) => {
    const Icon = item.icon
    const isActive = location.pathname === item.path || 
                     (item.path !== '/' && location.pathname.startsWith(item.path))
    const isTaskMenuItem = item.id === 'tasks' || item.id === 'my-tasks'
    const badge = item.id === 'chat' && unreadChatCount > 0
      ? unreadChatCount > 99
        ? '99+'
        : String(unreadChatCount)
      : isTaskMenuItem && unreadTaskCount > 0
        ? unreadTaskCount > 99
          ? '99+'
          : String(unreadTaskCount)
      : item.id === 'notifications' && unreadNotificationCount > 0
        ? unreadNotificationCount > 99
          ? '99+'
          : String(unreadNotificationCount)
      : item.id === 'support' && unreadSupportCount > 0
        ? unreadSupportCount > 99
          ? '99+'
          : String(unreadSupportCount)
      : item.badge
    const showMentionBadge = item.id === 'chat' && mentionChatCount > 0
    
    return (
      <Link
        key={item.id}
        to={item.path}
        onClick={closeSidebar}
        className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
          isActive
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 shadow-sm'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
      >
        <Icon size={18} className="mr-3 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {showMentionBadge && (
          <span className="ml-2 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
            @
          </span>
        )}
        {badge && (
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
            {badge}
          </span>
        )}
      </Link>
    )
  }

  const renderMenuSection = (section: MenuSection, closeSidebar?: () => void) => (
    <div key={section.id} className="mb-6">
      {section.title && (
        <h3 className="px-4 mb-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {section.title}
        </h3>
      )}
      <nav className="space-y-1">
        {section.items.map((item) => renderMenuItem(item, closeSidebar))}
      </nav>
    </div>
  )

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 transition-colors dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 transition-colors">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 min-w-0 items-center justify-between gap-2">
            {/* Logo and mobile menu */}
            <div className="flex min-w-0 items-center">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <Link
                to={normalizeRoleForAccess(user?.role) === 'worker' ? '/my-tasks' : '/dashboard'}
                className="ml-2 flex min-w-0 items-center lg:ml-0"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                  <LayoutDashboard size={20} className="text-white" />
                </div>
                <span className="ml-2 truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white max-[380px]:hidden sm:ml-3 sm:text-xl">
                  FieldWorker
                </span>
              </Link>
            </div>

            {/* Right side controls */}
            <div className="flex flex-shrink-0 items-center gap-1 sm:gap-3">
              <div className="hidden min-[400px]:flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 sm:px-3">
                <Clock size={16} className="text-primary-500 dark:text-primary-400" />
                <div className="leading-tight">
                  <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{formattedTime}</div>
                  <div className="hidden md:block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {formattedDate}
                  </div>
                </div>
              </div>

              {/* Theme toggle */}
              <div className="relative">
                <button
                  onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                  className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  title="Сменить тему"
                >
                  <CurrentThemeIcon size={20} />
                </button>
                
                {isThemeMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsThemeMenuOpen(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1.5 z-20">
                      {themeOptions.map((option) => {
                        const Icon = option.icon
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              setTheme(option.value)
                              setIsThemeMenuOpen(false)
                            }}
                            className={`w-full flex items-center px-4 py-2 text-sm transition ${
                              theme === option.value
                                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Icon size={16} className="mr-3" />
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center rounded-lg px-2 py-2 text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:px-3"
                >
                  <UserAvatar
                    fullName={user?.fullName}
                    avatarUrl={user?.avatarUrl}
                    sizeClassName="h-8 w-8"
                    textClassName="text-sm"
                  />
                  <div className="hidden sm:block ml-3 text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.fullName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user?.role && getRoleLabel(user.role)}</p>
                  </div>
                  <ChevronDown size={16} className="ml-2 hidden sm:block" />
                </button>

                {isUserMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsUserMenuOpen(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1.5 z-20">
                      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            fullName={user?.fullName}
                            avatarUrl={user?.avatarUrl}
                            sizeClassName="h-10 w-10"
                            textClassName="text-sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{user?.fullName}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{user?.role && getRoleLabel(user.role)}</p>
                            {user?.organizationName && (
                              <p className="mt-0.5 truncate text-xs text-primary-600 dark:text-primary-400">{user.organizationName}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        Профиль
                      </Link>
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          handleLogout()
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        <LogOut size={16} className="mr-2" />
                        Выход
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:pt-16 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-colors">
          <div className="flex-1 overflow-y-auto px-3 py-6">
            {user?.organizationName && (
              <div className="px-4 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Building2 size={14} className="mr-2 flex-shrink-0" />
                  <span className="font-medium truncate">{user.organizationName}</span>
                </div>
              </div>
            )}
            {menuSections.map((section) => renderMenuSection(section))}
          </div>
          
          {/* Version info at bottom */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              FieldWorker Portal v{portalVersion}
            </p>
          </div>
        </aside>

        {/* Sidebar - Mobile */}
        {isSidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" 
            onClick={() => setIsSidebarOpen(false)}
          >
            <aside 
              className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-800 shadow-2xl transition-transform" 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xl font-bold text-gray-900 dark:text-white">Меню</span>
                <button 
                  onClick={() => setIsSidebarOpen(false)} 
                  className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="overflow-y-auto h-[calc(100vh-4rem)] px-3 py-6">
                {menuSections.map((section) => renderMenuSection(section, () => setIsSidebarOpen(false)))}
              </div>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 lg:pl-64 min-w-0">
          <div className="max-w-full px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

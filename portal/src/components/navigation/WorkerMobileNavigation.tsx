import { Link, useLocation } from 'react-router-dom'

import type { MenuItem } from '@/config/menuConfig'

interface WorkerMobileNavigationProps {
  items: MenuItem[]
  unreadChatCount: number
  unreadTaskCount: number
  mentionChatCount: number
}

const formatCount = (count: number) => (count > 99 ? '99+' : String(count))

export default function WorkerMobileNavigation({
  items,
  unreadChatCount,
  unreadTaskCount,
  mentionChatCount,
}: WorkerMobileNavigationProps) {
  const location = useLocation()

  if (items.length === 0) return null

  return (
    <nav
      aria-label="Основная мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white lg:hidden dark:border-gray-700 dark:bg-gray-800"
    >
      <div
        className="grid min-h-16"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isTaskDetail = item.id === 'my-tasks' && location.pathname.startsWith('/tasks/')
          const isActive = location.pathname === item.path
            || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`))
            || isTaskDetail
          const count = item.id === 'chat'
            ? unreadChatCount
            : item.id === 'my-tasks'
              ? unreadTaskCount
              : 0
          const hasMention = item.id === 'chat' && mentionChatCount > 0
          const badge = hasMention ? '@' : count > 0 ? formatCount(count) : null
          const label = item.mobileLabel ?? item.label
          const accessibleLabel = hasMention
            ? `${label}, есть непрочитанные упоминания`
            : count > 0
              ? `${label}, непрочитанных: ${count}`
              : label

          return (
            <Link
              key={item.id}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              aria-label={accessibleLabel}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 ${
                isActive
                  ? 'text-primary-700 dark:text-primary-400'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white'
              }`}
            >
              <span className="relative">
                <Icon size={20} aria-hidden="true" />
                {badge && (
                  <span className="absolute -right-3 -top-2 min-w-4 rounded-md bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

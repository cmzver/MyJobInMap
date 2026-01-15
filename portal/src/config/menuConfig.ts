import {
  LayoutDashboard,
  ClipboardList,
  Map,
  Users,
  Settings,
  BarChart3,
  MapPin,
  UserCircle,
  Bell,
  Calendar,
  DollarSign,
  type LucideIcon
} from 'lucide-react'

export type UserRole = 'admin' | 'dispatcher' | 'worker'

export interface MenuItem {
  id: string
  path: string
  label: string
  icon: LucideIcon
  roles: UserRole[]
  badge?: string
  children?: MenuItem[]
}

export interface MenuSection {
  id: string
  title?: string
  items: MenuItem[]
}

/**
 * Конфигурация меню по ролям
 * 
 * admin - Полный доступ ко всем разделам
 * dispatcher - Управление заявками и работниками
 * worker - Только свои заявки и карта
 */
export const menuConfig: MenuSection[] = [
  {
    id: 'main',
    title: 'Основное',
    items: [
      {
        id: 'dashboard',
        path: '/dashboard',
        label: 'Дашборд',
        icon: LayoutDashboard,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'my-tasks',
        path: '/my-tasks',
        label: 'Мои заявки',
        icon: ClipboardList,
        roles: ['worker'],
      },
      {
        id: 'tasks',
        path: '/tasks',
        label: 'Все заявки',
        icon: ClipboardList,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'map',
        path: '/map',
        label: 'Карта',
        icon: Map,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'calendar',
        path: '/calendar',
        label: 'Календарь',
        icon: Calendar,
        roles: ['admin', 'dispatcher', 'worker'],
      },
    ],
  },
  {
    id: 'management',
    title: 'Управление',
    items: [
      {
        id: 'addresses',
        path: '/addresses',
        label: 'Адреса',
        icon: MapPin,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'users',
        path: '/users',
        label: 'Пользователи',
        icon: Users,
        roles: ['admin'],
      },
      {
        id: 'finance',
        path: '/finance',
        label: 'Финансы',
        icon: DollarSign,
        roles: ['admin'],
      },

      {
        id: 'reports',
        path: '/reports',
        label: 'Отчёты',
        icon: BarChart3,
        roles: ['admin', 'dispatcher'],
      },
    ],
  },
  {
    id: 'personal',
    title: 'Личное',
    items: [
      {
        id: 'profile',
        path: '/profile',
        label: 'Профиль',
        icon: UserCircle,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'notifications',
        path: '/notifications',
        label: 'Уведомления',
        icon: Bell,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'settings',
        path: '/settings',
        label: 'Настройки',
        icon: Settings,
        roles: ['admin', 'dispatcher', 'worker'],
      },
    ],
  },
  {
    id: 'admin',
    title: 'Администрирование',
    items: [
      {
        id: 'admin-settings',
        path: '/admin/settings',
        label: 'Система',
        icon: Settings,
        roles: ['admin'],
      },
    ],
  },
]

/**
 * Фильтрация меню по роли пользователя
 */
export function getMenuForRole(role: UserRole): MenuSection[] {
  return menuConfig
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * Получить домашнюю страницу для роли
 */
export function getHomePathForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
    case 'dispatcher':
      return '/dashboard'
    case 'worker':
      return '/my-tasks'
    default:
      return '/my-tasks'
  }
}

/**
 * Проверка доступа к пути
 */
export function canAccessPath(path: string, role: UserRole): boolean {
  const allItems = menuConfig.flatMap((section) => section.items)
  const item = allItems.find((item) => path.startsWith(item.path))
  return item ? item.roles.includes(role) : false
}

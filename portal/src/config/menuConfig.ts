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
  Building2,
  MessageSquare,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react'
import type { AccessRole, UserRole } from '@/types/user'
import { normalizeRoleForAccess } from '@/types/user'

export type { UserRole }

export interface MenuItem {
  id: string
  path: string
  label: string
  icon: LucideIcon
  roles: AccessRole[]
  badge?: string
  children?: MenuItem[]
}

export interface MenuSection {
  id: string
  title?: string
  items: MenuItem[]
}

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
      {
        id: 'chat',
        path: '/chat',
        label: 'Чат',
        icon: MessageSquare,
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
        id: 'analytics',
        path: '/analytics',
        label: 'Аналитика',
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
        id: 'support',
        path: '/support',
        label: 'Поддержка',
        icon: LifeBuoy,
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
      {
        id: 'admin-organizations',
        path: '/admin/organizations',
        label: 'Организации',
        icon: Building2,
        roles: ['admin'],
      },
    ],
  },
]

const HIDDEN_FOR_ORG_ADMIN = new Set([
  'admin-organizations',
  'admin-settings',
  'finance',
])

export function isOrgAdmin(role: UserRole, organizationId?: number | null): boolean {
  return normalizeRoleForAccess(role) === 'admin' && organizationId != null && role !== 'superadmin'
}

export function getMenuForRole(role: UserRole, organizationId?: number | null): MenuSection[] {
  const normalizedRole = normalizeRoleForAccess(role)
  const orgAdmin = isOrgAdmin(role, organizationId)

  return menuConfig
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.roles.includes(normalizedRole)) return false
        if (orgAdmin && HIDDEN_FOR_ORG_ADMIN.has(item.id)) return false
        return true
      }),
    }))
    .filter((section) => section.items.length > 0)
}

export function getHomePathForRole(role: UserRole): string {
  switch (normalizeRoleForAccess(role)) {
    case 'admin':
    case 'dispatcher':
      return '/dashboard'
    case 'worker':
      return '/my-tasks'
    default:
      return '/my-tasks'
  }
}

export function canAccessPath(path: string, role: UserRole, organizationId?: number | null): boolean {
  const normalizedRole = normalizeRoleForAccess(role)
  const allItems = menuConfig.flatMap((section) => section.items)
  const item = allItems.find((menuItem) => path.startsWith(menuItem.path))
  if (!item) return false
  if (!item.roles.includes(normalizedRole)) return false
  if (isOrgAdmin(role, organizationId) && HIDDEN_FOR_ORG_ADMIN.has(item.id)) return false
  return true
}

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
  Shield,
  Building2,
  MessageSquare,
  type LucideIcon
} from 'lucide-react'
import type { UserRole } from '@/types/user'

export type { UserRole }

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
 * РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РјРµРЅСЋ РїРѕ СЂРѕР»СЏРј
 * 
 * admin - РџРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї РєРѕ РІСЃРµРј СЂР°Р·РґРµР»Р°Рј
 * dispatcher - РЈРїСЂР°РІР»РµРЅРёРµ Р·Р°СЏРІРєР°РјРё Рё СЂР°Р±РѕС‚РЅРёРєР°РјРё
 * worker - РўРѕР»СЊРєРѕ СЃРІРѕРё Р·Р°СЏРІРєРё Рё РєР°СЂС‚Р°
 */
export const menuConfig: MenuSection[] = [
  {
    id: 'main',
    title: 'РћСЃРЅРѕРІРЅРѕРµ',
    items: [
      {
        id: 'dashboard',
        path: '/dashboard',
        label: 'Р”Р°С€Р±РѕСЂРґ',
        icon: LayoutDashboard,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'my-tasks',
        path: '/my-tasks',
        label: 'РњРѕРё Р·Р°СЏРІРєРё',
        icon: ClipboardList,
        roles: ['worker'],
      },
      {
        id: 'tasks',
        path: '/tasks',
        label: 'Р’СЃРµ Р·Р°СЏРІРєРё',
        icon: ClipboardList,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'map',
        path: '/map',
        label: 'РљР°СЂС‚Р°',
        icon: Map,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'calendar',
        path: '/calendar',
        label: 'РљР°Р»РµРЅРґР°СЂСЊ',
        icon: Calendar,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'chat',
        path: '/chat',
        label: 'Р§Р°С‚',
        icon: MessageSquare,
        roles: ['admin', 'dispatcher', 'worker'],
      },
    ],
  },
  {
    id: 'management',
    title: 'РЈРїСЂР°РІР»РµРЅРёРµ',
    items: [
      {
        id: 'addresses',
        path: '/addresses',
        label: 'РђРґСЂРµСЃР°',
        icon: MapPin,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'users',
        path: '/users',
        label: 'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё',
        icon: Users,
        roles: ['admin'],
      },
      {
        id: 'finance',
        path: '/finance',
        label: 'Р¤РёРЅР°РЅСЃС‹',
        icon: DollarSign,
        roles: ['admin'],
      },

      {
        id: 'reports',
        path: '/reports',
        label: 'РћС‚С‡С‘С‚С‹',
        icon: BarChart3,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'sla',
        path: '/sla',
        label: 'SLA',
        icon: Shield,
        roles: ['admin', 'dispatcher'],
      },
    ],
  },
  {
    id: 'personal',
    title: 'Р›РёС‡РЅРѕРµ',
    items: [
      {
        id: 'profile',
        path: '/profile',
        label: 'РџСЂРѕС„РёР»СЊ',
        icon: UserCircle,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'notifications',
        path: '/notifications',
        label: 'РЈРІРµРґРѕРјР»РµРЅРёСЏ',
        icon: Bell,
        roles: ['admin', 'dispatcher', 'worker'],
      },
      {
        id: 'settings',
        path: '/settings',
        label: 'РќР°СЃС‚СЂРѕР№РєРё',
        icon: Settings,
        roles: ['admin', 'dispatcher', 'worker'],
      },
    ],
  },
  {
    id: 'admin',
    title: 'РђРґРјРёРЅРёСЃС‚СЂРёСЂРѕРІР°РЅРёРµ',
    items: [
      {
        id: 'admin-settings',
        path: '/admin/settings',
        label: 'РЎРёСЃС‚РµРјР°',
        icon: Settings,
        roles: ['admin'],
      },
      {
        id: 'admin-organizations',
        path: '/admin/organizations',
        label: 'РћСЂРіР°РЅРёР·Р°С†РёРё',
        icon: Building2,
        roles: ['admin'],
      },
    ],
  },
]

/**
 * Р¤РёР»СЊС‚СЂР°С†РёСЏ РјРµРЅСЋ РїРѕ СЂРѕР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
 * 
 * @param role Р РѕР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
 * @param organizationId ID РѕСЂРіР°РЅРёР·Р°С†РёРё (РµСЃР»Рё РµСЃС‚СЊ вЂ” org-admin, СЃРєСЂС‹РІР°РµРј "РћСЂРіР°РЅРёР·Р°С†РёРё")
 */
/**
 * РџСѓРЅРєС‚С‹ РјРµРЅСЋ, СЃРєСЂС‹С‚С‹Рµ РґР»СЏ org-admin (admin СЃ organizationId).
 * Org-admin СѓРїСЂР°РІР»СЏРµС‚ С‚РѕР»СЊРєРѕ СЃРІРѕРµР№ РѕСЂРіР°РЅРёР·Р°С†РёРµР№, РЅРµ РёРјРµРµС‚ РґРѕСЃС‚СѓРїР°
 * Рє СЃРёСЃС‚РµРјРЅС‹Рј РЅР°СЃС‚СЂРѕР№РєР°Рј Рё СѓРїСЂР°РІР»РµРЅРёСЋ РѕСЂРіР°РЅРёР·Р°С†РёСЏРјРё.
 */
const HIDDEN_FOR_ORG_ADMIN = new Set([
  'admin-organizations',
  'admin-settings',
  'finance',
])

export function isOrgAdmin(role: UserRole, organizationId?: number | null): boolean {
  return role === 'admin' && organizationId != null
}

export function getMenuForRole(role: UserRole, organizationId?: number | null): MenuSection[] {
  const orgAdmin = isOrgAdmin(role, organizationId)

  return menuConfig
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.roles.includes(role)) return false
        // Org-admin (admin СЃ organizationId) вЂ” СЃРєСЂС‹РІР°РµРј СЃРёСЃС‚РµРјРЅС‹Рµ СЂР°Р·РґРµР»С‹
        if (orgAdmin && HIDDEN_FOR_ORG_ADMIN.has(item.id)) return false
        return true
      }),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ РґРѕРјР°С€РЅСЋСЋ СЃС‚СЂР°РЅРёС†Сѓ РґР»СЏ СЂРѕР»Рё
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
 * РџСЂРѕРІРµСЂРєР° РґРѕСЃС‚СѓРїР° Рє РїСѓС‚Рё
 */
export function canAccessPath(path: string, role: UserRole, organizationId?: number | null): boolean {
  const allItems = menuConfig.flatMap((section) => section.items)
  const item = allItems.find((item) => path.startsWith(item.path))
  if (!item) return false
  if (!item.roles.includes(role)) return false
  if (isOrgAdmin(role, organizationId) && HIDDEN_FOR_ORG_ADMIN.has(item.id)) return false
  return true
}

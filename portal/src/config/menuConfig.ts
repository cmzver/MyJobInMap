import type { LucideIcon } from 'lucide-react'
import { getPortalRoutePath, navigationSections, portalRoutes } from '@/config/portalRoutes'
import type { AccessRole, UserRole } from '@/types/user'
import { normalizeRoleForAccess } from '@/types/user'

export type { UserRole }

export interface MenuItem {
  id: string
  path: string
  label: string
  mobileLabel?: string
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

export const menuConfig: MenuSection[] = navigationSections.map((section) => ({
  ...section,
  items: portalRoutes.flatMap((route) => {
    if (route.navigation?.section !== section.id || !route.roles) return []

    return [
      {
        id: route.id,
        path: getPortalRoutePath(route.id),
        label: route.navigation.label,
        mobileLabel: route.navigation.mobileLabel,
        icon: route.navigation.icon,
        roles: route.roles,
      },
    ]
  }),
}))

const HIDDEN_FOR_ORG_ADMIN = new Set(
  portalRoutes.filter(({ excludeOrgAdmin }) => excludeOrgAdmin).map(({ id }) => id)
)

export function isOrgAdmin(role: UserRole, organizationId?: number | null): boolean {
  return normalizeRoleForAccess(role) === 'admin' && organizationId != null && role !== 'superadmin'
}

export function getMenuForRole(
  role: UserRole,
  organizationId?: number | null,
  baseAccess?: string | null
): MenuSection[] {
  const normalizedRole = normalizeRoleForAccess(role, baseAccess)
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

export function getHomePathForRole(role: UserRole, baseAccess?: string | null): string {
  switch (normalizeRoleForAccess(role, baseAccess)) {
    case 'admin':
    case 'dispatcher':
      return getPortalRoutePath('dashboard')
    case 'worker':
      return getPortalRoutePath('my-tasks')
    default:
      return getPortalRoutePath('my-tasks')
  }
}

const WORKER_MOBILE_MENU_IDS = ['my-tasks', 'map', 'calendar', 'chat', 'profile'] as const

export function getMobileMenuForRole(
  role: UserRole,
  organizationId?: number | null,
  baseAccess?: string | null
): MenuItem[] {
  if (normalizeRoleForAccess(role, baseAccess) !== 'worker') return []

  const itemsById = new globalThis.Map(
    getMenuForRole(role, organizationId, baseAccess)
      .flatMap((section) => section.items)
      .map((item) => [item.id, item])
  )

  return WORKER_MOBILE_MENU_IDS.flatMap((id) => {
    const item = itemsById.get(id)
    return item ? [item] : []
  })
}

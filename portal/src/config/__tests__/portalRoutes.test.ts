import { describe, expect, it } from 'vitest'

import { menuConfig } from '@/config/menuConfig'
import { getPortalRoutePath, portalRoutes } from '@/config/portalRoutes'

describe('portalRoutes', () => {
  it('keeps route identifiers and paths unique', () => {
    const ids = portalRoutes.map(({ id }) => id)
    const paths = portalRoutes.map(({ path }) => path)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('defines exactly one destination for every route', () => {
    for (const route of portalRoutes) {
      expect(Number(route.element != null) + Number(route.redirectTo != null)).toBe(1)
    }
  })

  it('builds every menu item from route access and navigation metadata', () => {
    const menuItems = menuConfig.flatMap(({ items }) => items)
    const navigableRoutes = portalRoutes.filter(({ navigation }) => navigation)

    expect(menuItems).toHaveLength(navigableRoutes.length)

    for (const item of menuItems) {
      const route = portalRoutes.find(({ id }) => id === item.id)

      expect(route?.navigation).toBeDefined()
      expect(item.path).toBe(getPortalRoutePath(item.id))
      expect(item.roles).toEqual(route?.roles)
      expect(item.label).toBe(route?.navigation?.label)
    }
  })

  it('keeps compatibility redirects explicit', () => {
    expect(portalRoutes.find(({ id }) => id === 'devices-legacy')?.redirectTo).toBe('/profile')
    expect(portalRoutes.find(({ id }) => id === 'settings-legacy')?.redirectTo).toBe('/profile')
    expect(portalRoutes.find(({ id }) => id === 'reports-legacy')?.redirectTo).toBe('/analytics')
    expect(portalRoutes.find(({ id }) => id === 'sla-legacy')?.redirectTo).toBe('/analytics')
  })

  it('marks superadmin-only areas in the same registry', () => {
    const excludedForOrgAdmin = portalRoutes
      .filter(({ excludeOrgAdmin }) => excludeOrgAdmin)
      .map(({ id }) => id)

    expect(excludedForOrgAdmin).toEqual([
      'finance',
      'admin-settings',
      'admin-organizations',
      'admin-organization-detail',
      'admin-updates',
    ])
  })
})

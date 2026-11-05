import { describe, expect, it } from 'vitest'

import { getMenuForRole, getMobileMenuForRole } from '@/config/menuConfig'

describe('getMobileMenuForRole', () => {
  it('returns the ordered worker actions', () => {
    expect(getMobileMenuForRole('worker').map((item) => item.id)).toEqual([
      'my-tasks',
      'map',
      'calendar',
      'chat',
      'profile',
    ])
  })

  it('uses mobile labels from the shared menu registry', () => {
    expect(getMobileMenuForRole('worker')[0]?.mobileLabel).toBe('Заявки')
  })

  it('does not expose the worker navigation to other access levels', () => {
    expect(getMobileMenuForRole('admin')).toEqual([])
    expect(getMobileMenuForRole('dispatcher')).toEqual([])
  })

  it('supports a custom role with worker base access', () => {
    expect(getMobileMenuForRole('mobile-technician', null, 'worker').map((item) => item.id)).toContain('my-tasks')
  })
})

describe('getMenuForRole: разделы внутри организации', () => {
  const ids = (role: Parameters<typeof getMenuForRole>[0], org: number | null) =>
    getMenuForRole(role, org).flatMap((section) => section.items.map((item) => item.id))

  it('скрывает контрагентов и ТО у пользователя без организации', () => {
    const items = ids('superadmin', null)
    expect(items).not.toContain('counterparties')
    expect(items).not.toContain('maintenance')
    expect(items).toContain('tasks')
  })

  it('показывает их внутри организации', () => {
    const items = ids('dispatcher', 1)
    expect(items).toContain('counterparties')
    expect(items).toContain('maintenance')
  })
})

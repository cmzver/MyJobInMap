import { describe, expect, it } from 'vitest'

import { getMobileMenuForRole } from '@/config/menuConfig'

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

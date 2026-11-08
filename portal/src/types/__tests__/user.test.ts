import { describe, expect, it } from 'vitest'

import { canManageObjectData, getRoleBadgeVariant } from '@/types/user'

describe('getRoleBadgeVariant', () => {
  it('акцент только у администратора', () => {
    expect(getRoleBadgeVariant('admin')).toBe('primary')
    expect(getRoleBadgeVariant('superadmin')).toBe('primary')
    expect(getRoleBadgeVariant('custom-boss', 'admin')).toBe('primary')
  })

  it('диспетчер, менеджер, работник и кастомные группы — нейтральные', () => {
    expect(getRoleBadgeVariant('dispatcher')).toBe('gray')
    expect(getRoleBadgeVariant('manager')).toBe('gray')
    expect(getRoleBadgeVariant('worker')).toBe('gray')
    expect(getRoleBadgeVariant('installers', 'dispatcher')).toBe('gray')
    expect(getRoleBadgeVariant('installers')).toBe('gray')
  })
})

describe('canManageObjectData', () => {
  it('диспетчер и администратор могут менять карточку объекта', () => {
    expect(canManageObjectData('dispatcher')).toBe(true)
    expect(canManageObjectData('manager')).toBe(true)
    expect(canManageObjectData('admin')).toBe(true)
    expect(canManageObjectData('seniors', 'dispatcher')).toBe(true)
  })

  it('базовый доступ «worker» — только просмотр', () => {
    expect(canManageObjectData('worker')).toBe(false)
    expect(canManageObjectData('installers', 'worker')).toBe(false)
    // base_access авторитетнее слага роли
    expect(canManageObjectData('dispatcher', 'worker')).toBe(false)
    expect(canManageObjectData(null, null)).toBe(false)
  })
})

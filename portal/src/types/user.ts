import type { components } from './api.generated'

// User model and write payloads are derived from the backend OpenAPI schema
// (single source of truth) — regenerate with `npm run gen:api`.
export type User = components['schemas']['UserResponse']
export type CreateUserData = components['schemas']['UserCreate']
export type UpdateUserData = components['schemas']['UserUpdate']

// Группы пользователей (кастомные роли)
export type UserGroup = components['schemas']['UserGroupResponse']
export type CreateGroupData = components['schemas']['UserGroupCreate']
export type UpdateGroupData = components['schemas']['UserGroupUpdate']

// Роль теперь свободная строка (slug группы): помимо встроенных ролей это могут
// быть произвольные пользовательские группы. Встроенные роли вынесены отдельно
// (в OpenAPI enum UserRole больше не экспортируется — роль это str).
export type BuiltinRole = 'superadmin' | 'admin' | 'manager' | 'dispatcher' | 'worker'
export type UserRole = string

// Client-side coarse access role (not a backend concept).
export type AccessRole = 'admin' | 'dispatcher' | 'worker'

// Базовый доступ группы (base_access) — авторитетный источник для навигации.
// Для кастомных групп роль-слаг ничего не говорит об уровне доступа, поэтому
// при наличии base_access используем именно его.
export function normalizeRoleForAccess(
  role?: string | null,
  baseAccess?: string | null,
): AccessRole {
  if (baseAccess === 'admin' || baseAccess === 'dispatcher' || baseAccess === 'worker') {
    return baseAccess
  }
  switch (role) {
    case 'superadmin':
    case 'admin':
      return 'admin'
    case 'manager':
    case 'dispatcher':
      return 'dispatcher'
    default:
      return 'worker'
  }
}

export function isSuperadminRole(role?: string | null, organizationId?: number | null): boolean {
  return role === 'superadmin' || (role === 'admin' && organizationId == null)
}

export function isAssignableRole(role?: string | null): boolean {
  const normalizedRole = normalizeRoleForAccess(role)
  return normalizedRole === 'worker' || normalizedRole === 'dispatcher'
}

export function getRoleLabel(role?: string | null): string {
  switch (role) {
    case 'superadmin':
      return 'Супер-админ'
    case 'admin':
      return 'Администратор'
    case 'manager':
      return 'Менеджер'
    case 'dispatcher':
      return 'Диспетчер'
    case 'worker':
      return 'Работник'
    default:
      return role ?? ''
  }
}

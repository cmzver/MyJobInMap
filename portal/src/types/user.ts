import type { components } from './api.generated'

// User model, role enum and write payloads are derived from the backend
// OpenAPI schema (single source of truth) — regenerate with `npm run gen:api`.
export type UserRole = components['schemas']['UserRole']
export type User = components['schemas']['UserResponse']
export type CreateUserData = components['schemas']['UserCreate']
export type UpdateUserData = components['schemas']['UserUpdate']

// Client-side coarse access role (not a backend concept).
export type AccessRole = 'admin' | 'dispatcher' | 'worker'

export function normalizeRoleForAccess(role?: string | null): AccessRole {
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

export function canManageTasksRole(role?: string | null): boolean {
  const normalizedRole = normalizeRoleForAccess(role)
  return normalizedRole === 'admin' || normalizedRole === 'dispatcher'
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

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'dispatcher' | 'worker'
export type AccessRole = 'admin' | 'dispatcher' | 'worker'

export interface User {
  id: number
  username: string
  full_name: string
  email: string | null
  phone: string | null
  avatar_url?: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  last_login: string | null
  assigned_tasks_count: number
  organization_id?: number | null
}

export interface CreateUserData {
  username: string
  password: string
  full_name?: string
  email?: string
  phone?: string
  role: UserRole
  organization_id?: number
}

export interface UpdateUserData {
  username?: string
  password?: string
  full_name?: string
  email?: string
  phone?: string
  role?: UserRole
  is_active?: boolean
}

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

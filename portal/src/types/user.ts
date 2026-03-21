export type UserRole = 'admin' | 'dispatcher' | 'worker'

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

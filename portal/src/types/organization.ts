export interface Organization {
  id: number
  name: string
  slug: string
  description: string | null
  email: string | null
  phone: string | null
  address: string | null
  is_active: boolean
  max_users: number
  max_tasks: number
  user_count: number
  task_count: number
  address_count: number
  created_at: string | null
  updated_at: string | null
}

export interface CreateOrganizationData {
  name: string
  slug?: string
  description?: string
  email?: string
  phone?: string
  address?: string
  max_users?: number
  max_tasks?: number
  initial_admin?: {
    username: string
    password: string
    full_name?: string
    email?: string
    phone?: string
  }
}

export interface UpdateOrganizationData {
  name?: string
  description?: string
  email?: string
  phone?: string
  address?: string
  max_users?: number
  max_tasks?: number
  is_active?: boolean
}

export interface AssignUserData {
  user_id: number
  organization_id: number
}

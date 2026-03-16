import apiClient from './client'
import type {
  Organization,
  CreateOrganizationData,
  UpdateOrganizationData,
  AssignUserData,
} from '@/types/organization'

const ORG_BASE = '/admin/organizations'

export interface OrgUser {
  id: number
  username: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  is_active: boolean
  created_at: string
  last_login: string | null
  assigned_tasks_count: number
  organization_id: number | null
}

export const organizationsApi = {
  async getOrganizations(includeInactive = false): Promise<Organization[]> {
    const { data } = await apiClient.get<Organization[]>(ORG_BASE, {
      params: includeInactive ? { include_inactive: true } : undefined,
    })
    return data
  },

  async getOrganization(id: number): Promise<Organization> {
    const { data } = await apiClient.get<Organization>(`${ORG_BASE}/${id}`)
    return data
  },

  async createOrganization(orgData: CreateOrganizationData): Promise<Organization> {
    const { data } = await apiClient.post<Organization>(ORG_BASE, orgData)
    return data
  },

  async updateOrganization(id: number, orgData: UpdateOrganizationData): Promise<Organization> {
    const { data } = await apiClient.patch<Organization>(`${ORG_BASE}/${id}`, orgData)
    return data
  },

  async deactivateOrganization(id: number): Promise<{ message: string }> {
    const { data } = await apiClient.delete<{ message: string }>(`${ORG_BASE}/${id}`)
    return data
  },

  async activateOrganization(id: number): Promise<Organization> {
    const { data } = await apiClient.post<Organization>(`${ORG_BASE}/${id}/activate`)
    return data
  },

  async assignUser(assignData: AssignUserData): Promise<{ message: string; user_id: number; organization_id: number }> {
    const { data } = await apiClient.post<{ message: string; user_id: number; organization_id: number }>(
      `${ORG_BASE}/assign-user`,
      assignData
    )
    return data
  },

  async unassignUser(orgId: number, userId: number): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>(
      `${ORG_BASE}/${orgId}/unassign-user`,
      { user_id: userId }
    )
    return data
  },

  async getOrganizationUsers(orgId: number): Promise<OrgUser[]> {
    const { data } = await apiClient.get<OrgUser[]>(`${ORG_BASE}/${orgId}/users`)
    return data
  },
}

import apiClient from './client'
import type { CreateGroupData, UpdateGroupData, UserGroup } from '@/types/user'

// Группы (кастомные роли) находятся под /api/admin/groups
const GROUPS_BASE = '/admin/groups'

// Скоуп организации передаётся как ?organization_id=. Орг-админ опускает его
// (бэкенд скоупит по организации вызывающего); суперадмин на странице «Система»
// выбирает организацию явно, иначе кастомную группу создать нельзя.
function orgParams(organizationId?: number) {
  return organizationId != null ? { params: { organization_id: organizationId } } : undefined
}

export const groupsApi = {
  async getGroups(organizationId?: number): Promise<UserGroup[]> {
    const { data } = await apiClient.get<UserGroup[]>(GROUPS_BASE, orgParams(organizationId))
    return data
  },

  async createGroup(payload: CreateGroupData, organizationId?: number): Promise<UserGroup> {
    const { data } = await apiClient.post<UserGroup>(GROUPS_BASE, payload, orgParams(organizationId))
    return data
  },

  async updateGroup(
    name: string,
    payload: UpdateGroupData,
    organizationId?: number,
  ): Promise<UserGroup> {
    const { data } = await apiClient.patch<UserGroup>(
      `${GROUPS_BASE}/${name}`,
      payload,
      orgParams(organizationId),
    )
    return data
  },

  async deleteGroup(name: string, organizationId?: number): Promise<void> {
    await apiClient.delete(`${GROUPS_BASE}/${name}`, orgParams(organizationId))
  },
}

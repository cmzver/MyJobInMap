import apiClient from './client'
import type { components } from '@/types/api.generated'

export type OrganizationSettings = components['schemas']['OrganizationSettingsResponse']
export type OrganizationSettingsUpdate = components['schemas']['OrganizationSettingsUpdate']
export type SlaHours = components['schemas']['SlaHours']

const BASE = '/admin/organization-settings'

// Админ организации работает со своей — organizationId не передаётся;
// суперадмин выбирает организацию явно.
const params = (organizationId?: number) =>
  organizationId != null ? { params: { organization_id: organizationId } } : undefined

export const organizationSettingsApi = {
  async get(organizationId?: number): Promise<OrganizationSettings> {
    const { data } = await apiClient.get<OrganizationSettings>(BASE, params(organizationId))
    return data
  },

  async save(
    payload: OrganizationSettingsUpdate,
    organizationId?: number
  ): Promise<OrganizationSettings> {
    const { data } = await apiClient.put<OrganizationSettings>(BASE, payload, params(organizationId))
    return data
  },
}

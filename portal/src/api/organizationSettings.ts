import apiClient from './client'
import type { components } from '@/types/api.generated'

export type OrganizationSettings = components['schemas']['OrganizationSettingsResponse']
export type OrganizationSettingsUpdate = components['schemas']['OrganizationSettingsUpdate']
export type SlaHours = components['schemas']['SlaHours']
export type ActTemplate = components['schemas']['ActTemplate']

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

  /** Образец акта по введённым, ещё не сохранённым настройкам. */
  async previewAct(payload: OrganizationSettingsUpdate, organizationId?: number): Promise<Blob> {
    const { data } = await apiClient.post<Blob>(`${BASE}/act-preview`, payload, {
      ...params(organizationId),
      responseType: 'blob',
    })
    return data
  },

  async getLogo(organizationId?: number): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`${BASE}/logo`, {
      ...params(organizationId),
      responseType: 'blob',
    })
    return data
  },

  async uploadLogo(file: File, organizationId?: number): Promise<OrganizationSettings> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.put<OrganizationSettings>(`${BASE}/logo`, form, {
      ...params(organizationId),
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async deleteLogo(organizationId?: number): Promise<OrganizationSettings> {
    const { data } = await apiClient.delete<OrganizationSettings>(`${BASE}/logo`, params(organizationId))
    return data
  },
}

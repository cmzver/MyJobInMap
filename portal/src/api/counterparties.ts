import apiClient from './client'
import type { components } from '@/types/api.generated'
import type { Act } from './acts'

// Типы — из OpenAPI сервера (`npm run gen:api`).
export type Counterparty = components['schemas']['CounterpartyResponse']
export type CounterpartyCreate = components['schemas']['CounterpartyCreate']
export type CounterpartyUpdate = components['schemas']['CounterpartyUpdate']
export type CounterpartyAddress = components['schemas']['CounterpartyAddress']
export type SummaryPreview = components['schemas']['SummaryPreview']
export type ClientAccount = components['schemas']['ClientAccountResponse']
export type ClientAccountCreate = components['schemas']['ClientAccountCreate']
export type ClientAccountUpdate = components['schemas']['ClientAccountUpdate']

export const counterpartiesApi = {
  /** Входы в кабинет клиента представителей контрагента. */
  async accounts(id: number): Promise<ClientAccount[]> {
    const { data } = await apiClient.get<ClientAccount[]>(`/counterparties/${id}/accounts`)
    return data
  },

  async createAccount(id: number, body: ClientAccountCreate): Promise<ClientAccount> {
    const { data } = await apiClient.post<ClientAccount>(`/counterparties/${id}/accounts`, body)
    return data
  },

  async updateAccount(id: number, accountId: number, body: ClientAccountUpdate): Promise<ClientAccount> {
    const { data } = await apiClient.patch<ClientAccount>(`/counterparties/${id}/accounts/${accountId}`, body)
    return data
  },

  async deleteAccount(id: number, accountId: number): Promise<void> {
    await apiClient.delete(`/counterparties/${id}/accounts/${accountId}`)
  },

  async list(includeInactive = false): Promise<Counterparty[]> {
    const { data } = await apiClient.get<Counterparty[]>('/counterparties', {
      params: { include_inactive: includeInactive },
    })
    return data
  },

  async get(id: number): Promise<Counterparty> {
    const { data } = await apiClient.get<Counterparty>(`/counterparties/${id}`)
    return data
  },

  async create(body: CounterpartyCreate): Promise<Counterparty> {
    const { data } = await apiClient.post<Counterparty>('/counterparties', body)
    return data
  },

  async update(id: number, body: CounterpartyUpdate): Promise<Counterparty> {
    const { data } = await apiClient.patch<Counterparty>(`/counterparties/${id}`, body)
    return data
  },

  async remove(id: number): Promise<void> {
    await apiClient.delete(`/counterparties/${id}`)
  },

  async addresses(id: number): Promise<CounterpartyAddress[]> {
    const { data } = await apiClient.get<CounterpartyAddress[]>(`/counterparties/${id}/addresses`)
    return data
  },

  /** Полный список объектов контрагента: не вошедшие отвязываются. */
  async setAddresses(id: number, addressIds: number[]): Promise<CounterpartyAddress[]> {
    const { data } = await apiClient.put<CounterpartyAddress[]>(`/counterparties/${id}/addresses`, {
      address_ids: addressIds,
    })
    return data
  },

  async summaryPreview(id: number, month: string): Promise<SummaryPreview> {
    const { data } = await apiClient.get<SummaryPreview>(`/counterparties/${id}/summary-preview`, {
      params: { month },
    })
    return data
  },

  async summaryActs(id: number): Promise<Act[]> {
    const { data } = await apiClient.get<Act[]>(`/counterparties/${id}/summary-acts`)
    return data
  },

  async issueSummaryAct(id: number, month: string, supersedesActId?: number | null): Promise<Act> {
    const { data } = await apiClient.post<Act>(`/counterparties/${id}/summary-acts`, {
      month,
      supersedes_act_id: supersedesActId ?? null,
    })
    return data
  },
}

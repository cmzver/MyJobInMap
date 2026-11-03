import apiClient from './client'

import type { components } from '@/types/api.generated'

export type Material = components['schemas']['MaterialResponse']
export type MaterialCreate = components['schemas']['MaterialCreate']
export type MaterialUpdate = components['schemas']['MaterialUpdate']
export type MaterialBalance = components['schemas']['MaterialBalance']
export type Stock = components['schemas']['StockResponse']
export type MaterialMovement = components['schemas']['MaterialMovementResponse']
export type MaterialMovementPage = components['schemas']['MaterialMovementPage']
export type MaterialOperation = components['schemas']['MaterialOperationCreate']
export type MaterialOperationKind = MaterialOperation['kind']
export type TurnoverRow = components['schemas']['TurnoverRowResponse']

export interface MovementFilters {
  month?: string
  material_id?: number
  /** 0 — склад организации */
  user_id?: number
  kind?: string
  limit?: number
  offset?: number
}

export const materialsApi = {
  list: async (includeArchived = false) =>
    (await apiClient.get<Material[]>('/materials', { params: { include_archived: includeArchived } })).data,
  create: async (data: MaterialCreate) => (await apiClient.post<Material>('/materials', data)).data,
  update: async (id: number, data: MaterialUpdate) =>
    (await apiClient.patch<Material>(`/materials/${id}`, data)).data,
  /** Остатки одного исполнителя; без user_id — свои. */
  stocks: async (user_id?: number) =>
    (await apiClient.get<Stock[]>('/materials/stocks', { params: { user_id } })).data,
  /** Склад и все исполнители по каждому материалу. */
  balances: async () => (await apiClient.get<MaterialBalance[]>('/materials/balances')).data,
  operate: async (data: MaterialOperation) =>
    (await apiClient.post<MaterialMovement>('/materials/operations', data)).data,
  movements: async (filters: MovementFilters) =>
    (await apiClient.get<MaterialMovementPage>('/materials/movements', { params: filters })).data,
  turnover: async (month: string) =>
    (await apiClient.get<TurnoverRow[]>('/materials/turnover', { params: { month } })).data,
  downloadTurnover: async (month: string) => {
    const { data } = await apiClient.get<Blob>('/materials/turnover.xlsx', {
      params: { month },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Обороты материалов ${month}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
  taskMaterials: async (taskId: number) =>
    (await apiClient.get<MaterialMovement[]>(`/tasks/${taskId}/materials`)).data,
  consume: async (
    taskId: number,
    data: { material_id: number; quantity: string; reason: string; operation_id: string },
  ) => apiClient.post(`/tasks/${taskId}/materials`, data),
}

import apiClient from './client'

import type { components } from '@/types/api.generated'

export type MaintenancePlan = Required<components['schemas']['MaintenanceResponse']>
export type Material = Required<components['schemas']['MaterialResponse']>
export type Stock = components['schemas']['StockResponse']
export type MaterialMovement = components['schemas']['MaterialMovementResponse']

export const operationsApi = {
  plans: async () => (await apiClient.get<MaintenancePlan[]>('/maintenance-plans')).data,
  savePlan: async (data: Omit<MaintenancePlan, 'id' | 'next_date'>, id?: number) =>
    (await (id ? apiClient.put(`/maintenance-plans/${id}`, data) : apiClient.post('/maintenance-plans', data))).data,
  myDay: async (day: string, user_id?: number) =>
    (await apiClient.get<components['schemas']['DayResponse']>('/my-day', { params: { day, user_id } })).data,
  saveRoute: async (day: string, task_ids: number[], user_id?: number) =>
    apiClient.put('/my-day', { task_ids }, { params: { day, user_id } }),
  materials: async () => (await apiClient.get<Material[]>('/materials')).data,
  stocks: async (user_id?: number) => (await apiClient.get<Stock[]>('/materials/stocks', { params: { user_id } })).data,
  createMaterial: async (data: { name: string; unit: string; unit_cost: string }) => apiClient.post('/materials', data),
  adjustStock: async (data: { material_id: number; user_id: number; quantity: string; kind: string; reason: string; operation_id: string }) => apiClient.post('/materials/adjust', data),
  taskMaterials: async (taskId: number) => (await apiClient.get<MaterialMovement[]>(`/tasks/${taskId}/materials`)).data,
  consumeMaterial: async (taskId: number, data: { material_id: number; quantity: string; reason: string; operation_id: string }) => apiClient.post(`/tasks/${taskId}/materials`, data),
  passport: async (id: number) => (await apiClient.get<components['schemas']['EquipmentPassportResponse']>(`/equipment/${id}`)).data,
  linkEquipment: async (taskId: number, equipment_id: number | null) => apiClient.put(`/tasks/${taskId}/equipment`, { equipment_id }),
}

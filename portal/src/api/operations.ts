import apiClient from './client'

import type { components } from '@/types/api.generated'

export type MaintenancePlan = Required<components['schemas']['MaintenanceResponse']>
export type MaintenanceBulk = components['schemas']['MaintenanceBulkCreate']
export type MaintenanceBulkResult = components['schemas']['MaintenanceBulkResult']
export type MaintenanceSchedule = components['schemas']['ScheduleResponse']
export type ScheduleCell = components['schemas']['ScheduleCell']

export interface ScheduleFilters {
  month_from: string
  months: number
  counterparty_id?: number
  assigned_user_id?: number
}

export const operationsApi = {
  plans: async () => (await apiClient.get<MaintenancePlan[]>('/maintenance-plans')).data,
  /** Один регламент на много объектов: список или все объекты контрагента. */
  bulkPlans: async (data: MaintenanceBulk) =>
    (await apiClient.post<MaintenanceBulkResult>('/maintenance-plans/bulk', data)).data,
  /** Сетка «регламент × месяц»: факт по заявкам ТО и прогноз впереди. */
  schedule: async (filters: ScheduleFilters) =>
    (await apiClient.get<MaintenanceSchedule>('/maintenance/schedule', { params: filters })).data,
  /** Отчёт выполнения ТО за месяц (Excel). */
  downloadReport: async (month: string, counterpartyId?: number) => {
    const { data } = await apiClient.get<Blob>('/maintenance/report.xlsx', {
      params: { month, counterparty_id: counterpartyId },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `ТО ${month}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
  savePlan: async (data: Omit<MaintenancePlan, 'id' | 'next_date'>, id?: number) =>
    (await (id ? apiClient.put(`/maintenance-plans/${id}`, data) : apiClient.post('/maintenance-plans', data))).data,
  myDay: async (day: string, user_id?: number) =>
    (await apiClient.get<components['schemas']['DayResponse']>('/my-day', { params: { day, user_id } })).data,
  saveRoute: async (day: string, task_ids: number[], user_id?: number) =>
    apiClient.put('/my-day', { task_ids }, { params: { day, user_id } }),
  passport: async (id: number) => (await apiClient.get<components['schemas']['EquipmentPassportResponse']>(`/equipment/${id}`)).data,
  linkEquipment: async (taskId: number, equipment_id: number | null) => apiClient.put(`/tasks/${taskId}/equipment`, { equipment_id }),
}

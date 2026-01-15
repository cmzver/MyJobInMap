import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'

export interface DefectType {
  id: string
  name: string
  description?: string
  system_types?: string[]  // Для каких типов систем применим этот тип неисправности
}

export interface SystemSetting {
  key: string
  value: any
  value_type: string
  group: string
  label: string
  description?: string
  options?: Array<{ value: string; label: string }>
}

export interface SettingsGroup {
  group: string
  label: string
  icon?: string
  settings: SystemSetting[]
}

export const settingsApi = {
  // Получить все системные настройки
  async getSettings(): Promise<SettingsGroup[]> {
    const { data } = await apiClient.get<SettingsGroup[]>('/admin/settings')
    return data
  },

  // Получить настройку по ключу
  async getSetting(key: string): Promise<SystemSetting> {
    const { data } = await apiClient.get<SystemSetting>(`/admin/settings/${key}`)
    return data
  },

  // Обновить настройку
  async updateSetting(key: string, value: any): Promise<SystemSetting> {
    const { data } = await apiClient.put<SystemSetting>(`/admin/settings/${key}`, { value })
    return data
  },

  // Получить типы неисправностей
  async getDefectTypes(): Promise<DefectType[]> {
    const { data } = await apiClient.get<DefectType[]>('/admin/settings/defect-types/list')
    return data
  },

  // Добавить тип неисправности
  async addDefectType(name: string, description?: string): Promise<DefectType> {
    const { data } = await apiClient.post<DefectType>('/admin/settings/defect-types/add', {
      name,
      description,
    })
    return data
  },

  // Удалить тип неисправности
  async deleteDefectType(id: string): Promise<void> {
    await apiClient.delete(`/admin/settings/defect-types/${id}`)
  },
}

const queryKeys = {
  settings: ['settings'],
  setting: (key: string) => ['setting', key],
  defectTypes: ['defect-types'],
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => settingsApi.getSettings(),
    staleTime: 300000, // 5 minutes
  })
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.setting(key),
    queryFn: () => settingsApi.getSetting(key),
    staleTime: 300000,
    enabled: !!key,
  })
}

export function useUpdateSetting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      settingsApi.updateSetting(key, value),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      queryClient.invalidateQueries({ queryKey: queryKeys.setting(data.key) })
    },
  })
}

export function useDefectTypes() {
  return useQuery({
    queryKey: queryKeys.defectTypes,
    queryFn: () => settingsApi.getDefectTypes(),
    staleTime: 300000, // 5 minutes
  })
}

export function useAddDefectType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      settingsApi.addDefectType(name, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.defectTypes })
    },
  })
}

export function useDeleteDefectType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteDefectType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.defectTypes })
    },
  })
}

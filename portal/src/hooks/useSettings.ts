import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { TaskPriority } from '@/types/task'
import type { components } from '@/types/api.generated'

export interface DefectType {
  id: string
  name: string
  description?: string
  system_types?: string[]  // Для каких типов систем применим этот тип неисправности
}

export interface DefectTypeInput {
  name: string
  description?: string
  system_types?: string[]
}

export type SettingValue = string | number | boolean | string[]

export interface SystemSetting {
  key: string
  value: SettingValue
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

export interface PublicLoginBranding {
  appName: string
  productLabel: string
  headline: string
  description: string
  organizationName?: string | null
  supportEmail?: string | null
  supportPhone?: string | null
  supportHours: string
}

export interface PortalInterfaceSettings {
  enable_resizable_columns: boolean
  compact_table_view: boolean
  tasks_per_page: number
  auto_refresh_interval: number
  default_task_priority: TaskPriority
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
  async updateSetting(key: string, value: SettingValue): Promise<SystemSetting> {
    const { data } = await apiClient.patch<SystemSetting>(`/admin/settings/${key}`, { value })
    return data
  },

  // Получить типы неисправностей
  async getDefectTypes(): Promise<DefectType[]> {
    const { data } = await apiClient.get<DefectType[]>('/admin/settings/defect-types')
    return data
  },

  async getPublicLoginBranding(): Promise<PublicLoginBranding> {
    const { data } = await apiClient.get<PublicLoginBranding>('/public/login-branding')
    return data
  },

  async getPortalInterfaceSettings(): Promise<PortalInterfaceSettings> {
    const { data } = await apiClient.get<PortalInterfaceSettings>('/admin/settings/interface')
    return data
  },

  // Добавить тип неисправности
  async addDefectType(payload: DefectTypeInput): Promise<DefectType> {
    const { data } = await apiClient.post<DefectType>('/admin/settings/defect-types', payload)
    return data
  },

  // Обновить тип неисправности
  async updateDefectType(id: string, payload: DefectTypeInput): Promise<DefectType> {
    const { data } = await apiClient.patch<DefectType>(`/admin/settings/defect-types/${id}`, payload)
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
  publicLoginBranding: ['public-login-branding'],
  portalInterfaceSettings: ['portal-interface-settings'],
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
    mutationFn: ({ key, value }: { key: string; value: SettingValue }) =>
      settingsApi.updateSetting(key, value),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      queryClient.invalidateQueries({ queryKey: queryKeys.setting(data.key) })
      if (data.group === 'interface') {
        queryClient.invalidateQueries({ queryKey: queryKeys.portalInterfaceSettings })
      }
      if (data.group === 'branding') {
        queryClient.invalidateQueries({ queryKey: queryKeys.publicLoginBranding })
      }
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
    mutationFn: (payload: DefectTypeInput) => settingsApi.addDefectType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.defectTypes })
    },
  })
}

export function useUpdateDefectType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DefectTypeInput }) =>
      settingsApi.updateDefectType(id, payload),
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

export function usePublicLoginBranding() {
  return useQuery({
    queryKey: queryKeys.publicLoginBranding,
    queryFn: () => settingsApi.getPublicLoginBranding(),
    staleTime: 300000,
  })
}

export function usePortalInterfaceSettings() {
  return useQuery({
    queryKey: queryKeys.portalInterfaceSettings,
    queryFn: () => settingsApi.getPortalInterfaceSettings(),
    staleTime: 300000,
    retry: false,
  })
}

// ============================================
// Telegram Bot Settings
// ============================================

export interface TelegramGroupMapping {
  group_name: string
  username: string
}

export interface TelegramKnownGroup {
  chat_id: number
  title: string
  last_seen?: string
}

export interface TelegramBotSettings {
  enabled: boolean
  group_worker_map: TelegramGroupMapping[]
  dedup_enabled: boolean
  known_groups?: TelegramKnownGroup[]
}

export const telegramBotApi = {
  async getSettings(): Promise<TelegramBotSettings> {
    const { data } = await apiClient.get<TelegramBotSettings>('/admin/telegram-bot')
    return data
  },

  async updateSettings(settings: TelegramBotSettings): Promise<void> {
    await apiClient.patch('/admin/telegram-bot', settings)
  },
}

const telegramBotKeys = {
  settings: ['telegram-bot-settings'] as const,
}

export function useTelegramBotSettings() {
  return useQuery({
    queryKey: telegramBotKeys.settings,
    queryFn: () => telegramBotApi.getSettings(),
    staleTime: 300000,
  })
}

export function useUpdateTelegramBotSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: TelegramBotSettings) => telegramBotApi.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: telegramBotKeys.settings })
    },
  })
}

// ============================================
// Custom Fields
// ============================================

export type CustomField = components['schemas']['CustomFieldResponse']
export type CustomFieldCreateData = components['schemas']['CustomFieldCreate']
export type CustomFieldUpdateData = components['schemas']['CustomFieldUpdate']

export const customFieldsApi = {
  async list(): Promise<CustomField[]> {
    const { data } = await apiClient.get<CustomField[]>('/admin/custom-fields')
    return data
  },

  async create(payload: CustomFieldCreateData): Promise<CustomField> {
    const { data } = await apiClient.post<CustomField>('/admin/custom-fields', payload)
    return data
  },

  async update(id: number, payload: CustomFieldUpdateData): Promise<CustomField> {
    const { data } = await apiClient.patch<CustomField>(`/admin/custom-fields/${id}`, payload)
    return data
  },

  async remove(id: number): Promise<void> {
    await apiClient.delete(`/admin/custom-fields/${id}`)
  },

  async toggle(id: number): Promise<void> {
    await apiClient.patch(`/admin/custom-fields/${id}/toggle`)
  },
}

const customFieldKeys = {
  all: ['custom-fields'] as const,
}

export function useCustomFields() {
  return useQuery({
    queryKey: customFieldKeys.all,
    queryFn: () => customFieldsApi.list(),
    staleTime: 300000,
  })
}

export function useCreateCustomField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CustomFieldCreateData) => customFieldsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldKeys.all }),
  })
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CustomFieldUpdateData }) =>
      customFieldsApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldKeys.all }),
  })
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => customFieldsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldKeys.all }),
  })
}

export function useToggleCustomField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => customFieldsApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldKeys.all }),
  })
}

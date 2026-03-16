import apiClient from './client'

export interface AppUpdate {
  version_name: string
  version_code: number
  release_notes: string
  is_mandatory: boolean
  file_size: number | null
  download_url: string
  created_at: string
}

export const updatesApi = {
  /** Получить историю обновлений */
  history: async (): Promise<AppUpdate[]> => {
    const { data } = await apiClient.get<AppUpdate[]>('/updates/history')
    return data
  },

  /** Загрузить новый APK */
  upload: async (formData: FormData): Promise<AppUpdate> => {
    const { data } = await apiClient.post<AppUpdate>('/updates/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /** Удалить версию */
  delete: async (versionCode: number): Promise<void> => {
    await apiClient.delete(`/updates/${versionCode}`)
  },
}

import apiClient from './client'
import type { components } from '@/types/api.generated'

// Типы — из OpenAPI сервера (`npm run gen:api`).
export type Act = components['schemas']['ActResponse']
export type ActLine = components['schemas']['ActLineResponse']
export type ActCreate = components['schemas']['ActCreate']
export type ActLineInput = components['schemas']['ActLineInput']
export type ActList = components['schemas']['ActListResponse']
export type ActStatus = Act['status']
export type CatalogItem = components['schemas']['CatalogItemResponse']
export type CatalogItemCreate = components['schemas']['CatalogItemCreate']
export type CatalogItemUpdate = components['schemas']['CatalogItemUpdate']

export interface ActListParams {
  status?: ActStatus[]
  search?: string
  date_from?: string
  date_to?: string
  page?: number
  size?: number
}

/** Открыть файл с авторизацией в новой вкладке (Bearer не пройдёт через обычную ссылку). */
async function openBlob(path: string): Promise<void> {
  // Окно открываем сразу, до запроса: иначе браузер сочтёт его всплывающим.
  const target = window.open('', '_blank')
  try {
    const { data } = await apiClient.get<Blob>(path, { responseType: 'blob' })
    const url = URL.createObjectURL(data)
    if (target) target.location.href = url
    else window.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    target?.close()
    throw error
  }
}

export const actsApi = {
  async listCatalog(includeInactive = false): Promise<CatalogItem[]> {
    const { data } = await apiClient.get<CatalogItem[]>('/service-catalog', {
      params: { include_inactive: includeInactive },
    })
    return data
  },

  async createCatalogItem(item: CatalogItemCreate): Promise<CatalogItem> {
    const { data } = await apiClient.post<CatalogItem>('/service-catalog', item)
    return data
  },

  async updateCatalogItem(id: number, item: CatalogItemUpdate): Promise<CatalogItem> {
    const { data } = await apiClient.patch<CatalogItem>(`/service-catalog/${id}`, item)
    return data
  },

  async deleteCatalogItem(id: number): Promise<void> {
    await apiClient.delete(`/service-catalog/${id}`)
  },

  async listTaskActs(taskId: number): Promise<Act[]> {
    const { data } = await apiClient.get<Act[]>(`/tasks/${taskId}/acts`)
    return data
  },

  async createAct(taskId: number, act: ActCreate): Promise<Act> {
    const { data } = await apiClient.post<Act>(`/tasks/${taskId}/acts`, act)
    return data
  },

  async listActs(params: ActListParams): Promise<ActList> {
    const query = new URLSearchParams()
    params.status?.forEach((status) => query.append('status', status))
    if (params.search) query.set('search', params.search)
    if (params.date_from) query.set('date_from', params.date_from)
    if (params.date_to) query.set('date_to', params.date_to)
    query.set('page', String(params.page ?? 1))
    query.set('size', String(params.size ?? 50))
    const { data } = await apiClient.get<ActList>(`/acts?${query}`)
    return data
  },

  async cancelAct(id: number, reason: string): Promise<Act> {
    const { data } = await apiClient.post<Act>(`/acts/${id}/cancel`, { reason })
    return data
  },

  async uploadScan(id: number, file: File): Promise<Act> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.post<Act>(`/acts/${id}/scan`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  openPdf: (id: number) => openBlob(`/acts/${id}/pdf`),
  openScan: (id: number) => openBlob(`/acts/${id}/scan`),
}

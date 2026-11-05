import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { components } from '@/types/api.generated'

// Кабинет клиента — отдельная сессия и отдельный HTTP-клиент: токен кабинета
// не принимается API сотрудников, а 401 здесь не трогает вход сотрудника.
export type CabinetMe = components['schemas']['ClientMe']
export type CabinetObject = components['schemas']['ClientObject']
export type CabinetTask = components['schemas']['ClientTaskItem']
export type CabinetTaskDetail = components['schemas']['ClientTaskDetail']
export type CabinetTaskPage = components['schemas']['ClientTaskPage']
export type CabinetTaskCreate = components['schemas']['ClientTaskCreate']
export type CabinetAct = components['schemas']['ClientAct']
export type CabinetActPage = components['schemas']['ClientActPage']
export type CabinetMaintenance = components['schemas']['ClientMaintenance']
type CabinetToken = components['schemas']['ClientToken']

interface CabinetSession {
  token: string | null
  me: CabinetMe | null
  setSession: (token: string, me: CabinetMe) => void
  logout: () => void
}

export const useCabinetSession = create<CabinetSession>()(
  persist(
    (set) => ({
      token: null,
      me: null,
      setSession: (token, me) => set({ token, me }),
      logout: () => set({ token: null, me: null }),
    }),
    { name: 'fieldworker-cabinet' },
  ),
)

const http = axios.create({ baseURL: '/api/client' })

http.interceptors.request.use((config) => {
  const token = useCabinetSession.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    // Токен истёк, пароль сброшен или вход отключён — на страницу входа
    if (error.response?.status === 401 && error.config?.url !== '/auth/login') {
      useCabinetSession.getState().logout()
    }
    return Promise.reject(error)
  },
)

export interface TaskFilters {
  status: 'open' | 'done' | 'all'
  address_id?: number
  search?: string
  limit?: number
  offset?: number
}

export const cabinetApi = {
  async login(login: string, password: string): Promise<CabinetToken> {
    const { data } = await http.post<CabinetToken>('/auth/login', { login: login.trim(), password })
    return data
  },
  me: async () => (await http.get<CabinetMe>('/me')).data,
  changePassword: async (current_password: string, new_password: string) =>
    http.post('/auth/password', { current_password, new_password }),
  objects: async () => (await http.get<CabinetObject[]>('/objects')).data,
  tasks: async (filters: TaskFilters) => (await http.get<CabinetTaskPage>('/tasks', { params: filters })).data,
  task: async (id: number) => (await http.get<CabinetTaskDetail>(`/tasks/${id}`)).data,
  createTask: async (body: CabinetTaskCreate) => (await http.post<CabinetTaskDetail>('/tasks', body)).data,
  acts: async (params: { kind?: 'task' | 'summary'; pending?: boolean; limit?: number; offset?: number }) =>
    (await http.get<CabinetActPage>('/acts', { params })).data,
  maintenance: async () => (await http.get<CabinetMaintenance[]>('/maintenance')).data,
  async downloadActPdf(act: Pick<CabinetAct, 'id' | 'number'>) {
    const { data } = await http.get<Blob>(`/acts/${act.id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Акт ${act.number}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
  async signAct(id: number, png: Blob, strokes: number[][][]) {
    const form = new FormData()
    form.append('signature', png, 'signature.png')
    form.append('consent', 'true')
    form.append('strokes', JSON.stringify(strokes))
    const { data } = await http.post<CabinetAct>(`/acts/${id}/sign`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}

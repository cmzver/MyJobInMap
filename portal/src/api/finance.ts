import apiClient from './client'

export interface FinanceStats {
  completed_tasks: number
  paid_tasks: number
  remote_tasks: number
  total_amount: number
}

export interface WorkerStats {
  user_id: number
  user_name: string
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  paid_tasks: number
  remote_tasks: number
  total_earned: number
}

export const financeApi = {
  getStats: async (period?: 'all' | 'month' | 'week', userId?: number): Promise<FinanceStats> => {
    const params = new URLSearchParams()
    if (period && period !== 'all') params.append('period', period)
    if (userId) params.append('user_id', userId.toString())
    const { data } = await apiClient.get<FinanceStats>(`/finance/stats?${params}`)
    return data
  },

  getWorkerStats: async (period?: 'all' | 'month' | 'week'): Promise<WorkerStats[]> => {
    const params = new URLSearchParams()
    if (period && period !== 'all') params.append('period', period)
    const { data } = await apiClient.get<WorkerStats[]>(`/finance/workers?${params}`)
    return data
  },
}

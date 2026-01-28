import { useQuery } from '@tanstack/react-query'
import { financeApi } from '@/api/finance'

export function useFinanceStats(period?: 'all' | 'month' | 'week', userId?: number) {
  return useQuery({
    queryKey: ['financeStats', period, userId],
    queryFn: () => financeApi.getStats(period, userId),
    staleTime: 60000,
  })
}

export function useWorkerStats(period?: 'all' | 'month' | 'week') {
  return useQuery({
    queryKey: ['workerStats', period],
    queryFn: () => financeApi.getWorkerStats(period),
    staleTime: 60000,
  })
}

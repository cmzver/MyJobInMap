/**
 * React Query hook for SLA API
 */

import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { SlaData, SlaFilters } from '@/types/sla'

export function useSla(filters: SlaFilters) {
  return useQuery({
    queryKey: ['sla', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('period', filters.period)

      if (filters.date_from) {
        params.append('date_from', filters.date_from)
      }
      if (filters.date_to) {
        params.append('date_to', filters.date_to)
      }

      const response = await apiClient.get<SlaData>(`/sla?${params}`)
      return response.data
    },
    staleTime: 60000, // 1 min
  })
}

export function downloadExcel(filters: SlaFilters) {
  const params = new URLSearchParams()
  params.append('period', filters.period)

  if (filters.date_from) {
    params.append('date_from', filters.date_from)
  }
  if (filters.date_to) {
    params.append('date_to', filters.date_to)
  }

  const url = `/reports/export/excel?${params}`

  apiClient
    .get(url, { responseType: 'blob' })
    .then((response) => {
      const blobUrl = window.URL.createObjectURL(response.data as Blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `tasks_${filters.period}_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    })
    .catch((err) => {
      if (import.meta.env.DEV) console.error('Excel download failed:', err)
    })
}

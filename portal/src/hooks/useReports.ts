/**
 * React Query hook for Reports API
 */

import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { ReportsData, ReportsFilters } from '@/types/reports'

export function useReports(filters: ReportsFilters) {
  return useQuery({
    queryKey: ['reports', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('period', filters.period)
      
      if (filters.date_from) {
        params.append('date_from', filters.date_from)
      }
      if (filters.date_to) {
        params.append('date_to', filters.date_to)
      }
      if (filters.worker_id) {
        params.append('worker_id', String(filters.worker_id))
      }
      
      const response = await apiClient.get<ReportsData>(`/reports?${params}`)
      return response.data
    },
    staleTime: 60000, // 1 minute
  })
}

export function downloadReport(filters: ReportsFilters) {
  const params = new URLSearchParams()
  params.append('period', filters.period)
  
  if (filters.date_from) {
    params.append('date_from', filters.date_from)
  }
  if (filters.date_to) {
    params.append('date_to', filters.date_to)
  }
  
  const token = localStorage.getItem('token')
  const url = `/reports/export?${params}`
  
  // Создаем временную ссылку для скачивания
  const a = document.createElement('a')
  a.href = `${import.meta.env.VITE_API_URL || 'http://localhost:8001'}${url}`
  a.download = `report_${filters.period}_${new Date().toISOString().split('T')[0]}.csv`
  
  // Добавляем токен в заголовки через fetch
  fetch(a.href, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
    .then(response => response.blob())
    .then(blob => {
      const blobUrl = window.URL.createObjectURL(blob)
      a.href = blobUrl
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    })
    .catch(err => {
      console.error('Download failed:', err)
    })
}

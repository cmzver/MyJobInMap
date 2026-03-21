import { useQuery } from '@tanstack/react-query'

import apiClient from '@/api/client'
import type { AnalyticsData, AnalyticsFilters } from '@/types/analytics'

type NormalizedAnalyticsFilters = {
  period: AnalyticsFilters['period']
  date_from: string | null
  date_to: string | null
  worker_id: number | null
}

function normalizeFilters(filters: AnalyticsFilters): NormalizedAnalyticsFilters {
  return {
    period: filters.period,
    date_from: filters.date_from ?? null,
    date_to: filters.date_to ?? null,
    worker_id: filters.worker_id ?? null,
  }
}

export function buildAnalyticsParams(filters: AnalyticsFilters): URLSearchParams {
  return buildParams(normalizeFilters(filters))
}

function buildParams(filters: NormalizedAnalyticsFilters): URLSearchParams {
  const params = new URLSearchParams()

  params.append('period', filters.period)

  if (filters.date_from) {
    params.append('date_from', filters.date_from)
  }
  if (filters.date_to) {
    params.append('date_to', filters.date_to)
  }
  if (filters.worker_id !== null) {
    params.append('worker_id', String(filters.worker_id))
  }

  return params
}

export function analyticsQueryOptions(filters: AnalyticsFilters) {
  const normalized = normalizeFilters(filters)

  return {
    queryKey: ['analytics', normalized] as const,
    queryFn: async () => {
      const params = buildParams(normalized)
      const response = await apiClient.get<AnalyticsData>(`/analytics?${params}`)
      return response.data
    },
    staleTime: 60000,
  }
}

export function useAnalytics(filters: AnalyticsFilters) {
  return useQuery(analyticsQueryOptions(filters))
}

export async function downloadAnalyticsReport(filters: AnalyticsFilters) {
  const params = buildAnalyticsParams(filters)
  const response = await apiClient.get(`/analytics/export?${params}`, {
    responseType: 'blob',
  })

  const blob = response.data as Blob
  const blobUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `analytics_report_${new Date().toISOString().split('T')[0]}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(blobUrl)
}

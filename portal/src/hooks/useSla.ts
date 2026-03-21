/**
 * React Query hook for SLA API
 */

import { useQuery } from '@tanstack/react-query'
import { analyticsQueryOptions, downloadAnalyticsReport } from '@/hooks/useAnalytics'
import type { AnalyticsData } from '@/types/analytics'
import type { SlaData, SlaFilters } from '@/types/sla'

export function useSla(filters: SlaFilters) {
  return useQuery<AnalyticsData, Error, SlaData>({
    ...analyticsQueryOptions(filters),
    select: (data) => data.sla,
  })
}

export function downloadExcel(filters: SlaFilters) {
  return downloadAnalyticsReport(filters)
}

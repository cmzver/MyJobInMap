/**
 * React Query hook for Reports API
 */

import { useQuery } from '@tanstack/react-query'
import { analyticsQueryOptions, downloadAnalyticsReport } from '@/hooks/useAnalytics'
import type { AnalyticsData } from '@/types/analytics'
import type { ReportsData, ReportsFilters } from '@/types/reports'

export function useReports(filters: ReportsFilters) {
  return useQuery<AnalyticsData, Error, ReportsData>({
    ...analyticsQueryOptions(filters),
    select: (data) => data.reports,
  })
}

export function downloadReport(filters: ReportsFilters) {
  return downloadAnalyticsReport(filters)
}

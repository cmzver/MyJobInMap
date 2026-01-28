import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'

export interface PermissionsResponse {
  role: string
  permissions: Record<string, boolean>
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions', 'me'],
    queryFn: async () => {
      const response = await apiClient.get<PermissionsResponse>('/auth/permissions')
      return response.data
    },
    staleTime: 300000,
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { organizationSettingsApi } from '@/api/organizationSettings'
import type { OrganizationSettingsUpdate } from '@/api/organizationSettings'

export const organizationSettingsKeys = {
  detail: (organizationId?: number) => ['organization-settings', organizationId ?? null] as const,
}

export function useOrganizationSettings(organizationId?: number, enabled = true) {
  return useQuery({
    queryKey: organizationSettingsKeys.detail(organizationId),
    queryFn: () => organizationSettingsApi.get(organizationId),
    enabled,
  })
}

export function useSaveOrganizationSettings(organizationId?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: OrganizationSettingsUpdate) =>
      organizationSettingsApi.save(payload, organizationId),
    onSuccess: (data) => {
      queryClient.setQueryData(organizationSettingsKeys.detail(organizationId), data)
    },
  })
}

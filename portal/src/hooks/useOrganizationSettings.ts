import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { organizationSettingsApi } from '@/api/organizationSettings'
import type { OrganizationSettings, OrganizationSettingsUpdate } from '@/api/organizationSettings'

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

/** Логотип бланка акта: загрузка и удаление сразу обновляют настройки. */
export function useActLogo(organizationId?: number) {
  const queryClient = useQueryClient()
  const onSuccess = (data: OrganizationSettings) => {
    queryClient.setQueryData(organizationSettingsKeys.detail(organizationId), data)
    queryClient.invalidateQueries({ queryKey: ['organization-logo', organizationId ?? null] })
  }
  return {
    upload: useMutation({
      mutationFn: (file: File) => organizationSettingsApi.uploadLogo(file, organizationId),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: () => organizationSettingsApi.deleteLogo(organizationId),
      onSuccess,
    }),
  }
}

/** Картинка логотипа (blob: URL) — Bearer не пройдёт через обычный <img src>. */
export function useActLogoUrl(organizationId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['organization-logo', organizationId ?? null],
    queryFn: async () => URL.createObjectURL(await organizationSettingsApi.getLogo(organizationId)),
    enabled,
    staleTime: Infinity,
  })
}


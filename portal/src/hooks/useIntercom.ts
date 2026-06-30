/**
 * React Query хуки для «живых» действий с сетевой панелью:
 * статус замка, открыть/закрыть, код записи ключей.
 * Снимок (видео) тянется напрямую в компоненте (object URL + опрос).
 *
 * Все запросы — строго on-demand (по действию пользователя), без фонового опроса.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { intercomApi } from '@/api/intercom'
import type { PanelLockStatus, PanelMifareScanCode } from '@/types/address'

const intercomKeys = {
  lock: (panelId: number) => ['intercom', 'lock', panelId] as const,
  scan: (panelId: number) => ['intercom', 'scan', panelId] as const,
}

// Статус замка — по запросу (enabled управляется компонентом).
export function useLockStatus(addressId: number, panelId: number, enabled = false) {
  return useQuery<PanelLockStatus>({
    queryKey: intercomKeys.lock(panelId),
    queryFn: () => intercomApi.getLockStatus(addressId, panelId),
    enabled: enabled && panelId > 0,
    staleTime: 0,
    retry: false,
  })
}

// Код «Сканировать по коду» — по запросу.
export function useMifareScanCode(
  addressId: number,
  panelId: number,
  enabled = false,
) {
  return useQuery<PanelMifareScanCode>({
    queryKey: intercomKeys.scan(panelId),
    queryFn: () => intercomApi.getMifareScanCode(addressId, panelId),
    enabled: enabled && panelId > 0,
    staleTime: 0,
    retry: false,
  })
}

export function useOpenDoor(addressId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (panelId: number) => intercomApi.openDoor(addressId, panelId),
    onSuccess: (_data, panelId) => {
      queryClient.invalidateQueries({ queryKey: intercomKeys.lock(panelId) })
    },
  })
}

export function useCloseDoor(addressId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (panelId: number) => intercomApi.closeDoor(addressId, panelId),
    onSuccess: (_data, panelId) => {
      queryClient.invalidateQueries({ queryKey: intercomKeys.lock(panelId) })
    },
  })
}

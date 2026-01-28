import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '@/api/devices'

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
    staleTime: 30000,
  })
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: (userId?: number) => devicesApi.sendTestNotification(userId),
  })
}

export function useDeleteDevice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => devicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })
}

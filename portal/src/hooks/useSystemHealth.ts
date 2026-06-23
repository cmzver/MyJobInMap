import { useQuery } from '@tanstack/react-query'
import { systemApi } from '@/api/system'

// Состояние сервера для панели супер-админа. Автообновление каждые 10с.
export function useSystemHealth(enabled = true) {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => systemApi.getHealth(),
    enabled,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  })
}

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

// Логи выбранного контейнера. Включается только когда контейнер выбран.
export function useContainerLogs(name: string | null, tail = 200) {
  return useQuery({
    queryKey: ['container-logs', name, tail],
    queryFn: () => systemApi.getContainerLogs(name as string, tail),
    enabled: !!name,
    refetchInterval: 5_000,
  })
}

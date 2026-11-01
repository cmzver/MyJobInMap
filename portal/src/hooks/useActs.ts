import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  actsApi,
  type Act,
  type ActCreate,
  type ActListParams,
  type CatalogItemCreate,
  type CatalogItemUpdate,
} from '@/api/acts'
import { commentKeys } from '@/hooks/useComments'

export const actKeys = {
  all: ['acts'] as const,
  task: (taskId: number) => [...actKeys.all, 'task', taskId] as const,
  list: (params: ActListParams) => [...actKeys.all, 'list', params] as const,
  catalog: (includeInactive: boolean) => ['service-catalog', includeInactive] as const,
}

export function useServiceCatalog(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: actKeys.catalog(includeInactive),
    queryFn: () => actsApi.listCatalog(includeInactive),
    staleTime: 60_000,
    enabled,
  })
}

export function useCatalogMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['service-catalog'] })
  return {
    create: useMutation({
      mutationFn: (item: CatalogItemCreate) => actsApi.createCatalogItem(item),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, item }: { id: number; item: CatalogItemUpdate }) =>
        actsApi.updateCatalogItem(id, item),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => actsApi.deleteCatalogItem(id),
      onSuccess: refresh,
    }),
  }
}

export function useTaskActs(taskId: number, enabled = true) {
  return useQuery({
    queryKey: actKeys.task(taskId),
    queryFn: () => actsApi.listTaskActs(taskId),
    enabled: enabled && taskId > 0,
  })
}

export function useActs(params: ActListParams) {
  return useQuery({
    queryKey: actKeys.list(params),
    queryFn: () => actsApi.listActs(params),
  })
}

/** После любой операции с актом — обновить акты, реестр и историю заявки. */
function useActRefresh() {
  const queryClient = useQueryClient()
  return (act: Act) => {
    queryClient.invalidateQueries({ queryKey: actKeys.all })
    if (act.task_id) {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(act.task_id) })
    }
  }
}

export function useCreateAct(taskId: number) {
  const refresh = useActRefresh()
  return useMutation({
    mutationFn: (act: ActCreate) => actsApi.createAct(taskId, act),
    onSuccess: refresh,
  })
}

export function useCancelAct() {
  const refresh = useActRefresh()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => actsApi.cancelAct(id, reason),
    onSuccess: refresh,
  })
}

export function useUploadActScan() {
  const refresh = useActRefresh()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => actsApi.uploadScan(id, file),
    onSuccess: refresh,
  })
}

/** Выдать клиенту ссылку на акт. В списке обновится срок действия ссылки. */
export function useCreatePublicLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => actsApi.createPublicLink(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: actKeys.all }),
  })
}

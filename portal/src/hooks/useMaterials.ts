import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { materialsApi, type MaterialCreate, type MaterialOperation, type MaterialUpdate, type MovementFilters } from '@/api/materials'
import { useAuthStore } from '@/store/authStore'

/** Ключи склада: всё под ['materials', org] — одна инвалидация после операции. */
function useMaterialsKey() {
  const organizationId = useAuthStore((state) => state.user?.organizationId)
  return ['materials', organizationId] as const
}

export function useMaterialCatalog(includeArchived = false) {
  const key = useMaterialsKey()
  return useQuery({
    queryKey: [...key, 'catalog', includeArchived],
    queryFn: () => materialsApi.list(includeArchived),
  })
}

export function useStocks(userId?: number, enabled = true) {
  const key = useMaterialsKey()
  return useQuery({
    queryKey: [...key, 'stock', userId ?? 'me'],
    queryFn: () => materialsApi.stocks(userId),
    enabled,
  })
}

export function useMaterialBalances(enabled = true) {
  const key = useMaterialsKey()
  return useQuery({ queryKey: [...key, 'balances'], queryFn: materialsApi.balances, enabled })
}

export function useMaterialMovements(filters: MovementFilters, enabled = true) {
  const key = useMaterialsKey()
  return useQuery({
    queryKey: [...key, 'movements', filters],
    queryFn: () => materialsApi.movements(filters),
    enabled,
    placeholderData: (previous) => previous,
  })
}

export function useMaterialTurnover(month: string, enabled = true) {
  const key = useMaterialsKey()
  return useQuery({
    queryKey: [...key, 'turnover', month],
    queryFn: () => materialsApi.turnover(month),
    enabled,
  })
}

export function useMaterialMutations() {
  const client = useQueryClient()
  const key = useMaterialsKey()
  const invalidate = () => client.invalidateQueries({ queryKey: key })
  return {
    create: useMutation({ mutationFn: (data: MaterialCreate) => materialsApi.create(data), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: number; data: MaterialUpdate }) => materialsApi.update(id, data),
      onSuccess: invalidate,
    }),
    operate: useMutation({ mutationFn: (data: MaterialOperation) => materialsApi.operate(data), onSuccess: invalidate }),
  }
}

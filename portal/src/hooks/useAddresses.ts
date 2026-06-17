import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addressesApi } from '@/api/addresses'
import type { AddressFilters } from '@/types/address'
import { useAuthStore } from '@/store/authStore'

// Query keys
export const addressKeys = {
  all: (organizationId: number | null | undefined) => ['addresses', organizationId ?? 'no-org'] as const,
  lists: (organizationId: number | null | undefined) => [...addressKeys.all(organizationId), 'list'] as const,
  list: (organizationId: number | null | undefined, filters?: AddressFilters) => [...addressKeys.lists(organizationId), filters] as const,
  details: (organizationId: number | null | undefined) => [...addressKeys.all(organizationId), 'detail'] as const,
  detail: (organizationId: number | null | undefined, id: number) => [...addressKeys.details(organizationId), id] as const,
  search: (organizationId: number | null | undefined, query: string) => [...addressKeys.all(organizationId), 'search', query] as const,
}

// Получить список адресов
export function useAddresses(filters?: AddressFilters) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: addressKeys.list(organizationId, filters),
    queryFn: () => addressesApi.getAddresses(filters),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

// Поиск адресов для автокомплита
export function useAddressSearch(query: string, enabled = true) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: addressKeys.search(organizationId, query),
    queryFn: () => addressesApi.searchAddresses(query),
    enabled: enabled && query.length >= 2,
    staleTime: 0,
  })
}

// Создать адрес
export function useCreateAddress() {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useMutation({
    mutationFn: addressesApi.createAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressKeys.lists(organizationId) })
    },
  })
}

// Обновить адрес
export function useUpdateAddress() {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof addressesApi.updateAddress>[1] }) =>
      addressesApi.updateAddress(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: addressKeys.detail(organizationId, id) })
      queryClient.invalidateQueries({ queryKey: addressKeys.lists(organizationId) })
    },
  })
}

// Удалить адрес
export function useDeleteAddress() {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useMutation({
    mutationFn: addressesApi.deleteAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressKeys.lists(organizationId) })
    },
  })
}

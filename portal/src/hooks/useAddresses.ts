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

// Получить один адрес
export function useAddress(id: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: addressKeys.detail(organizationId, id),
    queryFn: () => addressesApi.getAddress(id),
    enabled: !!id,
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

// Деактивировать адрес
export function useDeactivateAddress() {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useMutation({
    mutationFn: addressesApi.deactivateAddress,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: addressKeys.detail(organizationId, id) })
      queryClient.invalidateQueries({ queryKey: addressKeys.lists(organizationId) })
    },
  })
}

// ============================================
// Автоподставление (Autocomplete) хуки
// ============================================

// Автокомплит городов
export function useAutocompleteCities(query: string, enabled = true) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: ['addresses', organizationId ?? 'no-org', 'autocomplete', 'cities', query],
    queryFn: () => addressesApi.autocompleteCities(query),
    enabled: enabled && query.length >= 1,
    staleTime: 0,
  })
}

// Автокомплит улиц
export function useAutocompleteStreets(query: string, city?: string, enabled = true) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: ['addresses', organizationId ?? 'no-org', 'autocomplete', 'streets', query, city],
    queryFn: () => addressesApi.autocompleteStreets(query, city),
    enabled: enabled && query.length >= 1,
    staleTime: 0,
  })
}

// Автокомплит домов
export function useAutocompleteBuildings(query: string, city?: string, street?: string, enabled = true) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: ['addresses', organizationId ?? 'no-org', 'autocomplete', 'buildings', query, city, street],
    queryFn: () => addressesApi.autocompleteBuildings(query, city, street),
    enabled: enabled && query.length >= 1,
    staleTime: 0,
  })
}

// Автокомплит полного адреса (для заявок)
export function useAutocompleteFullAddress(query: string, enabled = true) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery({
    queryKey: ['addresses', organizationId ?? 'no-org', 'autocomplete', 'full', query],
    queryFn: () => addressesApi.autocompleteFullAddress(query),
    enabled: enabled && query.length >= 2,
    staleTime: 0,
  })
}

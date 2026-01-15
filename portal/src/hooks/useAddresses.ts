import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addressesApi } from '@/api/addresses'
import type { AddressFilters } from '@/types/address'

// Query keys
export const addressKeys = {
  all: ['addresses'] as const,
  lists: () => [...addressKeys.all, 'list'] as const,
  list: (filters?: AddressFilters) => [...addressKeys.lists(), filters] as const,
  details: () => [...addressKeys.all, 'detail'] as const,
  detail: (id: number) => [...addressKeys.details(), id] as const,
  search: (query: string) => [...addressKeys.all, 'search', query] as const,
}

// Получить список адресов
export function useAddresses(filters?: AddressFilters) {
  return useQuery({
    queryKey: addressKeys.list(filters),
    queryFn: () => addressesApi.getAddresses(filters),
    staleTime: 1000 * 60 * 5, // 5 минут
  })
}

// Получить один адрес
export function useAddress(id: number) {
  return useQuery({
    queryKey: addressKeys.detail(id),
    queryFn: () => addressesApi.getAddress(id),
    enabled: !!id,
  })
}

// Поиск адресов для автокомплита
export function useAddressSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: addressKeys.search(query),
    queryFn: () => addressesApi.searchAddresses(query),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 60 * 2, // 2 минуты
  })
}

// Создать адрес
export function useCreateAddress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addressesApi.createAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressKeys.lists() })
    },
  })
}

// Обновить адрес
export function useUpdateAddress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof addressesApi.updateAddress>[1] }) =>
      addressesApi.updateAddress(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: addressKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: addressKeys.lists() })
    },
  })
}

// Удалить адрес
export function useDeleteAddress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addressesApi.deleteAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressKeys.lists() })
    },
  })
}

// Деактивировать адрес
export function useDeactivateAddress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addressesApi.deactivateAddress,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: addressKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: addressKeys.lists() })
    },
  })
}

// ============================================
// Автоподставление (Autocomplete) хуки
// ============================================

// Автокомплит городов
export function useAutocompleteCities(query: string, enabled = true) {
  return useQuery({
    queryKey: ['addresses', 'autocomplete', 'cities', query],
    queryFn: () => addressesApi.autocompleteCities(query),
    enabled: enabled && query.length >= 1,
    staleTime: 1000 * 60 * 5, // 5 минут
  })
}

// Автокомплит улиц
export function useAutocompleteStreets(query: string, city?: string, enabled = true) {
  return useQuery({
    queryKey: ['addresses', 'autocomplete', 'streets', query, city],
    queryFn: () => addressesApi.autocompleteStreets(query, city),
    enabled: enabled && query.length >= 1,
    staleTime: 1000 * 60 * 5, // 5 минут
  })
}

// Автокомплит домов
export function useAutocompleteBuildings(query: string, city?: string, street?: string, enabled = true) {
  return useQuery({
    queryKey: ['addresses', 'autocomplete', 'buildings', query, city, street],
    queryFn: () => addressesApi.autocompleteBuildings(query, city, street),
    enabled: enabled && query.length >= 1,
    staleTime: 1000 * 60 * 5, // 5 минут
  })
}

// Автокомплит полного адреса (для заявок)
export function useAutocompleteFullAddress(query: string, enabled = true) {
  return useQuery({
    queryKey: ['addresses', 'autocomplete', 'full', query],
    queryFn: () => addressesApi.autocompleteFullAddress(query),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 60 * 5, // 5 минут
  })
}

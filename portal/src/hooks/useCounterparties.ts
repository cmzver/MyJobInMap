import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  counterpartiesApi,
  type ClientAccountCreate,
  type ClientAccountUpdate,
  type CounterpartyCreate,
  type CounterpartyUpdate,
} from '@/api/counterparties'
import { actKeys } from '@/hooks/useActs'

export const counterpartyKeys = {
  all: ['counterparties'] as const,
  list: (includeInactive: boolean) => [...counterpartyKeys.all, 'list', includeInactive] as const,
  detail: (id: number) => [...counterpartyKeys.all, 'detail', id] as const,
  addresses: (id: number) => [...counterpartyKeys.all, 'addresses', id] as const,
  preview: (id: number, month: string) => [...counterpartyKeys.all, 'preview', id, month] as const,
  acts: (id: number) => [...counterpartyKeys.all, 'acts', id] as const,
  accounts: (id: number) => [...counterpartyKeys.all, 'accounts', id] as const,
}

export function useCounterparties(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: counterpartyKeys.list(includeInactive),
    queryFn: () => counterpartiesApi.list(includeInactive),
    enabled,
    staleTime: 60_000,
  })
}

export function useCounterparty(id: number) {
  return useQuery({
    queryKey: counterpartyKeys.detail(id),
    queryFn: () => counterpartiesApi.get(id),
    enabled: id > 0,
  })
}

export function useCounterpartyAddresses(id: number) {
  return useQuery({
    queryKey: counterpartyKeys.addresses(id),
    queryFn: () => counterpartiesApi.addresses(id),
    enabled: id > 0,
  })
}

export function useSummaryPreview(id: number, month: string) {
  return useQuery({
    queryKey: counterpartyKeys.preview(id, month),
    queryFn: () => counterpartiesApi.summaryPreview(id, month),
    enabled: id > 0 && /^\d{4}-\d{2}$/.test(month),
  })
}

export function useSummaryActs(id: number) {
  return useQuery({
    queryKey: counterpartyKeys.acts(id),
    queryFn: () => counterpartiesApi.summaryActs(id),
    enabled: id > 0,
  })
}

export function useCounterpartyMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: counterpartyKeys.all })
  return {
    create: useMutation({
      mutationFn: (body: CounterpartyCreate) => counterpartiesApi.create(body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: CounterpartyUpdate }) => counterpartiesApi.update(id, body),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => counterpartiesApi.remove(id),
      onSuccess: refresh,
    }),
    setAddresses: useMutation({
      mutationFn: ({ id, addressIds }: { id: number; addressIds: number[] }) =>
        counterpartiesApi.setAddresses(id, addressIds),
      // Строка «УК» в карточках объектов тоже поменялась
      onSuccess: () => {
        refresh()
        queryClient.invalidateQueries({ queryKey: ['addresses'] })
        queryClient.invalidateQueries({ queryKey: ['addressCard'] })
      },
    }),
    issue: useMutation({
      mutationFn: ({ id, month, supersedes }: { id: number; month: string; supersedes?: number | null }) =>
        counterpartiesApi.issueSummaryAct(id, month, supersedes),
      onSuccess: () => {
        refresh()
        queryClient.invalidateQueries({ queryKey: actKeys.all })
      },
    }),
  }
}

export function useClientAccounts(counterpartyId: number) {
  return useQuery({
    queryKey: counterpartyKeys.accounts(counterpartyId),
    queryFn: () => counterpartiesApi.accounts(counterpartyId),
  })
}

export function useClientAccountMutations(counterpartyId: number) {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: counterpartyKeys.accounts(counterpartyId) })
  return {
    create: useMutation({
      mutationFn: (body: ClientAccountCreate) => counterpartiesApi.createAccount(counterpartyId, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: ClientAccountUpdate }) =>
        counterpartiesApi.updateAccount(counterpartyId, id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => counterpartiesApi.deleteAccount(counterpartyId, id),
      onSuccess: invalidate,
    }),
  }
}

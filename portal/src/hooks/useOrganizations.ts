import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationsApi } from '@/api/organizations'
import type { CreateOrganizationData, UpdateOrganizationData, AssignUserData } from '@/types/organization'

export const orgKeys = {
  all: ['organizations'] as const,
  lists: () => [...orgKeys.all, 'list'] as const,
  list: (includeInactive?: boolean) => [...orgKeys.lists(), { includeInactive }] as const,
  details: () => [...orgKeys.all, 'detail'] as const,
  detail: (id: number) => [...orgKeys.details(), id] as const,
  users: (id: number) => [...orgKeys.all, 'users', id] as const,
}

export function useOrganizations(includeInactive = false) {
  return useQuery({
    queryKey: orgKeys.list(includeInactive),
    queryFn: () => organizationsApi.getOrganizations(includeInactive),
  })
}

export function useOrganization(id: number) {
  return useQuery({
    queryKey: orgKeys.detail(id),
    queryFn: () => organizationsApi.getOrganization(id),
    enabled: !!id,
  })
}

export function useOrganizationUsers(orgId: number) {
  return useQuery({
    queryKey: orgKeys.users(orgId),
    queryFn: () => organizationsApi.getOrganizationUsers(orgId),
    enabled: !!orgId,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateOrganizationData) => organizationsApi.createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
    },
  })
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateOrganizationData }) =>
      organizationsApi.updateOrganization(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
    },
  })
}

export function useDeactivateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => organizationsApi.deactivateOrganization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
    },
  })
}

export function useActivateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => organizationsApi.activateOrganization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
    },
  })
}

export function useAssignUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AssignUserData) => organizationsApi.assignUser(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
      queryClient.invalidateQueries({ queryKey: orgKeys.users(data.organization_id) })
    },
  })
}

export function useUnassignUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ orgId, userId }: { orgId: number; userId: number }) =>
      organizationsApi.unassignUser(orgId, userId),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
      queryClient.invalidateQueries({ queryKey: orgKeys.users(orgId) })
    },
  })
}

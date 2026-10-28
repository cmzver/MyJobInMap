import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { groupsApi } from '@/api/groups'
import type { CreateGroupData, UpdateGroupData } from '@/types/user'

export const groupKeys = {
  all: ['user-groups'] as const,
  list: (organizationId?: number) =>
    [...groupKeys.all, 'list', organizationId ?? null] as const,
}

// Список групп (встроенных и кастомных). organizationId задаёт скоуп для
// суперадмина (страница «Система»); орг-админ его опускает.
export function useGroups(organizationId?: number, enabled = true) {
  return useQuery({
    queryKey: groupKeys.list(organizationId),
    queryFn: () => groupsApi.getGroups(organizationId),
    enabled,
  })
}

export function useCreateGroup(organizationId?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateGroupData) => groupsApi.createGroup(data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
    },
  })
}

export function useUpdateGroup(organizationId?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: UpdateGroupData }) =>
      groupsApi.updateGroup(name, data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
    },
  })
}

export function useDeleteGroup(organizationId?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => groupsApi.deleteGroup(name, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all })
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
    },
  })
}

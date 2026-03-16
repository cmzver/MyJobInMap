import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { updatesApi } from '@/api/updates'

export function useUpdates() {
  return useQuery({
    queryKey: ['updates'],
    queryFn: updatesApi.history,
    staleTime: 30000,
  })
}

export function useUploadUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (formData: FormData) => updatesApi.upload(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
}

export function useDeleteUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionCode: number) => updatesApi.delete(versionCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
    },
  })
}

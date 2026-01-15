import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { photosApi } from '@/api/photos'

// Query keys
export const photoKeys = {
  all: ['photos'] as const,
  lists: () => [...photoKeys.all, 'list'] as const,
  list: (taskId: number) => [...photoKeys.lists(), taskId] as const,
}

// Get photos for a task
export function usePhotos(taskId: number) {
  return useQuery({
    queryKey: photoKeys.list(taskId),
    queryFn: () => photosApi.getPhotos(taskId),
    enabled: !!taskId,
  })
}

// Upload photo mutation
export function useUploadPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ 
      taskId, 
      file, 
      photoType 
    }: { 
      taskId: number
      file: File
      photoType?: 'before' | 'after' | 'completion'
    }) => photosApi.uploadPhoto(taskId, file, photoType),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: photoKeys.list(taskId) })
    },
  })
}

// Delete photo mutation
export function useDeletePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ photoId }: { photoId: number; taskId: number }) =>
      photosApi.deletePhoto(photoId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: photoKeys.list(variables.taskId) })
    },
  })
}

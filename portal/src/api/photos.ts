import apiClient from './client'
import type { TaskPhoto } from '@/types/task'

export const photosApi = {
  // Get photos for a task
  async getPhotos(taskId: number): Promise<TaskPhoto[]> {
    const { data } = await apiClient.get<TaskPhoto[]>(`/tasks/${taskId}/photos`)
    return data
  },

  // Upload photo to a task
  async uploadPhoto(
    taskId: number, 
    file: File, 
    photoType: 'before' | 'after' | 'completion' = 'before'
  ): Promise<TaskPhoto> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('photo_type', photoType)

    const { data } = await apiClient.post<TaskPhoto>(
      `/tasks/${taskId}/photos`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return data
  },

  // Delete a photo
  async deletePhoto(photoId: number): Promise<void> {
    await apiClient.delete(`/photos/${photoId}`)
  },

  // Get auth-protected photo URL as blob
  async getPhotoBlobUrl(filename: string): Promise<string> {
    const { data } = await apiClient.get(`/photos/${filename}`, {
      responseType: 'blob',
    })
    return URL.createObjectURL(data)
  },

  revokePhotoUrl(url: string): void {
    URL.revokeObjectURL(url)
  },
}

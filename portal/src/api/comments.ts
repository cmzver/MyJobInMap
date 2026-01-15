import apiClient from './client'
import type { Comment } from '@/types/task'

export interface CreateCommentData {
  text: string
}

export const commentsApi = {
  // Get comments for a task
  async getComments(taskId: number): Promise<Comment[]> {
    const { data } = await apiClient.get<Comment[]>(`/tasks/${taskId}/comments`)
    return data
  },

  // Add comment to a task
  async addComment(taskId: number, commentData: CreateCommentData): Promise<Comment> {
    const { data } = await apiClient.post<Comment>(`/tasks/${taskId}/comments`, commentData)
    return data
  },
}

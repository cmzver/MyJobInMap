import apiClient from './client'
import type { User, CreateUserData, UpdateUserData } from '@/types/user'

// Users API находится под /api/admin/users
const USERS_BASE = '/admin/users'

export const usersApi = {
  // Get all users
  async getUsers(): Promise<User[]> {
    const { data } = await apiClient.get<User[]>(USERS_BASE)
    return data
  },

  // Get single user
  async getUser(id: number): Promise<User> {
    const { data } = await apiClient.get<User>(`${USERS_BASE}/${id}`)
    return data
  },

  // Create user
  async createUser(userData: CreateUserData): Promise<User> {
    const { data } = await apiClient.post<User>(USERS_BASE, userData)
    return data
  },

  // Update user
  async updateUser(id: number, userData: UpdateUserData): Promise<User> {
    const { data } = await apiClient.put<User>(`${USERS_BASE}/${id}`, userData)
    return data
  },

  // Delete user
  async deleteUser(id: number): Promise<void> {
    await apiClient.delete(`${USERS_BASE}/${id}`)
  },
}

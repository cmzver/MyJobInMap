import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from '@/api/client'

export interface User {
  id: number
  username: string
  fullName: string
  full_name?: string
  email?: string
  phone?: string
  role: 'admin' | 'dispatcher' | 'worker'
}

interface LoginResponse {
  access_token: string
  user_id: number
  username: string
  full_name?: string | null
  role?: string | null
  detail?: string
}


interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User, token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              username: username.trim(),
              password: password.trim(),
            }),
          })

          const data: LoginResponse = await response.json()

          if (!response.ok) {
            throw new Error(data.detail || 'Ошибка входа')
          }

          const role =
            data.role === 'admin' || data.role === 'dispatcher' || data.role === 'worker'
              ? data.role
              : 'worker'

          set({
            user: {
              id: data.user_id,
              username: data.username,
              fullName: data.full_name || data.username,
              role,
            },
            token: data.access_token,
            isAuthenticated: true,
          })

          apiClient.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Ошибка входа'
          throw new Error(message)
        }
      },

      logout: () => {
        delete apiClient.defaults.headers.common['Authorization']
        set({ user: null, token: null, isAuthenticated: false })
      },

      setUser: (user: User, token: string) => {
        set({ user, token, isAuthenticated: true })
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
      },
    }),
    {
      name: 'fieldworker-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

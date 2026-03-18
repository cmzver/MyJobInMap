import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from '@/api/client'
import type { UserRole } from '@/types/user'

/** РџРѕРґРјРЅРѕР¶РµСЃС‚РІРѕ User, РґРѕСЃС‚СѓРїРЅРѕРµ РёР· JWT / login-РѕС‚РІРµС‚Р° */
export interface AuthUser {
  id: number
  username: string
  fullName: string
  full_name?: string
  email?: string
  phone?: string
  avatarUrl?: string | null
  role: UserRole
  organizationId?: number | null
  organizationName?: string | null
}

interface LoginResponse {
  access_token: string
  user_id: number
  username: string
  full_name?: string | null
  avatar_url?: string | null
  role?: string | null
  organization_id?: number | null
  organization_name?: string | null
  detail?: string
}


interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: AuthUser, token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          // FastAPI OAuth2PasswordRequestForm expects form-urlencoded
          const response = await apiClient.post<LoginResponse>(
            '/auth/login',
            new URLSearchParams({
              username: username.trim(),
              password: password.trim(),
            }),
            {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
          )

          const data = response.data

          const role =
            data.role === 'admin' || data.role === 'dispatcher' || data.role === 'worker'
              ? data.role
              : 'worker'

          set({
            user: {
              id: data.user_id,
              username: data.username,
              fullName: data.full_name || data.username,
              avatarUrl: data.avatar_url ?? null,
              role,
              organizationId: data.organization_id ?? null,
              organizationName: data.organization_name ?? null,
            },
            token: data.access_token,
            isAuthenticated: true,
          })
        } catch (error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const axiosError = error as any
          const message = axiosError?.response?.data?.detail || axiosError?.message || 'РћС€РёР±РєР° РІС…РѕРґР°'
          throw new Error(message)
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },

      setUser: (user: AuthUser, token: string) => {
        set({ user, token, isAuthenticated: true })
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

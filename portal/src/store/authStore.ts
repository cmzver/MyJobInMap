import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from '@/api/client'
import type { AccessRole, UserRole } from '@/types/user'
import { normalizeRoleForAccess } from '@/types/user'

/** Подмножество User, доступное из JWT / login-ответа */
export interface AuthUser {
  id: number
  username: string
  fullName: string
  full_name?: string
  email?: string
  phone?: string
  avatarUrl?: string | null
  role: UserRole
  /** Человекочитаемое название роли (label группы) для отображения. */
  roleLabel?: string
  /** Базовый уровень доступа (драйвит навигацию); для кастомных групп — с бэкенда. */
  baseAccess: AccessRole
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
  role_label?: string | null
  base_access?: string | null
  organization_id?: number | null
  organization_name?: string | null
  detail?: string
}

interface MeResponse {
  id: number
  username: string
  full_name?: string | null
  avatar_url?: string | null
  role?: string | null
  role_label?: string | null
  base_access?: string | null
  organization_id?: number | null
}


interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: AuthUser, token: string) => void
  refreshUser: () => Promise<void>
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

          // Роль сохраняем как есть (включая slug кастомной группы); уровень
          // доступа берём из base_access, иначе выводим из встроенной роли.
          const role: UserRole = data.role ?? 'worker'
          const baseAccess: AccessRole = normalizeRoleForAccess(data.role, data.base_access)

          set({
            user: {
              id: data.user_id,
              username: data.username,
              fullName: data.full_name || data.username,
              avatarUrl: data.avatar_url ?? null,
              role,
              roleLabel: data.role_label ?? undefined,
              baseAccess,
              organizationId: data.organization_id ?? null,
              organizationName: data.organization_name ?? null,
            },
            token: data.access_token,
            isAuthenticated: true,
          })
        } catch (error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const axiosError = error as any
          const message = axiosError?.response?.data?.detail || axiosError?.message || 'Ошибка входа'
          throw new Error(message)
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },

      setUser: (user: AuthUser, token: string) => {
        set({ user, token, isAuthenticated: true })
      },

      // Подтянуть актуальные роль/права/навигацию (например, после смены группы
      // администратором) без перелогина. organization_name в /me не приходит —
      // сохраняем уже имеющееся значение.
      refreshUser: async () => {
        const current = useAuthStore.getState().user
        const token = useAuthStore.getState().token
        if (!current || !token) return
        try {
          const { data } = await apiClient.get<MeResponse>('/auth/me')
          set({
            user: {
              ...current,
              id: data.id,
              username: data.username,
              fullName: data.full_name || current.fullName,
              avatarUrl: data.avatar_url ?? null,
              role: data.role ?? current.role,
              roleLabel: data.role_label ?? undefined,
              baseAccess: normalizeRoleForAccess(data.role, data.base_access),
              organizationId: data.organization_id ?? null,
            },
          })
        } catch {
          // молча игнорируем — не критично для текущей сессии
        }
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

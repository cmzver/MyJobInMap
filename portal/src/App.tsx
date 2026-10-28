import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Suspense, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { getHomePathForRole, isOrgAdmin } from '@/config/menuConfig'
import { portalRoutes } from '@/config/portalRoutes'
import { APP_BASENAME } from '@/config/appConfig'
import type { AccessRole } from '@/types/user'
import { normalizeRoleForAccess } from '@/types/user'
import ErrorBoundary from '@/components/ErrorBoundary'
import Spinner from '@/components/Spinner'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/layouts/DashboardLayout'

// Fallback компонент для загрузки
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Spinner size="lg" />
    </div>
  )
}

// Компонент защищённого роута с проверкой роли
function ProtectedRoute({
  children,
  allowedRoles,
  excludeOrgAdmin = false,
}: {
  children: React.ReactNode
  allowedRoles?: AccessRole[]
  excludeOrgAdmin?: boolean
}) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (
    allowedRoles &&
    user?.role &&
    !allowedRoles.includes(normalizeRoleForAccess(user.role, user.baseAccess))
  ) {
    return <Navigate to={getHomePathForRole(user.role, user.baseAccess)} replace />
  }

  if (excludeOrgAdmin && user?.role && isOrgAdmin(user.role, user.organizationId)) {
    return <Navigate to={getHomePathForRole(user.role, user.baseAccess)} replace />
  }

  return <>{children}</>
}

function App() {
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuthStore()
  const refreshUser = useAuthStore((state) => state.refreshUser)
  const homePath = user?.role ? getHomePathForRole(user.role, user.baseAccess) : '/login'
  const authScopeRef = useRef<string | null>(null)

  // На старте подтягиваем актуальную роль/права (мог измениться состав группы),
  // чтобы навигация и лейбл роли соответствовали серверу без перелогина.
  useEffect(() => {
    if (isAuthenticated) {
      void refreshUser()
    }
  }, [isAuthenticated, refreshUser])

  useEffect(() => {
    const authScope = isAuthenticated
      ? `${user?.id ?? 'anonymous'}:${user?.organizationId ?? 'no-org'}:${user?.role ?? 'no-role'}`
      : 'guest'

    if (authScopeRef.current === null) {
      authScopeRef.current = authScope
      return
    }

    if (authScopeRef.current !== authScope) {
      queryClient.clear()
      authScopeRef.current = authScope
    }
  }, [isAuthenticated, queryClient, user?.id, user?.organizationId, user?.role])

  return (
    <ErrorBoundary>
      <BrowserRouter basename={APP_BASENAME}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              iconTheme: {
                primary: '#4ade80',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to={homePath} replace /> : <LoginPage />}
          />

          {/* Protected routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route index element={<Navigate to={homePath} replace />} />
                      {portalRoutes.map((route) => (
                        <Route
                          key={route.id}
                          path={route.path}
                          element={
                            <ProtectedRoute
                              allowedRoles={route.roles}
                              excludeOrgAdmin={route.excludeOrgAdmin}
                            >
                              {route.redirectTo ? (
                                <Navigate to={route.redirectTo} replace />
                              ) : (
                                route.element
                              )}
                            </ProtectedRoute>
                          }
                        />
                      ))}
                    </Routes>
                  </Suspense>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App

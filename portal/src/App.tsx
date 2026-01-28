import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Suspense, lazy } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getHomePathForRole } from '@/config/menuConfig'
import { APP_BASENAME } from '@/config/appConfig'
import ErrorBoundary from '@/components/ErrorBoundary'
import Spinner from '@/components/Spinner'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/layouts/DashboardLayout'

// Lazy-loaded страницы для code splitting
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const MyTasksPage = lazy(() => import('@/pages/MyTasksPage'))
const TaskDetailPage = lazy(() => import('@/pages/TaskDetailPage'))
const TaskFormPage = lazy(() => import('@/pages/TaskFormPage'))
const MapPage = lazy(() => import('@/pages/MapPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const AddressesPage = lazy(() => import('@/pages/AddressesPage'))
const AddressDetailPage = lazy(() => import('@/pages/AddressDetailPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))
const FinancePage = lazy(() => import('@/pages/FinancePage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const AdminSettingsPage = lazy(() => import('@/pages/AdminSettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

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
  allowedRoles 
}: { 
  children: React.ReactNode
  allowedRoles?: ('admin' | 'dispatcher' | 'worker')[] 
}) {
  const { isAuthenticated, user } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to={getHomePathForRole(user.role)} replace />
  }
  
  return <>{children}</>
}

function App() {
  const { isAuthenticated, user } = useAuthStore()
  const homePath = user?.role ? getHomePathForRole(user.role) : '/login'

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
                      {/* Redirect to home */}
                      <Route index element={<Navigate to={homePath} replace />} />
                      
                      {/* Dashboard - Admin & Dispatcher */}
                      <Route 
                        path="dashboard" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <DashboardPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* My Tasks - Worker */}
                      <Route 
                        path="my-tasks" 
                        element={
                          <ProtectedRoute allowedRoles={['worker']}>
                            <MyTasksPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* All Tasks - Admin & Dispatcher */}
                      <Route 
                        path="tasks" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <TasksPage />
                          </ProtectedRoute>
                        } 
                      />
                      <Route 
                        path="tasks/new" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <TaskFormPage mode="create" />
                          </ProtectedRoute>
                        } 
                      />
                      <Route path="tasks/:id" element={<TaskDetailPage />} />
                      <Route 
                        path="tasks/:id/edit" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <TaskFormPage mode="edit" />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* Map - All roles */}
                      <Route path="map" element={<MapPage />} />
                      
                      {/* Calendar - All roles */}
                      <Route path="calendar" element={<CalendarPage />} />
                      
                      {/* Addresses - Admin & Dispatcher */}
                      <Route 
                        path="addresses" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <AddressesPage />
                          </ProtectedRoute>
                        } 
                      />
                      <Route 
                        path="addresses/:id" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <AddressDetailPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* Users - Admin only */}
                      <Route 
                        path="users" 
                        element={
                          <ProtectedRoute allowedRoles={['admin']}>
                            <UsersPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* Finance - Admin only */}
                      <Route 
                        path="finance" 
                        element={
                          <ProtectedRoute allowedRoles={['admin']}>
                            <FinancePage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* Devices - Redirect to Settings */}
                      <Route 
                        path="devices" 
                        element={<Navigate to="/settings" replace />}
                      />
                      
                      {/* Reports - Admin & Dispatcher */}
                      <Route 
                        path="reports" 
                        element={
                          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
                            <ReportsPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* Profile - All roles */}
                      <Route path="profile" element={<ProfilePage />} />
                      
                      {/* Notifications - All roles */}
                      <Route path="notifications" element={<NotificationsPage />} />
                      
                      {/* Personal Settings - All roles */}
                      <Route path="settings" element={<SettingsPage />} />
                      
                      {/* Admin Settings - Admin only */}
                      <Route 
                        path="admin/settings" 
                        element={
                          <ProtectedRoute allowedRoles={['admin']}>
                            <AdminSettingsPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* 404 */}
                      <Route path="*" element={<NotFoundPage />} />
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

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { getHomePathForRole } from '@/config/menuConfig'
import ErrorBoundary from '@/components/ErrorBoundary'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/layouts/DashboardLayout'

// Страницы
import DashboardPage from '@/pages/DashboardPage'
import TasksPage from '@/pages/TasksPage'
import MyTasksPage from '@/pages/MyTasksPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import TaskFormPage from '@/pages/TaskFormPage'
import MapPage from '@/pages/MapPage'
import CalendarPage from '@/pages/CalendarPage'
import AddressesPage from '@/pages/AddressesPage'
import AddressDetailPage from '@/pages/AddressDetailPage'
import UsersPage from '@/pages/UsersPage'
import FinancePage from '@/pages/FinancePage'
import ReportsPage from '@/pages/ReportsPage'
import ProfilePage from '@/pages/ProfilePage'
import NotificationsPage from '@/pages/NotificationsPage'
import SettingsPage from '@/pages/SettingsPage'
import AdminSettingsPage from '@/pages/AdminSettingsPage'
import NotFoundPage from '@/pages/NotFoundPage'

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
      <BrowserRouter basename="/portal">
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

import { lazy, type ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  LifeBuoy,
  Map,
  MapPin,
  MessageSquare,
  Settings,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { AccessRole } from '@/types/user'

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
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const SupportPage = lazy(() => import('@/pages/SupportPage'))
const SupportTicketDetailPage = lazy(() => import('@/pages/SupportTicketDetailPage'))
const AdminSettingsPage = lazy(() => import('@/pages/AdminSettingsPage'))
const OrganizationsPage = lazy(() => import('@/pages/OrganizationsPage'))
const OrganizationDetailPage = lazy(() => import('@/pages/OrganizationDetailPage'))
const UpdatesPage = lazy(() => import('@/pages/UpdatesPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export type NavigationSectionId = 'main' | 'management' | 'personal' | 'admin'

export interface RouteNavigation {
  section: NavigationSectionId
  label: string
  mobileLabel?: string
  icon: LucideIcon
}

export interface PortalRouteDefinition {
  id: string
  path: string
  element?: ReactNode
  redirectTo?: string
  roles?: AccessRole[]
  excludeOrgAdmin?: boolean
  navigation?: RouteNavigation
}

const ALL_ROLES: AccessRole[] = ['admin', 'dispatcher', 'worker']
const MANAGER_ROLES: AccessRole[] = ['admin', 'dispatcher']
const ADMIN_ROLES: AccessRole[] = ['admin']

export const navigationSections: ReadonlyArray<{
  id: NavigationSectionId
  title: string
}> = [
  { id: 'main', title: 'Основное' },
  { id: 'management', title: 'Управление' },
  { id: 'personal', title: 'Личное' },
  { id: 'admin', title: 'Администрирование' },
]

export const portalRoutes: PortalRouteDefinition[] = [
  {
    id: 'dashboard',
    path: 'dashboard',
    element: <DashboardPage />,
    roles: MANAGER_ROLES,
    navigation: { section: 'main', label: 'Дашборд', icon: LayoutDashboard },
  },
  {
    id: 'my-tasks',
    path: 'my-tasks',
    element: <MyTasksPage />,
    roles: ['worker'],
    navigation: {
      section: 'main',
      label: 'Мои заявки',
      mobileLabel: 'Заявки',
      icon: ClipboardList,
    },
  },
  {
    id: 'tasks',
    path: 'tasks',
    element: <TasksPage />,
    roles: MANAGER_ROLES,
    navigation: { section: 'main', label: 'Все заявки', icon: ClipboardList },
  },
  {
    id: 'task-create',
    path: 'tasks/new',
    element: <TaskFormPage mode="create" />,
    roles: MANAGER_ROLES,
  },
  { id: 'task-detail', path: 'tasks/:id', element: <TaskDetailPage /> },
  {
    id: 'task-edit',
    path: 'tasks/:id/edit',
    element: <TaskFormPage mode="edit" />,
    roles: MANAGER_ROLES,
  },
  {
    id: 'map',
    path: 'map',
    element: <MapPage />,
    roles: ALL_ROLES,
    navigation: { section: 'main', label: 'Карта', icon: Map },
  },
  {
    id: 'calendar',
    path: 'calendar',
    element: <CalendarPage />,
    roles: ALL_ROLES,
    navigation: { section: 'main', label: 'Календарь', icon: Calendar },
  },
  {
    id: 'addresses',
    path: 'addresses',
    element: <AddressesPage />,
    roles: MANAGER_ROLES,
    navigation: { section: 'management', label: 'Адреса', icon: MapPin },
  },
  {
    id: 'address-detail',
    path: 'addresses/:id',
    element: <AddressDetailPage />,
    roles: MANAGER_ROLES,
  },
  {
    id: 'users',
    path: 'users',
    element: <UsersPage />,
    roles: ADMIN_ROLES,
    navigation: { section: 'management', label: 'Пользователи', icon: Users },
  },
  {
    id: 'finance',
    path: 'finance',
    element: <FinancePage />,
    roles: ADMIN_ROLES,
    excludeOrgAdmin: true,
    navigation: { section: 'management', label: 'Финансы', icon: DollarSign },
  },
  { id: 'devices-legacy', path: 'devices', redirectTo: '/profile' },
  {
    id: 'analytics',
    path: 'analytics',
    element: <AnalyticsPage />,
    roles: MANAGER_ROLES,
    navigation: { section: 'management', label: 'Аналитика', icon: BarChart3 },
  },
  { id: 'reports-legacy', path: 'reports', redirectTo: '/analytics', roles: MANAGER_ROLES },
  { id: 'sla-legacy', path: 'sla', redirectTo: '/analytics', roles: MANAGER_ROLES },
  {
    id: 'chat',
    path: 'chat',
    element: <ChatPage />,
    roles: ALL_ROLES,
    navigation: { section: 'main', label: 'Чат', icon: MessageSquare },
  },
  {
    id: 'profile',
    path: 'profile',
    element: <ProfilePage />,
    roles: ALL_ROLES,
    navigation: { section: 'personal', label: 'Профиль', icon: UserCircle },
  },
  {
    id: 'notifications',
    path: 'notifications',
    element: <NotificationsPage />,
    roles: ALL_ROLES,
    navigation: { section: 'personal', label: 'Уведомления', icon: Bell },
  },
  {
    id: 'support',
    path: 'support',
    element: <SupportPage />,
    roles: ALL_ROLES,
    navigation: { section: 'personal', label: 'Поддержка', icon: LifeBuoy },
  },
  { id: 'support-ticket', path: 'support/:ticketId', element: <SupportTicketDetailPage /> },
  { id: 'settings-legacy', path: 'settings', redirectTo: '/profile' },
  {
    id: 'admin-settings',
    path: 'admin/settings',
    element: <AdminSettingsPage />,
    roles: ADMIN_ROLES,
    excludeOrgAdmin: true,
    navigation: { section: 'admin', label: 'Система', icon: Settings },
  },
  {
    id: 'admin-organizations',
    path: 'admin/organizations',
    element: <OrganizationsPage />,
    roles: ADMIN_ROLES,
    excludeOrgAdmin: true,
    navigation: { section: 'admin', label: 'Организации', icon: Building2 },
  },
  {
    id: 'admin-organization-detail',
    path: 'admin/organizations/:id',
    element: <OrganizationDetailPage />,
    roles: ADMIN_ROLES,
    excludeOrgAdmin: true,
  },
  {
    id: 'admin-updates',
    path: 'admin/updates',
    element: <UpdatesPage />,
    roles: ADMIN_ROLES,
    excludeOrgAdmin: true,
  },
  { id: 'not-found', path: '*', element: <NotFoundPage /> },
]

export function getPortalRoutePath(routeId: string): string {
  const route = portalRoutes.find(({ id }) => id === routeId)
  if (!route) throw new Error(`Unknown portal route: ${routeId}`)
  return route.path === '*' ? '*' : `/${route.path}`
}

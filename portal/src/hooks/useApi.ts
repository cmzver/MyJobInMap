/**
 * React Query hooks for FieldWorker Portal
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  tasksApi,
  usersApi,
  devicesApi,
  financeApi,
  settingsApi,
  healthApi,
  TaskFilters,
  TaskCreate,
  TaskStatus,
  UserCreate,
  CustomField,
  CardLayout,
  SystemSettings,
} from '../services/api';

// Query Keys
export const queryKeys = {
  tasks: (filters?: TaskFilters) => ['tasks', filters] as const,
  task: (id: number) => ['task', id] as const,
  taskComments: (taskId: number) => ['taskComments', taskId] as const,
  taskPhotos: (taskId: number) => ['taskPhotos', taskId] as const,
  users: ['users'] as const,
  user: (id: number) => ['user', id] as const,
  devices: ['devices'] as const,
  financeStats: (period?: string, userId?: number) => ['financeStats', period, userId] as const,
  workerStats: (period?: string) => ['workerStats', period] as const,
  settings: ['settings'] as const,
  serverInfo: ['serverInfo'] as const,
  customFields: ['customFields'] as const,
  cardLayout: ['cardLayout'] as const,
  backups: ['backups'] as const,
  health: ['health'] as const,
};

// ============================================
// Tasks Hooks
// ============================================

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: queryKeys.tasks(filters),
    queryFn: () => tasksApi.list(filters),
    staleTime: 30000, // 30 seconds
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: queryKeys.task(id),
    queryFn: () => tasksApi.get(id),
    enabled: !!id,
  });
}

export function useTaskComments(taskId: number) {
  return useQuery({
    queryKey: queryKeys.taskComments(taskId),
    queryFn: () => tasksApi.getComments(taskId),
    enabled: !!taskId,
  });
}

export function useTaskPhotos(taskId: number) {
  return useQuery({
    queryKey: queryKeys.taskPhotos(taskId),
    queryFn: () => tasksApi.getPhotos(taskId),
    enabled: !!taskId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: TaskCreate) => tasksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreate> }) => 
      tasksApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.task(id) });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => 
      tasksApi.updateStatus(id, status),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.task(id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, text }: { taskId: number; text: string }) => 
      tasksApi.addComment(taskId, text),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId) });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ photoId, taskId: _taskId }: { photoId: number; taskId: number }) => 
      tasksApi.deletePhoto(photoId),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskPhotos(taskId) });
    },
  });
}

export function useParseTaskText() {
  return useMutation({
    mutationFn: (text: string) => tasksApi.parseText(text),
  });
}

// ============================================
// Users Hooks
// ============================================

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    staleTime: 60000, // 1 minute
  });
}

export function useUser(id: number) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => usersApi.get(id),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: UserCreate) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserCreate> }) => 
      usersApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      queryClient.invalidateQueries({ queryKey: queryKeys.user(id) });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

// ============================================
// Devices Hooks
// ============================================

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: devicesApi.list,
    staleTime: 30000,
  });
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: (userId?: number) => devicesApi.sendTestNotification(userId),
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => devicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

// ============================================
// Finance Hooks
// ============================================

export function useFinanceStats(period?: 'all' | 'month' | 'week', userId?: number) {
  return useQuery({
    queryKey: queryKeys.financeStats(period, userId),
    queryFn: () => financeApi.getStats(period, userId),
    staleTime: 60000,
  });
}

export function useWorkerStats(period?: 'all' | 'month' | 'week') {
  return useQuery({
    queryKey: queryKeys.workerStats(period),
    queryFn: () => financeApi.getWorkerStats(period),
    staleTime: 60000,
  });
}

// ============================================
// Settings Hooks
// ============================================

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: settingsApi.get,
    staleTime: 300000, // 5 minutes
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Partial<SystemSettings>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useServerInfo() {
  return useQuery({
    queryKey: queryKeys.serverInfo,
    queryFn: settingsApi.getServerInfo,
    staleTime: 60000,
  });
}

export function useCustomFields() {
  return useQuery({
    queryKey: queryKeys.customFields,
    queryFn: settingsApi.getCustomFields,
    staleTime: 300000,
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: Omit<CustomField, 'id'>) => settingsApi.createCustomField(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields });
    },
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomField> }) => 
      settingsApi.updateCustomField(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => settingsApi.deleteCustomField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields });
    },
  });
}

export function useCardLayout() {
  return useQuery({
    queryKey: queryKeys.cardLayout,
    queryFn: settingsApi.getCardLayout,
    staleTime: 300000,
  });
}

export function useSaveCardLayout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (layout: CardLayout) => settingsApi.saveCardLayout(layout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cardLayout });
    },
  });
}

export function useBackups() {
  return useQuery({
    queryKey: queryKeys.backups,
    queryFn: settingsApi.listBackups,
    staleTime: 60000,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: settingsApi.createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.backups });
    },
  });
}

export function useSeedDatabase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: settingsApi.seedDatabase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useClearTasks() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: settingsApi.clearTasks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ============================================
// Health Hooks
// ============================================

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: healthApi.check,
    staleTime: 10000,
    retry: 1,
  });
}

/**
 * FieldWorker Portal API Service
 * Centralized API calls with authentication
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

// Get auth token from localStorage (синхронизировано с authStore)
function getToken(): string | null {
  // Сначала пробуем прямой токен
  const directToken = localStorage.getItem('token');
  if (directToken) return directToken;
  
  // Затем пробуем из zustand persist store
  const authState = localStorage.getItem('fieldworker-auth');
  if (authState) {
    try {
      const parsed = JSON.parse(authState);
      return parsed.state?.token || null;
    } catch {
      return null;
    }
  }
  return null;
}

// Generic fetch wrapper with auth
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;
  
  return JSON.parse(text);
}

// ============================================
// Auth API
// ============================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface User {
  id: number;
  username: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: 'admin' | 'dispatcher' | 'worker';
  is_active: boolean;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', data.username);
    formData.append('password', data.password);
    
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail);
    }
    
    return response.json();
  },
  
  me: () => fetchApi<User>('/api/auth/me'),
};

// ============================================
// Tasks API
// ============================================

export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 1 | 2 | 3 | 4; // 1=Planned, 2=Current, 3=Urgent, 4=Emergency

export interface Task {
  id: number;
  task_number?: string;
  title: string;
  description?: string;
  raw_address: string;
  lat?: number;
  lon?: number;
  status: TaskStatus;
  priority: TaskPriority;
  is_paid?: boolean;
  is_remote?: boolean;
  payment_amount?: number;
  planned_date?: string;
  assigned_user_id?: number;
  assigned_user_name?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  raw_address: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  planned_date?: string;
  assigned_user_id?: number;
  is_paid?: boolean;
  is_remote?: boolean;
  payment_amount?: number;
}

export interface TasksResponse {
  items: Task[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_user_id?: number | 'unassigned';
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}

export interface Comment {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  text: string;
  created_at: string;
}

export interface Photo {
  id: number;
  task_id: number;
  filename: string;
  original_name?: string;
  photo_type: 'before' | 'after' | 'completion';
  url: string;
  created_at: string;
}

export interface ParsedTask {
  title: string;
  priority: TaskPriority;
  address: string;
  description: string;
  phone?: string;
  apartment?: string;
  external_id?: string;
}

export const tasksApi = {
  list: (filters?: TaskFilters) => {
    const params = new URLSearchParams();
    params.append('all_tasks', 'true');
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority.toString());
    if (filters?.assigned_user_id === 'unassigned') params.append('unassigned', 'true');
    else if (filters?.assigned_user_id) params.append('assigned_user_id', filters.assigned_user_id.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    params.append('page', (filters?.page || 1).toString());
    params.append('size', (filters?.size || 100).toString());
    
    return fetchApi<TasksResponse>(`/api/tasks?${params}`);
  },
  
  get: (id: number) => fetchApi<Task>(`/api/tasks/${id}`),
  
  create: (data: TaskCreate) => fetchApi<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  update: (id: number, data: Partial<TaskCreate>) => fetchApi<Task>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  updateStatus: (id: number, status: TaskStatus) => fetchApi<Task>(`/api/tasks/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }),
  
  delete: (id: number) => fetchApi<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  
  // Comments
  getComments: (taskId: number) => fetchApi<Comment[]>(`/api/tasks/${taskId}/comments`),
  
  addComment: (taskId: number, text: string) => fetchApi<Comment>(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  
  // Photos
  getPhotos: (taskId: number) => fetchApi<Photo[]>(`/api/tasks/${taskId}/photos`),
  
  deletePhoto: (photoId: number) => fetchApi<void>(`/api/photos/${photoId}`, { method: 'DELETE' }),
  
  // Parse task from dispatcher text
  parseText: (text: string) => fetchApi<ParsedTask>('/api/tasks/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
};

// ============================================
// Users API
// ============================================

export interface UserCreate {
  username: string;
  password?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: 'admin' | 'dispatcher' | 'worker';
  is_active?: boolean;
}

export interface UserWithStats extends User {
  tasks_count?: number;
  completed_count?: number;
}

export const usersApi = {
  list: () => fetchApi<User[]>('/api/users'),
  
  get: (id: number) => fetchApi<User>(`/api/users/${id}`),
  
  create: (data: UserCreate) => fetchApi<User>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  update: (id: number, data: Partial<UserCreate>) => fetchApi<User>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  delete: (id: number) => fetchApi<void>(`/api/users/${id}`, { method: 'DELETE' }),
};

// ============================================
// Devices API
// ============================================

export interface Device {
  id: number;
  user_id: number;
  user_name?: string;
  device_name?: string;
  fcm_token: string;
  last_active: string;
}

export const devicesApi = {
  list: () => fetchApi<Device[]>('/api/devices'),
  
  sendTestNotification: (userId?: number) => fetchApi<{ success: boolean }>('/api/notifications/send-push', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Тестовое уведомление',
      body: 'Проверка push-уведомлений',
      user_ids: userId ? [userId] : undefined,
    }),
  }),
  
  delete: (id: number) => fetchApi<void>(`/api/devices/${id}`, { method: 'DELETE' }),
};

// ============================================
// Finance API
// ============================================

export interface FinanceStats {
  completed_tasks: number;
  paid_tasks: number;
  remote_tasks: number;
  total_amount: number;
}

export interface WorkerStats {
  user_id: number;
  user_name: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  paid_tasks: number;
  remote_tasks: number;
  total_earned: number;
}

export const financeApi = {
  getStats: (period?: 'all' | 'month' | 'week', userId?: number) => {
    const params = new URLSearchParams();
    if (period && period !== 'all') params.append('period', period);
    if (userId) params.append('user_id', userId.toString());
    return fetchApi<FinanceStats>(`/api/finance/stats?${params}`);
  },
  
  getWorkerStats: (period?: 'all' | 'month' | 'week') => {
    const params = new URLSearchParams();
    if (period && period !== 'all') params.append('period', period);
    return fetchApi<WorkerStats[]>(`/api/finance/workers?${params}`);
  },
};

// ============================================
// Settings API
// ============================================

export interface SystemSettings {
  company_name?: string;
  default_priority?: TaskPriority;
  auto_assign_enabled?: boolean;
  image_max_size?: number;
  image_quality?: number;
  backup_enabled?: boolean;
  backup_retention_days?: number;
  firebase_enabled?: boolean;
}

export interface CustomField {
  id: number;
  name: string;
  label: string;
  field_type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
  options?: string[];
  placeholder?: string;
  default_value?: string;
  required: boolean;
  show_in_list: boolean;
  show_in_card: boolean;
  order: number;
}

export interface CardLayout {
  zones: {
    header: string[];
    main: string[];
    details: string[];
    footer: string[];
  };
}

export const settingsApi = {
  get: () => fetchApi<SystemSettings>('/api/system-settings'),
  
  update: (data: Partial<SystemSettings>) => fetchApi<SystemSettings>('/api/system-settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  // Server info
  getServerInfo: () => fetchApi<{
    version: string;
    firebase_enabled: boolean;
    geocoding_cache_size: number;
    tasks_count: number;
    users_count: number;
  }>('/api/info'),
  
  // Custom fields
  getCustomFields: () => fetchApi<CustomField[]>('/api/custom-fields'),
  
  createCustomField: (data: Omit<CustomField, 'id'>) => fetchApi<CustomField>('/api/custom-fields', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  updateCustomField: (id: number, data: Partial<CustomField>) => fetchApi<CustomField>(`/api/custom-fields/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  deleteCustomField: (id: number) => fetchApi<void>(`/api/custom-fields/${id}`, { method: 'DELETE' }),
  
  // Card layout
  getCardLayout: () => fetchApi<CardLayout>('/api/settings/card-layout'),
  
  saveCardLayout: (layout: CardLayout) => fetchApi<CardLayout>('/api/settings/card-layout', {
    method: 'PUT',
    body: JSON.stringify(layout),
  }),
  
  // Backups
  listBackups: () => fetchApi<{ name: string; size: number; created_at: string }[]>('/api/backups'),
  
  createBackup: () => fetchApi<{ name: string }>('/api/backups', { method: 'POST' }),
  
  // Database
  seedDatabase: () => fetchApi<{ message: string }>('/api/database/seed', { method: 'POST' }),
  
  clearTasks: () => fetchApi<{ message: string }>('/api/database/clear-tasks', { method: 'POST' }),
};

// ============================================
// Health API
// ============================================

export const healthApi = {
  check: () => fetchApi<{ status: string; timestamp: string }>('/health'),
};

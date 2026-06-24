import apiClient from './client'

export interface ContainerInfo {
  name: string
  image: string
  state: string // running | exited | restarting | ...
  status: string // "Up 2 minutes (healthy)"
  health: 'healthy' | 'unhealthy' | 'starting' | null
}

export interface SystemHealth {
  status: 'ok' | 'degraded'
  version: string
  python_version: string
  platform: string
  database: { status: string; engine?: string; error?: string }
  redis: { status: string; error?: string }
  system: {
    cpu_percent: number
    cpu_count: number | null
    load_avg: number[] | null
    memory: { total_mb: number; used_mb: number; percent: number }
    disk: { total_gb: number; used_gb: number; percent: number }
    uptime_seconds: number
  }
  backup_scheduler: {
    enabled?: boolean
    running?: boolean
    schedule?: string
    retention_days?: number
    next_run?: string | null
  }
  websocket: { active_connections?: number; unique_users?: number }
  containers: { available: boolean; reason?: string; containers?: ContainerInfo[] }
  monitoring?: { grafana_url: string | null; grafana_running?: boolean }
}

export interface ContainerLogs {
  available: boolean
  name?: string
  logs?: string
  reason?: string
}

export const systemApi = {
  async getHealth(): Promise<SystemHealth> {
    const { data } = await apiClient.get<SystemHealth>('/admin/system/health')
    return data
  },

  async getContainerLogs(name: string, tail = 200): Promise<ContainerLogs> {
    const { data } = await apiClient.get<ContainerLogs>(
      `/admin/system/containers/${encodeURIComponent(name)}/logs`,
      { params: { tail } },
    )
    return data
  },
}

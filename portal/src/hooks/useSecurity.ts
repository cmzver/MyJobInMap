import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'

// ============================================
// Types
// ============================================

export interface SecurityOverview {
  active_bans: number
  total_bans: number
  allowlist_count: number
  failed_logins_24h: number
  auto_bans_24h: number
  ddos_tracked_ips: number
  trust_proxy_headers: boolean
}

export interface BlockedIP {
  id: number
  ip_address: string
  reason?: string | null
  is_manual: boolean
  is_permanent: boolean
  created_at?: string | null
  expires_at?: string | null
  hit_count: number
  last_hit_at?: string | null
  created_by?: string | null
  is_active: boolean
}

export interface AllowlistEntry {
  id: number
  ip_address: string
  note?: string | null
  created_at?: string | null
  created_by?: string | null
}

export type SecurityEventType =
  | 'login_failed'
  | 'auto_banned'
  | 'manual_banned'
  | 'manual_unbanned'
  | 'ddos_banned'
  | 'request_blocked'

export interface SecurityEvent {
  id: number
  ip_address: string
  event_type: SecurityEventType | string
  username?: string | null
  detail?: string | null
  created_at?: string | null
}

export interface BlockIPInput {
  ip_address: string
  reason?: string
  minutes?: number | null
  permanent?: boolean
}

// ============================================
// API
// ============================================

const ipPath = (ip: string) => encodeURIComponent(ip)

export const securityApi = {
  async getOverview(): Promise<SecurityOverview> {
    const { data } = await apiClient.get<SecurityOverview>('/admin/security/overview')
    return data
  },
  async getBlocked(includeExpired = false): Promise<BlockedIP[]> {
    const { data } = await apiClient.get<BlockedIP[]>('/admin/security/blocked', {
      params: { include_expired: includeExpired },
    })
    return data
  },
  async block(input: BlockIPInput): Promise<BlockedIP> {
    const { data } = await apiClient.post<BlockedIP>('/admin/security/blocked', input)
    return data
  },
  async unblock(ip: string): Promise<void> {
    await apiClient.delete(`/admin/security/blocked/${ipPath(ip)}`)
  },
  async getAllowlist(): Promise<AllowlistEntry[]> {
    const { data } = await apiClient.get<AllowlistEntry[]>('/admin/security/allowlist')
    return data
  },
  async addAllowlist(ip: string, note?: string): Promise<AllowlistEntry> {
    const { data } = await apiClient.post<AllowlistEntry>('/admin/security/allowlist', {
      ip_address: ip,
      note,
    })
    return data
  },
  async removeAllowlist(ip: string): Promise<void> {
    await apiClient.delete(`/admin/security/allowlist/${ipPath(ip)}`)
  },
  async getEvents(params: { limit?: number; ip_address?: string; event_type?: string } = {}): Promise<
    SecurityEvent[]
  > {
    const { data } = await apiClient.get<SecurityEvent[]>('/admin/security/events', { params })
    return data
  },
}

// ============================================
// Query keys
// ============================================

const keys = {
  overview: ['security', 'overview'] as const,
  blocked: (includeExpired: boolean) => ['security', 'blocked', includeExpired] as const,
  allowlist: ['security', 'allowlist'] as const,
  events: (params: object) => ['security', 'events', params] as const,
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['security'] })
}

// ============================================
// Hooks
// ============================================

export function useSecurityOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => securityApi.getOverview(),
    staleTime: 15000,
    refetchInterval: 30000,
  })
}

export function useBlockedIPs(includeExpired = false) {
  return useQuery({
    queryKey: keys.blocked(includeExpired),
    queryFn: () => securityApi.getBlocked(includeExpired),
    staleTime: 15000,
    refetchInterval: 30000,
  })
}

export function useAllowlist() {
  return useQuery({
    queryKey: keys.allowlist,
    queryFn: () => securityApi.getAllowlist(),
    staleTime: 30000,
  })
}

export function useSecurityEvents(params: { limit?: number; ip_address?: string; event_type?: string } = {}) {
  return useQuery({
    queryKey: keys.events(params),
    queryFn: () => securityApi.getEvents(params),
    staleTime: 15000,
    refetchInterval: 30000,
  })
}

export function useBlockIP() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BlockIPInput) => securityApi.block(input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUnblockIP() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ip: string) => securityApi.unblock(ip),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useAddAllowlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ip, note }: { ip: string; note?: string }) => securityApi.addAllowlist(ip, note),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRemoveAllowlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ip: string) => securityApi.removeAllowlist(ip),
    onSuccess: () => invalidateAll(qc),
  })
}

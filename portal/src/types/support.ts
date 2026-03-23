import type { UserRole } from '@/types/user'

export type SupportTicketCategory = 'bug' | 'improvement' | 'feedback'
export type SupportTicketStatus = 'new' | 'in_progress' | 'resolved' | 'closed'
export type SupportTicketScope = 'mine' | 'all'
export type SupportTicketCommentType = 'comment' | 'status_change'

export interface SupportTicketReporter {
  id: number
  username: string
  full_name: string
  role: UserRole
  organization_id?: number | null
}

export interface SupportTicketComment {
  id: number
  comment_type: SupportTicketCommentType
  body: string | null
  old_status: SupportTicketStatus | null
  new_status: SupportTicketStatus | null
  created_at: string
  author: SupportTicketReporter
}

export interface SupportTicket {
  id: number
  title: string
  description: string
  category: SupportTicketCategory
  status: SupportTicketStatus
  admin_response: string | null
  organization_id?: number | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  created_by: SupportTicketReporter
}

export interface SupportTicketDetail extends SupportTicket {
  comments: SupportTicketComment[]
}

export interface CreateSupportTicketData {
  title: string
  description: string
  category: SupportTicketCategory
}

export interface UpdateSupportTicketData {
  status?: SupportTicketStatus
  admin_response?: string | null
}

export interface CreateSupportTicketCommentData {
  body: string
}

import type { components } from './api.generated'

// Support domain types are derived from the backend OpenAPI schema (single
// source of truth) — regenerate with `npm run gen:api`.
export type SupportTicketCategory = components['schemas']['SupportTicketCategory']
export type SupportTicketStatus = components['schemas']['SupportTicketStatus']
export type SupportTicketCommentType = components['schemas']['SupportTicketCommentType']

export type SupportTicketReporter = components['schemas']['SupportTicketReporter']
export type SupportTicketComment = components['schemas']['SupportTicketCommentResponse']
export type SupportTicket = components['schemas']['SupportTicketResponse']
export type SupportTicketDetail = components['schemas']['SupportTicketDetailResponse']

export type CreateSupportTicketData = components['schemas']['SupportTicketCreate']
export type UpdateSupportTicketData = components['schemas']['SupportTicketUpdate']
export type CreateSupportTicketCommentData = components['schemas']['SupportTicketCommentCreate']

// Client-side list scope (not a backend schema).
export type SupportTicketScope = 'mine' | 'all'

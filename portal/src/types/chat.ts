export type ConversationType = 'direct' | 'group' | 'task' | 'org_general'
export type MessageType = 'text' | 'image' | 'file' | 'system'
export type ConversationMemberRole = 'owner' | 'admin' | 'member'

export interface MemberInfo {
  user_id: number
  username: string
  full_name: string
  avatar_url?: string | null
  role: ConversationMemberRole
  last_read_message_id: number | null
  is_muted: boolean
  is_archived: boolean
  joined_at: string
}

export interface LastMessagePreview {
  id: number
  text: string | null
  sender_name: string
  created_at: string
  message_type: MessageType
}

export interface ConversationListItem {
  id: number
  type: ConversationType
  name: string | null
  avatar_url?: string | null
  task_id: number | null
  organization_id: number | null
  created_at: string
  last_message_at: string | null
  unread_count: number
  unread_mention_count: number
  is_muted: boolean
  is_archived: boolean
  last_message: LastMessagePreview | null
  display_name?: string
}

export interface ConversationDetail {
  id: number
  type: ConversationType
  name: string | null
  avatar_url?: string | null
  task_id: number | null
  organization_id: number | null
  created_by?: number
  created_at: string
  updated_at?: string | null
  last_message_at: string | null
  members: MemberInfo[]
}

export interface AttachmentResponse {
  id: number
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  thumbnail_path: string | null
  created_at: string
}

export interface ReactionInfo {
  emoji: string
  count: number
  user_ids: number[]
}

export interface MentionInfo {
  user_id: number
  username: string
}

export interface ReplyPreview {
  id: number
  text: string | null
  sender_name: string
}

export interface MessageResponse {
  id: number
  conversation_id: number
  sender_id: number
  sender_name: string
  text: string | null
  message_type: MessageType
  reply_to: ReplyPreview | null
  attachments: AttachmentResponse[]
  reactions: ReactionInfo[]
  mentions: MentionInfo[]
  is_edited: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string | null
}

export interface MessageListResponse {
  items: MessageResponse[]
  has_more: boolean
}

export interface ConversationCreate {
  type: ConversationType
  name?: string
  member_user_ids?: number[]
  task_id?: number
  organization_id?: number
}

export interface MessageCreate {
  text?: string | null
  reply_to_id?: number
  message_type?: MessageType
}

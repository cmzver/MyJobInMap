import type { components } from './api.generated'

// Все типы чата выводятся из backend OpenAPI-схемы (единый источник истины) —
// регенерация через `npm run gen:api`.
export type ConversationType = components['schemas']['ConversationType']
export type MessageType = components['schemas']['MessageType']
export type ConversationMemberRole = components['schemas']['ConversationMemberRole']

export type MemberInfo = components['schemas']['MemberInfo']
export type LastMessagePreview = components['schemas']['LastMessagePreview']
export type ConversationListItem = components['schemas']['ConversationListItem']
export type ConversationDetail = components['schemas']['ConversationDetailResponse']
export type AttachmentResponse = components['schemas']['AttachmentResponse']
export type ReactionInfo = components['schemas']['ReactionInfo']
export type MentionInfo = components['schemas']['MentionInfo']
export type ReplyPreview = components['schemas']['ReplyPreview']
export type TaskPreview = components['schemas']['TaskPreview']
export type MessageResponse = components['schemas']['MessageResponse']
export type MessageListResponse = components['schemas']['MessageListResponse']
export type ConversationCreate = components['schemas']['ConversationCreate']
export type MessageCreate = components['schemas']['MessageCreate']

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { Archive, Building2, ClipboardList, MessageSquare, Users, VolumeX } from 'lucide-react'
import type { ConversationListItem, ConversationType } from '@/types/chat'
import { formatDateRelative } from '@/utils/dateFormat'
import UserAvatar from '@/components/UserAvatar'

const typeIcons: Record<ConversationType, typeof MessageSquare> = {
  direct: MessageSquare,
  group: Users,
  task: ClipboardList,
  org_general: Building2,
}

interface Props {
  conversations: ConversationListItem[]
  activeId: number | null
  onSelect: (id: number) => void
}

function ConversationList({ conversations, activeId, onSelect }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <MessageSquare className="mb-2 h-8 w-8" />
        <span className="text-sm">Нет чатов</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto px-2.5 pb-2.5">
      {conversations.map((conv) => {
        const Icon = typeIcons[conv.type]
        const isActive = conv.id === activeId
        const displayName = conv.display_name ?? conv.name ?? `Чат #${conv.id}`

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              isActive
                ? 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/80'
                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/70',
            )}
          >
            {conv.avatar_url ? (
              <UserAvatar
                fullName={displayName}
                avatarUrl={conv.avatar_url}
                sizeClassName="h-10 w-10"
                textClassName="text-sm"
                className={cn(
                  'rounded-lg',
                  isActive
                    ? 'ring-1 ring-gray-300 dark:ring-gray-600'
                    : 'ring-1 ring-gray-200 dark:ring-gray-700',
                )}
              />
            ) : (
              <div
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border text-gray-500 dark:text-gray-400',
                  isActive
                    ? 'border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700'
                    : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1 self-center">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-sm font-medium leading-5',
                      conv.unread_count > 0
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300',
                    )}
                  >
                    {displayName}
                  </span>
                  {conv.is_archived && <Archive className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />}
                  {conv.is_muted && <VolumeX className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />}
                </div>
                {conv.last_message_at && (
                  <span className="ml-1.5 flex-shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                    {formatDateRelative(conv.last_message_at)}
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex items-center justify-between gap-2">
                {conv.last_message ? (
                  <p
                    className={cn(
                      'truncate text-xs leading-5',
                      conv.unread_count > 0
                        ? 'text-gray-600 dark:text-gray-300'
                        : 'text-gray-400 dark:text-gray-500',
                    )}
                  >
                    <span className="font-medium">{conv.last_message.sender_name}:</span>{' '}
                    {conv.last_message.text ?? 'Вложение'}
                  </p>
                ) : (
                  <span className="truncate text-xs text-gray-400 dark:text-gray-500">Нет сообщений</span>
                )}

                {(conv.unread_mention_count > 0 || conv.unread_count > 0) && (
                  <div className="ml-1.5 flex flex-shrink-0 items-center gap-1">
                    {conv.unread_mention_count > 0 && (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        @{conv.unread_mention_count > 99 ? '99+' : conv.unread_mention_count}
                      </span>
                    )}
                    {conv.unread_count > 0 && (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default memo(ConversationList)

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { MessageSquare, Users, ClipboardList, Building2, Archive, VolumeX } from 'lucide-react'
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
        <MessageSquare className="h-8 w-8 mb-2" />
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
              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150',
              isActive
                ? 'border-primary-200 bg-gradient-to-br from-primary-50 via-white to-white shadow-sm ring-1 ring-primary-200/80 dark:border-primary-700/60 dark:from-primary-950/40 dark:via-gray-800 dark:to-gray-800 dark:ring-primary-700/40'
                : 'border-gray-200/80 bg-white/90 hover:border-gray-300 hover:bg-white hover:shadow-sm dark:border-gray-700/70 dark:bg-gray-800/75 dark:hover:border-gray-600 dark:hover:bg-gray-800',
            )}
          >
            {conv.avatar_url ? (
              <UserAvatar
                fullName={displayName}
                avatarUrl={conv.avatar_url}
                sizeClassName="h-9 w-9"
                textClassName="text-xs"
                className={cn(
                  'rounded-xl',
                  isActive
                    ? 'ring-2 ring-primary-200 dark:ring-primary-700/60'
                    : 'ring-1 ring-gray-200 dark:ring-gray-700',
                )}
              />
            ) : (
              <div className={cn(
                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl shadow-sm',
                isActive
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-800/80 dark:text-primary-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
              )}>
                <Icon className="h-4.5 w-4.5" />
              </div>
            )}

            <div className="min-w-0 flex-1 self-center">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={cn(
                    'text-[13px] font-semibold leading-5 truncate',
                    conv.unread_count > 0
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300',
                  )}>
                    {displayName}
                  </span>
                  {conv.is_archived && <Archive className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />}
                  {conv.is_muted && <VolumeX className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />}
                </div>
                {conv.last_message_at && (
                  <span className="ml-1.5 flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {formatDateRelative(conv.last_message_at)}
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex items-center justify-between gap-2">
                {conv.last_message ? (
                  <p className={cn(
                    'text-[11px] truncate leading-4.5',
                    conv.unread_count > 0
                      ? 'text-gray-600 dark:text-gray-300'
                      : 'text-gray-400 dark:text-gray-500',
                  )}>
                    <span className="font-medium">{conv.last_message.sender_name}:</span>{' '}
                    {conv.last_message.text ?? '📎 Вложение'}
                  </p>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                    Нет сообщений
                  </span>
                )}

                {(conv.unread_mention_count > 0 || conv.unread_count > 0) && (
                  <div className="ml-1.5 flex flex-shrink-0 items-center gap-1">
                    {conv.unread_mention_count > 0 && (
                      <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                        @{conv.unread_mention_count > 99 ? '99+' : conv.unread_mention_count}
                      </span>
                    )}
                    {conv.unread_count > 0 && (
                      <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[10px] font-bold text-white">
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

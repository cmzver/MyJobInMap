import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import { Reply, Pencil, Trash2, SmilePlus, Check, CheckCheck, Download, FileImage, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDatePretty, formatDateTime } from '@/utils/dateFormat'
import { getChatSystemEventMeta } from '@/utils/chatSystemEvents'
import { chatApi } from '@/api/chat'
import Modal from '@/components/Modal'
import UserAvatar from '@/components/UserAvatar'
import type { AttachmentResponse, MessageResponse } from '@/types/chat'

interface Props {
  message: MessageResponse
  galleryAttachments?: AttachmentResponse[]
  galleryAttachmentMessageIds?: Record<number, number>
  isHighlighted?: boolean
  isOwn: boolean
  senderAvatarUrl?: string | null
  groupedWithPrevious?: boolean
  groupedWithNext?: boolean
  readCount?: number
  recipientCount?: number
  onDownloadAttachment?: (attachment: AttachmentResponse) => Promise<void> | void
  onJumpToMessage?: (messageId: number) => void
  onReply: (msg: MessageResponse) => void
  onEdit: (msg: MessageResponse) => void
  onDelete: (msgId: number) => void
  onReaction: (msgId: number, emoji: string) => void
  currentUserId: number
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderMessageText(message: MessageResponse) {
  const text = message.text ?? ''
  if (!text || message.mentions.length === 0) {
    return text
  }

  const usernames = [...new Set(message.mentions.map((mention) => mention.username).filter(Boolean))]
  if (usernames.length === 0) {
    return text
  }

  const parts = text.split(new RegExp(`(@(?:${usernames.map(escapeRegExp).join('|')}))`, 'g'))

  return parts.map((part, index) => {
    if (part.startsWith('@') && usernames.includes(part.slice(1))) {
      return (
        <span key={`${part}-${index}`} className="font-medium text-primary-100 underline decoration-primary-200/70 underline-offset-2 dark:text-primary-300">
          {part}
        </span>
      )
    }

    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

function AttachmentIcon({ attachment }: { attachment: AttachmentResponse }) {
  if (attachment.mime_type.startsWith('image/')) {
    return <FileImage className="h-4 w-4" />
  }

  return <FileText className="h-4 w-4" />
}

function ImageAttachmentPreview({
  attachment,
  isOwn,
  onOpen,
}: {
  attachment: AttachmentResponse
  isOwn: boolean
  onOpen?: (attachment: AttachmentResponse) => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isActive = true
    let objectUrl: string | null = null

    setPreviewUrl(null)
    setHasError(false)

    const loadPreview = attachment.thumbnail_path
      ? chatApi.downloadAttachmentThumbnail(attachment.id)
      : chatApi.downloadAttachment(attachment.id)

    loadPreview
      .then((blob) => {
        if (!isActive) return
        objectUrl = window.URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
      })
      .catch(() => {
        if (isActive) {
          setHasError(true)
        }
      })

    return () => {
      isActive = false
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl)
      }
    }
  }, [attachment.id, attachment.thumbnail_path])

  if (hasError) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(attachment)}
      className={cn(
        'block overflow-hidden rounded-xl border transition-colors',
        isOwn
          ? 'border-white/20 bg-white/10 hover:bg-white/15'
          : 'border-gray-200 bg-white/80 hover:bg-white dark:border-gray-600 dark:bg-gray-800/80 dark:hover:bg-gray-800',
      )}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={attachment.file_name}
          className="block max-h-64 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className={cn(
          'flex h-40 w-full items-center justify-center text-xs animate-pulse',
          isOwn ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
        )}>
          Загрузка изображения...
        </div>
      )}
    </button>
  )
}

function ImageAttachmentLightbox({
  attachmentId,
  attachments,
  attachmentMessageIds,
  isOpen,
  onClose,
  onSelectAttachment,
  onJumpToMessage,
  onDownload,
}: {
  attachmentId: number | null
  attachments: AttachmentResponse[]
  attachmentMessageIds: Record<number, number>
  isOpen: boolean
  onClose: () => void
  onSelectAttachment: (attachmentId: number) => void
  onJumpToMessage?: (messageId: number) => void
  onDownload: (attachment: AttachmentResponse) => Promise<void>
}) {
  const attachment = attachmentId == null
    ? null
    : attachments.find((item) => item.id === attachmentId) ?? null
  const currentIndex = attachment == null ? -1 : attachments.findIndex((item) => item.id === attachment.id)
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < attachments.length - 1
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })
  const objectUrlCacheRef = useRef(new Map<number, string>())

  const resetTransform = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setIsDragging(false)
  }, [])

  const ensureAttachmentLoaded = useCallback(async (target: AttachmentResponse) => {
    const cachedUrl = objectUrlCacheRef.current.get(target.id)
    if (cachedUrl) {
      return cachedUrl
    }

    const blob = await chatApi.downloadAttachment(target.id)
    const objectUrl = window.URL.createObjectURL(blob)
    objectUrlCacheRef.current.set(target.id, objectUrl)
    return objectUrl
  }, [])

  useEffect(() => {
    if (!isOpen || !attachment) {
      setImageUrl(null)
      setIsLoading(false)
      setHasError(false)
      resetTransform()
      return
    }

    let isActive = true

    setImageUrl(null)
    setHasError(false)
    setIsLoading(true)
    resetTransform()

    ensureAttachmentLoaded(attachment)
      .then((objectUrl) => {
        if (!isActive) return
        setImageUrl(objectUrl)
      })
      .catch(() => {
        if (isActive) {
          setHasError(true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [attachment, ensureAttachmentLoaded, isOpen, resetTransform])

  useEffect(() => {
    if (!isOpen || currentIndex < 0) {
      return
    }

    const preloadCandidates = attachments.filter((_, index) => Math.abs(index - currentIndex) <= 3)
    preloadCandidates.forEach((candidate) => {
      void ensureAttachmentLoaded(candidate).catch(() => {})
    })
  }, [attachments, currentIndex, ensureAttachmentLoaded, isOpen])

  useEffect(() => {
    return () => {
      objectUrlCacheRef.current.forEach((objectUrl) => {
        window.URL.revokeObjectURL(objectUrl)
      })
      objectUrlCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && hasPrevious) {
        event.preventDefault()
        const previous = attachments[currentIndex - 1]
        if (previous) {
          onSelectAttachment(previous.id)
        }
      }
      if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault()
        const next = attachments[currentIndex + 1]
        if (next) {
          onSelectAttachment(next.id)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [attachments, currentIndex, hasNext, hasPrevious, isOpen, onSelectAttachment])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging || scale <= 1) return

      setOffset({
        x: offsetStartRef.current.x + (event.clientX - dragStartRef.current.x),
        y: offsetStartRef.current.y + (event.clientY - dragStartRef.current.y),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isOpen, scale])

  if (!attachment) {
    return null
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      await onDownload(attachment)
    } finally {
      setIsDownloading(false)
    }
  }

  const openGalleryAttachment = (nextAttachmentId: number) => {
    setImageUrl(null)
    setHasError(false)
    setIsLoading(true)
    resetTransform()
    onSelectAttachment(nextAttachmentId)
  }

  const handleWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.2 : 0.2
    setScale((current) => {
      const next = Math.min(4, Math.max(1, Number((current + delta).toFixed(2))))
      if (next === 1) {
        setOffset({ x: 0, y: 0 })
      }
      return next
    })
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return
    event.preventDefault()
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    offsetStartRef.current = offset
    setIsDragging(true)
  }

  const zoomOut = () => {
    setScale((current) => {
      const next = Math.max(1, Number((current - 0.25).toFixed(2)))
      if (next === 1) {
        setOffset({ x: 0, y: 0 })
      }
      return next
    })
  }

  const zoomIn = () => {
    setScale((current) => Math.min(4, Number((current + 0.25).toFixed(2))))
  }

  const handleJumpToMessage = () => {
    if (!attachment || !onJumpToMessage) return
    const messageId = attachmentMessageIds[attachment.id]
    if (!messageId) return
    onClose()
    onJumpToMessage(messageId)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={attachment.file_name}
      size="xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-gray-50/85 px-3.5 py-2.5 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800/85 dark:text-gray-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>{formatAttachmentSize(attachment.file_size)}</span>
            {attachments.length > 1 && currentIndex >= 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600">
                {currentIndex + 1} из {attachments.length}
              </span>
            )}
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={zoomOut}
              disabled={scale <= 1}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              -
            </button>
            <button
              type="button"
              onClick={resetTransform}
              disabled={scale === 1 && offset.x === 0 && offset.y === 0}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Сброс
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={scale >= 4}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleJumpToMessage}
              disabled={!attachment || !attachmentMessageIds[attachment.id] || !onJumpToMessage}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              К сообщению
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {isDownloading ? 'Открытие...' : 'Открыть отдельно'}
          </button>
        </div>

        <div
          className="relative flex min-h-[50vh] items-center justify-center overflow-hidden rounded-[1.75rem] border border-gray-800/40 bg-gray-950/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          onWheel={handleWheelZoom}
        >
          {hasPrevious && (
            <button
              type="button"
              onClick={() => openGalleryAttachment(attachments[currentIndex - 1]!.id)}
              className="absolute left-10 z-10 rounded-full bg-white/85 p-2 text-gray-900 shadow-lg transition hover:bg-white dark:bg-gray-800/90 dark:text-white dark:hover:bg-gray-800"
              aria-label="Предыдущее изображение"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => openGalleryAttachment(attachments[currentIndex + 1]!.id)}
              className="absolute right-10 z-10 rounded-full bg-white/85 p-2 text-gray-900 shadow-lg transition hover:bg-white dark:bg-gray-800/90 dark:text-white dark:hover:bg-gray-800"
              aria-label="Следующее изображение"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          {isLoading && (
            <div className="text-sm text-white/70">Загрузка изображения...</div>
          )}
          {!isLoading && hasError && (
            <div className="text-sm text-white/70">Не удалось загрузить изображение</div>
          )}
          {!isLoading && imageUrl && (
            <div className="flex h-full w-full items-center justify-center overflow-hidden">
              <img
                src={imageUrl}
                alt={attachment.file_name}
                onMouseDown={handleMouseDown}
                onDoubleClick={resetTransform}
                draggable={false}
                className={cn(
                  'max-h-[75vh] w-auto max-w-full rounded-xl object-contain select-none transition-transform duration-150',
                  scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
                )}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                }}
              />
            </div>
          )}
        </div>

        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          Колесо мыши для масштаба, перетаскивание для сдвига, двойной клик для сброса, стрелки клавиатуры для перехода.
        </div>

        {attachments.length > 1 && (
          <div className="overflow-x-auto rounded-2xl border border-gray-200/70 bg-gray-50/85 px-2.5 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800/85">
            <div className="flex min-w-max items-center gap-2">
              {attachments.map((item) => {
                const previewUrl = objectUrlCacheRef.current.get(item.id)
                const isSelected = item.id === attachment.id

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openGalleryAttachment(item.id)}
                    className={cn(
                      'relative overflow-hidden rounded-xl border transition-colors duration-150',
                      isSelected
                        ? 'border-primary-400 ring-2 ring-primary-300/70 dark:border-primary-500 dark:ring-primary-700/60'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-500',
                    )}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={item.file_name}
                        className="h-14 w-20 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className={cn(
                        'flex h-14 w-20 items-center justify-center text-[10px] font-medium',
                        isSelected
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
                      )}>
                        {item.id === attachment.id ? 'Текущее' : 'Превью'}
                      </div>
                    )}
                    <div className={cn(
                      'absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm',
                      isSelected
                        ? 'bg-primary-500/75 text-white'
                        : 'bg-black/45 text-white/90',
                    )}>
                      {item.file_name}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function MessageBubble({
  message,
  galleryAttachments = [],
  galleryAttachmentMessageIds = {},
  isHighlighted = false,
  isOwn,
  senderAvatarUrl,
  groupedWithPrevious = false,
  groupedWithNext = false,
  readCount = 0,
  recipientCount = 0,
  onDownloadAttachment,
  onJumpToMessage,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  currentUserId,
}: Props) {
  const [showActions, setShowActions] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null)
  const [lightboxAttachmentId, setLightboxAttachmentId] = useState<number | null>(null)
  const isRead = readCount > 0

  const handleAttachmentOpen = async (attachment: AttachmentResponse) => {
    if (!onDownloadAttachment) return
    setDownloadingAttachmentId(attachment.id)
    try {
      await onDownloadAttachment(attachment)
    } finally {
      setDownloadingAttachmentId((current) => (current === attachment.id ? null : current))
    }
  }

  if (message.is_deleted) {
    return (
      <div className={cn('flex mb-2', isOwn ? 'justify-end' : 'justify-start')}>
        <div className="px-4 py-2 rounded-2xl bg-gray-100 dark:bg-gray-700/50 italic text-gray-400 dark:text-gray-500 text-sm">
          Сообщение удалено
        </div>
      </div>
    )
  }

  if (message.message_type === 'system') {
    const eventMeta = getChatSystemEventMeta(message)

    return (
      <div className="mb-3 flex justify-center px-3">
        <div className="flex w-full max-w-xl items-center gap-3 text-center">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-gray-200 dark:via-gray-700 dark:to-gray-700" />
          <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-4 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800/85">
            <div className={cn('text-[10px] font-semibold uppercase tracking-[0.12em]', eventMeta.accentClassName)}>
              {eventMeta.title}
            </div>
            <div className="mt-1 text-xs font-medium leading-5 text-gray-600 dark:text-gray-300">
              {message.text}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
              {formatDatePretty(message.created_at)}
            </div>
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-gray-200 to-gray-200 dark:via-gray-700 dark:to-gray-700" />
        </div>
      </div>
    )
  }

  return (
    <div
      id={`chat-message-${message.id}`}
      className={cn(
        'group rounded-[1.75rem] px-1 py-1 transition-all duration-500',
        groupedWithNext ? 'mb-0.5' : 'mb-2',
        isOwn ? 'flex justify-end' : 'flex justify-start',
        isHighlighted && 'bg-amber-100/80 shadow-[0_0_0_1px_rgba(245,158,11,0.35)] dark:bg-amber-500/15',
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false) }}
    >
      {!isOwn && (
        groupedWithPrevious ? (
          <div className="w-11 flex-shrink-0" aria-hidden="true" />
        ) : (
          <div className="w-11 flex-shrink-0 self-end pb-1">
            <UserAvatar
              fullName={message.sender_name}
              avatarUrl={senderAvatarUrl}
              sizeClassName="h-9 w-9"
              textClassName="text-xs"
              className="ring-1 ring-gray-200 dark:ring-gray-700"
            />
          </div>
        )
      )}

      <div className={cn('max-w-[70%] relative', isOwn ? 'items-end' : 'items-start')}>
        {/* Sender name for non-own messages */}
        {!isOwn && !groupedWithPrevious && (
          <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-0.5 px-1">
            {message.sender_name}
          </p>
        )}

        {/* Reply preview */}
        {message.reply_to && (
          <div className={cn(
            'text-xs px-3 py-1 mb-0.5 rounded-t-xl border-l-2 border-primary-400',
            isOwn
              ? 'bg-primary-400/20 dark:bg-primary-500/20'
              : 'bg-gray-100 dark:bg-gray-600/50',
          )}>
            <span className="font-medium">{message.reply_to.sender_name}</span>
            <p className="truncate opacity-75">{message.reply_to.text ?? '📎 Вложение'}</p>
          </div>
        )}

        {/* Bubble */}
        <div className={cn(
          'px-4 py-2 text-sm transition-[border-radius]',
          isOwn
            ? 'bg-primary-500 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100',
          groupedWithPrevious ? 'rounded-tl-xl rounded-tr-xl' : 'rounded-tl-2xl rounded-tr-2xl',
          isOwn
            ? (groupedWithNext ? 'rounded-bl-xl rounded-br-2xl' : 'rounded-bl-2xl rounded-br-md')
            : (groupedWithNext ? 'rounded-bl-2xl rounded-br-xl' : 'rounded-bl-md rounded-br-2xl'),
        )}>
          <div className="whitespace-pre-wrap break-words">
            {renderMessageText(message)}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="mt-1 space-y-1">
              {message.attachments.map((att) => (
                <div key={att.id} className="space-y-1">
                  {att.mime_type.startsWith('image/') && (
                    <ImageAttachmentPreview
                      attachment={att}
                      isOwn={isOwn}
                      onOpen={(attachment) => setLightboxAttachmentId(attachment.id)}
                    />
                  )}
                  <div
                    className={cn(
                      'rounded-xl border px-3 py-2',
                      isOwn
                        ? 'border-white/20 bg-white/10 text-white/90'
                        : 'border-gray-200 bg-white/80 dark:border-gray-600 dark:bg-gray-800/80',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <AttachmentIcon attachment={att} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{att.file_name}</div>
                          <div className={cn('truncate opacity-70', isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400')}>
                            {att.mime_type.startsWith('image/') ? 'Изображение' : 'Файл'} • {formatAttachmentSize(att.file_size)}
                          </div>
                        </div>
                      </div>
                      <Download className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-70" />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleAttachmentOpen(att)}
                        disabled={downloadingAttachmentId === att.id}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                          isOwn
                            ? 'bg-white/15 text-white hover:bg-white/20'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
                        )}
                      >
                        {downloadingAttachmentId === att.id
                          ? 'Открытие...'
                          : att.mime_type.startsWith('image/') || att.mime_type === 'application/pdf'
                            ? 'Открыть'
                            : 'Скачать'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Timestamp + edited */}
          <div className={cn(
            'flex items-center gap-1 mt-1 text-[10px]',
            isOwn ? 'text-white/60 justify-end' : 'text-gray-400 dark:text-gray-500',
          )}>
            {message.is_edited && <span>ред.</span>}
            <span>{formatDateTime(message.created_at)}</span>
            {isOwn && (
              <>
                {isRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                {isRead && recipientCount > 1 && <span>{readCount}</span>}
              </>
            )}
          </div>
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReaction(message.id, r.emoji)}
                className={cn(
                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition',
                  r.user_ids.includes(currentUserId)
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-600'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600',
                )}
              >
                <span>{r.emoji}</span>
                <span className="text-gray-600 dark:text-gray-300">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mentions */}
        {message.mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5 px-1">
            {message.mentions.map((m) => (
              <span key={m.user_id} className="text-[10px] text-primary-500">
                @{m.username}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons (on hover) */}
        {showActions && (
          <div className={cn(
            'absolute top-0 flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-0.5 border border-gray-200 dark:border-gray-600 z-10',
            isOwn ? '-left-2 -translate-x-full' : '-right-2 translate-x-full',
          )}>
            <button
              onClick={() => setShowReactions(!showReactions)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title="Реакция"
            >
              <SmilePlus className="h-3.5 w-3.5 text-gray-500" />
            </button>
            <button
              onClick={() => onReply(message)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title="Ответить"
            >
              <Reply className="h-3.5 w-3.5 text-gray-500" />
            </button>
            {isOwn && (
              <>
                <button
                  onClick={() => onEdit(message)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Редактировать"
                >
                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                </button>
                <button
                  onClick={() => onDelete(message.id)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Quick reactions popup */}
        {showReactions && (
          <div className={cn(
            'absolute flex items-center gap-1 bg-white dark:bg-gray-800 shadow-lg rounded-full px-2 py-1 border border-gray-200 dark:border-gray-600 z-20',
            isOwn ? 'right-0 -top-8' : 'left-0 -top-8',
          )}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReaction(message.id, emoji)
                  setShowReactions(false)
                }}
                className="hover:scale-125 transition-transform text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <ImageAttachmentLightbox
        attachmentId={lightboxAttachmentId}
        attachments={galleryAttachments}
        attachmentMessageIds={galleryAttachmentMessageIds}
        isOpen={lightboxAttachmentId != null}
        onClose={() => setLightboxAttachmentId(null)}
        onSelectAttachment={setLightboxAttachmentId}
        onJumpToMessage={onJumpToMessage}
        onDownload={handleAttachmentOpen}
      />
    </div>
  )
}

export default memo(MessageBubble)

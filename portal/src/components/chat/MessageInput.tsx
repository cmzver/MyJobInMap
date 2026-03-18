import { memo, useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react'
import { cn } from '@/utils/cn'
import { Send, X, Paperclip } from 'lucide-react'
import type { MessageResponse } from '@/types/chat'

interface MentionCandidate {
  userId: number
  username: string
  fullName: string
}

interface MentionMatch {
  start: number
  end: number
  query: string
}

interface Props {
  onSend: (text: string, replyToId?: number) => void
  onUpload?: (file: File) => void
  replyTo: MessageResponse | null
  editingMessage: MessageResponse | null
  mentionCandidates?: MentionCandidate[]
  onCancelReply: () => void
  onCancelEdit: () => void
  onSaveEdit: (messageId: number, text: string) => void
  disabled?: boolean
  onTyping?: () => void
}

function getMentionMatch(text: string, caretPosition: number): MentionMatch | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, text.length))
  const beforeCaret = text.slice(0, safeCaret)
  const match = beforeCaret.match(/(^|\s)@([\w.-]*)$/)
  if (!match) return null

  const query = match[2] ?? ''
  const start = safeCaret - query.length - 1
  return {
    start,
    end: safeCaret,
    query,
  }
}

function MessageInput({
  onSend,
  onUpload,
  replyTo,
  editingMessage,
  mentionCandidates = [],
  onCancelReply,
  onCancelEdit,
  onSaveEdit,
  disabled,
  onTyping,
}: Props) {
  const [text, setText] = useState('')
  const [caretPosition, setCaretPosition] = useState(0)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const mentionMatch = useMemo(() => getMentionMatch(text, caretPosition), [text, caretPosition])
  const mentionSuggestions = useMemo(() => {
    if (!mentionMatch) return []
    const query = mentionMatch.query.trim().toLowerCase()

    return mentionCandidates
      .filter((candidate) => {
        if (!query) return true
        return candidate.username.toLowerCase().includes(query)
          || candidate.fullName.toLowerCase().includes(query)
      })
      .slice(0, 5)
  }, [mentionCandidates, mentionMatch])

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text ?? '')
      inputRef.current?.focus()
    }
  }, [editingMessage])

  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus()
    }
  }, [replyTo])

  useEffect(() => {
    setActiveMentionIndex(0)
  }, [mentionMatch?.query, mentionSuggestions.length])

  const updateCaretPosition = () => {
    setCaretPosition(inputRef.current?.selectionStart ?? 0)
  }

  const handleTextChange = (value: string) => {
    setText(value)
    onTyping?.()
    requestAnimationFrame(updateCaretPosition)
  }

  const applyMention = (candidate: MentionCandidate) => {
    if (!mentionMatch) return
    const nextText = `${text.slice(0, mentionMatch.start)}@${candidate.username} ${text.slice(mentionMatch.end)}`
    const nextCaret = mentionMatch.start + candidate.username.length + 2
    setText(nextText)
    setCaretPosition(nextCaret)

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed) return

    if (editingMessage) {
      onSaveEdit(editingMessage.id, trimmed)
      setText('')
      onCancelEdit()
    } else {
      onSend(trimmed, replyTo?.id)
      setText('')
      onCancelReply()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveMentionIndex((prev) => (prev + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const candidate = mentionSuggestions[activeMentionIndex] ?? mentionSuggestions[0]
        if (candidate) {
          applyMention(candidate)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCaretPosition(-1)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      if (editingMessage) onCancelEdit()
      else if (replyTo) onCancelReply()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onUpload) {
      onUpload(file)
    }
    e.target.value = ''
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Reply / Edit indicator */}
      {(replyTo || editingMessage) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary-500">
              {editingMessage ? 'Редактирование' : `Ответ на ${replyTo?.sender_name}`}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {(editingMessage ?? replyTo)?.text ?? '📎 Вложение'}
            </p>
          </div>
          <button
            onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        {onUpload && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
              title="Прикрепить файл"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
          </>
        )}

        <div className="relative flex-1">
          {mentionSuggestions.length > 0 && mentionMatch && (
            <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
              {mentionSuggestions.map((candidate, index) => (
                <button
                  key={candidate.userId}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applyMention(candidate)
                  }}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors',
                    index === activeMentionIndex
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">@{candidate.username}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">{candidate.fullName}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={updateCaretPosition}
            onKeyUp={updateCaretPosition}
            onSelect={updateCaretPosition}
            placeholder="Сообщение..."
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-600',
              'bg-gray-50 dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'max-h-32',
            )}
            style={{ minHeight: '40px' }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className={cn(
            'p-2.5 rounded-xl transition-colors',
            text.trim()
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400',
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export default memo(MessageInput)

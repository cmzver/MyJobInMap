import { useState } from 'react'
import toast from 'react-hot-toast'
import { MessagesSquare } from 'lucide-react'
import Modal from '@/components/Modal'
import { useConversations, useSendMessage } from '@/hooks/useChat'

interface Props {
  isOpen: boolean
  onClose: () => void
  taskId: number
  taskTitle?: string
}

/** Модалка «Отправить заявку в чат»: выбор чата + опциональная подпись. */
export default function SendTaskToChatModal({ isOpen, onClose, taskId, taskTitle }: Props) {
  const { data: conversations, isLoading } = useConversations()
  const sendMessage = useSendMessage()
  const [caption, setCaption] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const handleSend = (conversationId: number) => {
    setSelectedId(conversationId)
    sendMessage.mutate(
      { conversationId, text: caption.trim() || undefined, taskId },
      {
        onSuccess: () => {
          toast.success('Заявка отправлена в чат')
          setCaption('')
          setSelectedId(null)
          onClose()
        },
        onError: () => {
          toast.error('Не удалось отправить')
          setSelectedId(null)
        },
      },
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Отправить заявку в чат" size="md">
      <div className="space-y-3">
        {taskTitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Заявка: <span className="font-medium text-gray-800 dark:text-gray-200">{taskTitle}</span>
          </p>
        )}

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Подпись (необязательно)…"
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Выберите чат:</div>
        <div className="max-h-[45vh] overflow-y-auto">
          {isLoading && <p className="py-6 text-center text-sm text-gray-400">Загрузка…</p>}
          {!isLoading && (conversations?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Нет доступных чатов</p>
          )}
          {conversations?.map((conv) => (
            <button
              key={conv.id}
              type="button"
              disabled={sendMessage.isPending}
              onClick={() => handleSend(conv.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700/50"
            >
              <MessagesSquare className="h-5 w-5 shrink-0 text-primary-500" />
              <span className="flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {conv.name || `Чат #${conv.id}`}
              </span>
              {sendMessage.isPending && selectedId === conv.id && (
                <span className="text-xs text-gray-400">Отправка…</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

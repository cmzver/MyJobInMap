import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Copy, Link2, Send } from 'lucide-react'
import apiClient from '@/api/client'
import type { components } from '@/types/api.generated'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { useConfirm } from '@/hooks/useConfirm'

type StatusLink = components['schemas']['TaskStatusLink']

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showApiSuccess('Скопировано')
  } catch {
    showApiError(null, 'Не удалось скопировать — выделите ссылку вручную')
  }
}

/** Ссылка заявителю на страницу статуса заявки (и подписка на Telegram с неё). */
export default function StatusLinkButton({ taskId, phone }: { taskId: number; phone?: string | null }) {
  const confirmAction = useConfirm()
  const [link, setLink] = useState<StatusLink | null>(null)
  const issue = useMutation({
    mutationFn: async (renew: boolean = false) =>
      (await apiClient.post<StatusLink>(`/tasks/${taskId}/status-link`, null, { params: { renew } })).data,
    onSuccess: setLink,
    onError: (error) => showApiError(error, 'Не удалось получить ссылку'),
  })
  const message = link ? `Статус вашей заявки: ${link.url}` : ''
  const digits = (phone ?? '').replace(/\D/g, '')

  return (
    <>
      <Button variant="outline" size="sm" isLoading={issue.isPending} onClick={() => issue.mutate(false)}>
        <Link2 className="mr-2 h-4 w-4" />
        Ссылка заявителю
      </Button>
      {link && (
        <Modal isOpen onClose={() => setLink(null)} title="Ссылка заявителю" size="sm">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            По ссылке видно, что с заявкой: статус, плановая дата, акты — без внутренних комментариев.
            {link.telegram_url && ' Оттуда же можно подписаться на уведомления в Telegram.'}
          </p>
          <p className="mt-3 select-all break-all rounded-lg bg-gray-50 p-3 text-sm text-gray-900 dark:bg-gray-900 dark:text-white">
            {link.url}
          </p>
          {link.subscribers > 0 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Подписаны в Telegram: {link.subscribers}</p>
          )}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Ссылка перестанет работать через 30 дней после закрытия заявки.{' '}
            <button
              type="button"
              className="text-red-600 hover:underline dark:text-red-400"
              onClick={async () => {
                const ok = await confirmAction({
                  title: 'Выпустить новую ссылку?',
                  message: 'Старая перестанет открываться, подписки Telegram отключатся.',
                  confirmText: 'Выпустить',
                  danger: true,
                })
                if (ok) issue.mutate(true)
              }}
            >
              Выпустить новую
            </button>
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {digits.length >= 10 && (
              <a
                href={`sms:+${digits.length === 10 ? `7${digits}` : digits}?body=${encodeURIComponent(message)}`}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Send className="mr-1.5 h-4 w-4" />
                SMS с телефона
              </a>
            )}
            <Button variant="secondary" onClick={() => copy(link.url)}>
              <Copy className="mr-1.5 h-4 w-4" />
              Скопировать
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

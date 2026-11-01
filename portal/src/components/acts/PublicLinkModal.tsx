import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import { hasActiveLink } from '@/components/acts/actLabels'
import { useCreatePublicLink } from '@/hooks/useActs'
import type { Act, ActPublicLink } from '@/api/acts'
import { formatDateOnly } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'

/** Ссылка клиенту: подписать акт без входа или забрать PDF подписанного. */
export default function PublicLinkModal({ act, onClose }: { act: Act; onClose: () => void }) {
  const createLink = useCreatePublicLink()
  const [link, setLink] = useState<ActPublicLink | null>(null)
  const active = hasActiveLink(act)

  const issue = () =>
    createLink.mutate(act.id, {
      onSuccess: setLink,
      onError: (error) => showApiError(error, 'Не удалось получить ссылку'),
    })

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      showApiSuccess('Ссылка скопирована')
    } catch {
      showApiError(null, 'Скопируйте ссылку вручную')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Ссылка клиенту — акт №${act.number}`} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {act.status === 'pending_signature'
            ? 'Клиент откроет акт без входа, проверит работы и распишется на экране. Подписанный акт появится здесь сразу.'
            : 'Клиент откроет акт без входа и скачает PDF — свой экземпляр.'}
        </p>
        {link ? (
          <>
            <Input readOnly value={link.url} onFocus={(event) => event.target.select()} className="font-mono text-xs" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Действует до {formatDateOnly(link.expires_at)}. Ссылка показывается один раз — отправьте её клиенту
              сейчас.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Открыть
              </a>
              <Button onClick={copy}>
                <Copy className="mr-1.5 h-4 w-4" />
                Скопировать
              </Button>
            </div>
          </>
        ) : (
          <>
            {active && act.public_link_expires_at && (
              <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                Ссылка уже выдана и действует до {formatDateOnly(act.public_link_expires_at)}. Новая заменит её — прежняя
                перестанет открываться.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Отмена
              </Button>
              <Button isLoading={createLink.isPending} onClick={issue}>
                {active ? 'Новая ссылка' : 'Получить ссылку'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

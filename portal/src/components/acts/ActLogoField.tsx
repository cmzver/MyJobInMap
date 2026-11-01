import { useRef } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import { useActLogo, useActLogoUrl } from '@/hooks/useOrganizationSettings'
import { showApiError } from '@/utils/apiError'

/** Логотип в шапке акта: сохраняется сразу, без кнопки «Сохранить» формы. */
export default function ActLogoField({
  organizationId,
  hasLogo,
}: {
  organizationId?: number
  hasLogo: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const { upload, remove } = useActLogo(organizationId)
  const { data: logoUrl } = useActLogoUrl(organizationId, hasLogo)

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Логотип</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-900">
          {hasLogo && logoUrl ? (
            <img src={logoUrl} alt="Логотип организации" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400">нет логотипа</span>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              upload.mutate(file, { onError: (error) => showApiError(error, 'Не удалось загрузить логотип') })
            }
          }}
        />
        <Button size="sm" variant="secondary" isLoading={upload.isPending} onClick={() => input.current?.click()}>
          <ImagePlus className="mr-1.5 h-4 w-4" />
          {hasLogo ? 'Заменить' : 'Загрузить'}
        </Button>
        {hasLogo && (
          <Button
            size="sm"
            variant="ghost"
            isLoading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onError: (error) => showApiError(error, 'Не удалось убрать логотип') })}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Убрать
          </Button>
        )}
        <p className="w-full text-xs text-gray-500 dark:text-gray-400">PNG или JPG до 2 МБ, лучше на прозрачном фоне.</p>
      </div>
    </div>
  )
}

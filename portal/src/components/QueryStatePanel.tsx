import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'

import Button from '@/components/Button'
import Spinner from '@/components/Spinner'
import { cn } from '@/utils/cn'

type QueryState = 'loading' | 'error' | 'empty'

interface QueryStatePanelProps {
  state: QueryState
  title?: string
  description?: string
  icon?: LucideIcon
  onRetry?: () => void | Promise<unknown>
  isRetrying?: boolean
  className?: string
}

const defaults: Record<QueryState, { title: string; description: string }> = {
  loading: {
    title: 'Загружаем данные',
    description: 'Это обычно занимает несколько секунд.',
  },
  error: {
    title: 'Не удалось загрузить данные',
    description: 'Проверьте подключение и попробуйте ещё раз.',
  },
  empty: {
    title: 'Данных пока нет',
    description: 'Измените фильтры или вернитесь позже.',
  },
}

export default function QueryStatePanel({
  state,
  title = defaults[state].title,
  description = defaults[state].description,
  icon,
  onRetry,
  isRetrying = false,
  className,
}: QueryStatePanelProps) {
  const Icon = icon ?? (state === 'error' ? AlertTriangle : Inbox)

  return (
    <div
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
      aria-busy={state === 'loading'}
      className={cn(
        'flex min-h-[240px] items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-800',
        className,
      )}
    >
      <div className="max-w-sm">
        {state === 'loading' ? (
          <Spinner size="lg" className="mx-auto" />
        ) : (
          <Icon className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        )}
        <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
        {state === 'error' && onRetry && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={isRetrying}
            onClick={() => void onRetry()}
            className="mt-4"
          >
            {!isRetrying && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Повторить
          </Button>
        )}
      </div>
    </div>
  )
}

import { memo, ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
  /** Прежний флаг: карточки теперь всегда в одном (компактном) стиле. */
  compact?: boolean
  /** Без внутренних отступов — для таблицы во всю ширину карточки. */
  flush?: boolean
}

/** Карточка портала: рамка, заголовок-надзаголовок, отступ 16px. Одна на все экраны. */
function Card({ children, className, title, action, flush = false }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white transition-colors dark:border-gray-700 dark:bg-gray-800',
        flush && 'overflow-hidden',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
          {title && (
            <h3 className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
              {title}
            </h3>
          )}
          {action && <div className="max-w-full shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(!flush && 'p-4', flush && 'overflow-x-auto')}>{children}</div>
    </div>
  )
}

export default memo(Card)

import { memo, ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
  compact?: boolean
}

function Card({ children, className, title, action, compact = false }: CardProps) {
  return (
    <div
      className={cn(
        compact
          ? 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors'
          : 'bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/30 transition-colors',
        className,
      )}
    >
      {(title || action) && (
        <div
          className={cn(
            'border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
            compact ? 'px-4 py-3' : 'px-6 py-4',
          )}
        >
          {title && (
            <h3
              className={cn(
                'min-w-0',
                compact
                  ? 'text-sm font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400'
                  : 'text-lg font-semibold text-gray-900 dark:text-white',
              )}
            >
              {title}
            </h3>
          )}
          {action && <div className="w-full sm:w-auto sm:shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(compact ? 'p-4' : 'p-6')}>
        {children}
      </div>
    </div>
  )
}

export default memo(Card)

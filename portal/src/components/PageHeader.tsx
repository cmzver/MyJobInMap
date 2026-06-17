import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/utils/cn'

interface PageHeaderProps {
  /** Заголовок. ReactNode — чтобы можно было встроить Badge рядом с текстом. */
  title: ReactNode
  /** Подзаголовок/описание под заголовком. */
  description?: ReactNode
  /** Иконка слева от заголовка (квадрат-бейдж, как в SettingsCard). */
  icon?: LucideIcon
  /** Кнопка «назад» перед заголовком (detail-страницы). */
  onBack?: () => void
  /** Кнопки/контролы справа. */
  actions?: ReactNode
  className?: string
}

/**
 * Единая шапка страницы портала — совпадает по виду с шапкой настроек
 * (`AdminSettingsPage`): заголовок `text-xl font-semibold`, описание под ним и
 * слот действий справа. Покрывает страницы-списки и detail-страницы
 * (через `onBack` и/или `icon`).
 */
export default function PageHeader({
  title,
  description,
  icon: Icon,
  onBack,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Назад"
            className="-ml-1 mt-0.5 flex-shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {Icon && (
          <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

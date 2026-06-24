import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  /** Необязательная подпись под значением (напр. «3 неисправно»). */
  note?: string
  /** Тон подписи — по умолчанию приглушённый серый; красный/primary для проблемных. */
  noteTone?: string
}

/**
 * Нейтральная карточка-метрика портала: один акцент, серая плашка-иконка
 * вместо «радуги» цветных чипов. Значение крупное, лейбл — `.eyebrow` сверху.
 */
function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  noteTone = 'text-gray-400 dark:text-gray-500',
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-colors dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow break-words">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
          {note && <p className={`mt-0.5 text-xs ${noteTone}`}>{note}</p>}
        </div>
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-300">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  )
}

export default memo(MetricCard)

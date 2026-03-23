import { memo } from 'react'
import { cn } from '@/utils/cn'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gray'
  className?: string
  compactContent?: React.ReactNode
  title?: string
}

function Badge({ children, variant = 'gray', className, compactContent, title }: BadgeProps) {
  const variants = {
    primary: 'bg-primary-100 text-primary-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-orange-100 text-orange-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-800',
  }

  return (
    <span
      aria-label={title}
      data-variant={variant}
      title={title}
      className={cn(
        'badge inline-flex max-w-full items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        compactContent ? 'badge-adaptive' : undefined,
        variants[variant],
        className
      )}
    >
      {compactContent ? (
        <>
          <span className="badge-full min-w-0 truncate">{children}</span>
          <span className="badge-compact" aria-hidden="true">
            {compactContent}
          </span>
        </>
      ) : (
        children
      )}
    </span>
  )
}

export default memo(Badge)

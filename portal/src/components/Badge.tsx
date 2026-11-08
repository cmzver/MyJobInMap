import { memo } from 'react'
import { cn } from '@/utils/cn'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gray'
  className?: string
  title?: string
}

function Badge({ children, variant = 'gray', className, title }: BadgeProps) {
  const variants = {
    primary: 'bg-primary-100 text-primary-800',
    success: 'bg-green-100 text-green-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
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
        'badge inline-flex h-5 max-w-full border border-transparent items-center whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export default memo(Badge)

import { TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/utils/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2',
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
            'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed',
            'min-h-[100px] resize-y',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export default Textarea

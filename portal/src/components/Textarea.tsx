import { TextareaHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/utils/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    const generatedId = useId()
    const textareaId = props.id ?? generatedId
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="field-label">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          className={cn('field', error && 'border-red-500 focus:border-red-500 focus:ring-red-500', className)}
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

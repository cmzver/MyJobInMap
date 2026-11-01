import { SelectHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/utils/cn'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[]
  label?: string
  error?: string
  placeholder?: string
  onChange?: (value: string) => void
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, label, error, placeholder, onChange, value, ...props }, ref) => {
    const generatedId = useId()
    const selectId = props.id ?? generatedId
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="field-label">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className={cn(
              'field cursor-pointer appearance-none pr-9',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="">{placeholder}</option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select

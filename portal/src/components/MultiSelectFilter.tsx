import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectFilterProps {
  label: string
  options: MultiSelectOption[]
  selectedValues: string[]
  placeholder: string
  onChange: (values: string[]) => void
  className?: string
}

export default function MultiSelectFilter({
  label,
  options,
  selectedValues,
  placeholder,
  onChange,
  className,
}: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectedLabels = useMemo(
    () =>
      options
        .filter((option) => selectedValues.includes(option.value))
        .map((option) => option.label),
    [options, selectedValues],
  )

  const summary = useMemo(() => {
    if (selectedLabels.length === 0) return placeholder
    if (selectedLabels.length <= 2) return selectedLabels.join(', ')
    return `${selectedLabels[0]}, ${selectedLabels[1]} +${selectedLabels.length - 2}`
  }, [placeholder, selectedLabels])

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value))
      return
    }

    onChange([...selectedValues, value])
  }

  const clearAll = () => {
    onChange([])
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          {label}
        </span>
        {selectedValues.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-medium text-primary-600 transition hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Сброс
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 text-left transition',
          'hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500',
        )}
      >
        <span
          className={cn(
            'truncate text-sm',
            selectedValues.length > 0
              ? 'text-gray-900 dark:text-white'
              : 'text-gray-400 dark:text-gray-500',
          )}
        >
          {summary}
        </span>
        <div className="flex items-center gap-2">
          {selectedValues.length > 0 && (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
              {selectedValues.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-gray-400 transition-transform dark:text-gray-500',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-30 mt-2 w-full min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {options.length > 0 ? (
              options.map((option) => {
                const checked = selectedValues.includes(option.value)

                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                      checked
                        ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/70',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(option.value)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </label>
                )
              })
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Нет доступных вариантов</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useRef, useEffect, useCallback, useId } from 'react'

/**
 * Поле с подсказками.
 *
 * По умолчанию подсказки — строки: выбор подставляет текст в поле. Для
 * подсказок-объектов (адрес из справочника) — getLabel/getHint для показа и
 * onSelect, который сам решает, что заполнить.
 */
interface AutocompleteProps<T> {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  fetchSuggestions: (query: string) => Promise<T[]>
  getLabel?: (item: T) => string
  /** Вторая строка подсказки (серым). */
  getHint?: (item: T) => string | undefined
  /** Выбор подсказки; без него в поле подставляется getLabel(item). */
  onSelect?: (item: T) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  debounceMs?: number
  minChars?: number
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
}

const defaultLabel = (item: unknown) => String(item)

export function Autocomplete<T = string>({
  id,
  label,
  value,
  onChange,
  fetchSuggestions,
  getLabel = defaultLabel,
  getHint,
  onSelect,
  placeholder = '',
  required = false,
  disabled = false,
  autoFocus = false,
  debounceMs = 300,
  minChars = 1,
  className = '',
  inputRef: externalInputRef,
}: AutocompleteProps<T>) {
  const [suggestions, setSuggestions] = useState<T[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ответ на устаревший запрос не должен перебить свежий
  const requestRef = useRef(0)
  const listId = useId()

  const setInputRef = (node: HTMLInputElement | null) => {
    inputRef.current = node
    if (typeof externalInputRef === 'function') externalInputRef(node)
    else if (externalInputRef) (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node
  }

  const loadSuggestions = useCallback(
    async (query: string) => {
      const request = ++requestRef.current
      if (query.trim().length < minChars) {
        setSuggestions([])
        setIsOpen(false)
        return
      }
      setIsLoading(true)
      try {
        const results = await fetchSuggestions(query)
        if (request !== requestRef.current) return
        setSuggestions(results)
        setIsOpen(results.length > 0)
        setHighlightedIndex(-1)
      } catch (error) {
        if (import.meta.env.DEV) console.error('Autocomplete fetch error:', error)
        if (request === requestRef.current) setSuggestions([])
      } finally {
        if (request === requestRef.current) setIsLoading(false)
      }
    },
    [fetchSuggestions, minChars],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadSuggestions(newValue), debounceMs)
  }

  const selectSuggestion = (item: T) => {
    requestRef.current++ // запрос в полёте больше не нужен
    if (onSelect) onSelect(item)
    else onChange(getLabel(item))
    setSuggestions([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        // Выбор подсказки; без выделения Enter отправляет форму как обычно
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length && !e.shiftKey) {
          e.preventDefault()
          selectSuggestion(suggestions[highlightedIndex]!)
        } else {
          setIsOpen(false)
        }
        break
      case 'Tab':
        setIsOpen(false)
        break
      case 'Escape':
        // Закрыть список, а не всё окно: Modal слушает keydown на document
        e.stopPropagation()
        e.nativeEvent.stopPropagation()
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      item?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [highlightedIndex])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const showList = isOpen && suggestions.length > 0

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          ref={setInputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.trim().length >= minChars && loadSuggestions(value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          className="field pr-8"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {showList && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full min-w-[14rem] overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700"
        >
          {suggestions.map((item, index) => {
            const text = getLabel(item)
            const hint = getHint?.(item)
            return (
              <li
                key={`${text}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                // mousedown, а не click: поле не успевает потерять фокус
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectSuggestion(item)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`cursor-pointer px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ${
                  index === highlightedIndex ? 'bg-primary-100 dark:bg-primary-900/40' : ''
                }`}
              >
                <div className="truncate">{text}</div>
                {hint && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { MapPin, Loader2, X, Building2 } from 'lucide-react'
import { useAddressSearch } from '@/hooks/useAddresses'
import type { AddressSearchResult } from '@/types/address'

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (address: AddressSearchResult) => void
  placeholder?: string
  error?: string
  label?: string
  disabled?: boolean
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Введите адрес...',
  error,
  label,
  disabled = false,
}: AddressAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external value
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Search query
  const { data: suggestions = [], isLoading } = useAddressSearch(inputValue, isOpen && inputValue.length >= 2)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    setIsOpen(true)
  }

  const handleSelect = (address: AddressSearchResult) => {
    setInputValue(address.address)
    onChange(address.address)
    onSelect?.(address)
    setIsOpen(false)
  }

  const handleClear = () => {
    setInputValue('')
    onChange('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full pl-10 pr-10 py-2 
            border rounded-lg
            text-gray-900 dark:text-white
            bg-white dark:bg-gray-700
            placeholder:text-gray-500 dark:placeholder:text-gray-400
            focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
            ${error 
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
              : 'border-gray-300 dark:border-gray-600'
            }
          `}
        />
        
        {/* Loading / Clear button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          ) : inputValue && !disabled ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((address) => (
            <button
              key={address.id}
              type="button"
              onClick={() => handleSelect(address)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {address.address}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {address.entrance_count && (
                      <span>{address.entrance_count} подъезд(а)</span>
                    )}
                    {address.floor_count && (
                      <span>{address.floor_count} этаж(ей)</span>
                    )}
                    {address.has_intercom && address.intercom_code && (
                      <span>Код: {address.intercom_code}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && inputValue.length >= 2 && !isLoading && suggestions.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Адрес не найден в базе
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Введите адрес вручную или добавьте его в базу
          </p>
        </div>
      )}
    </div>
  )
}

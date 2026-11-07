import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { addressesApi } from '@/api/addresses'
import Card from '@/components/Card'
import Input from '@/components/Input'
import { Autocomplete } from '@/components/Autocomplete'
import { splitUnitParts } from '@/utils/addressMatch'
import { cn } from '@/utils/cn'
import type { Address, AddressSearchResult, AddressSuggestion } from '@/types/address'

/**
 * Адрес в заявке.
 *
 * Диспетчер обычно получает адрес целиком («ветеранов 46, под 2, кв 15»),
 * поэтому сверху — одна строка поиска: свои объекты первыми, затем
 * справочник; подъезд и квартира отделяются от запроса сами. Части адреса
 * под ней всегда доступны для правки — без каскада «сначала город».
 */

interface AddressFormData {
  city: string
  street: string
  building: string
  corpus: string
  entrance: string
  apartment: string
}

interface AddressFormProps {
  value: AddressFormData
  onChange: (data: AddressFormData) => void
  onAddressFound?: (address: Address | null) => void
  errors?: Partial<Record<keyof AddressFormData, string>>
  /** Объект из базы, найденный по частям адреса (страница ищет сама) */
  matched?: AddressSearchResult | null
}

const MAX_ENTRANCE_CHIPS = 12

export default function AddressForm({ value, onChange, onAddressFound, errors = {}, matched }: AddressFormProps) {
  const [search, setSearch] = useState('')
  // Подъезд/квартира из последнего запроса — подставим при выборе подсказки
  const unitsRef = useRef({ entrance: '', apartment: '' })

  const set = (patch: Partial<AddressFormData>) => onChange({ ...value, ...patch })

  const fetchSuggestions = (query: string) => {
    const split = splitUnitParts(query)
    unitsRef.current = { entrance: split.entrance, apartment: split.apartment }
    if (split.query.length < 3) return Promise.resolve([] as AddressSuggestion[])
    return addressesApi.suggestAddress(split.query)
  }

  const handlePick = async (item: AddressSuggestion) => {
    const units = unitsRef.current
    let parts = {
      city: item.city || '',
      street: item.street || '',
      building: item.building || '',
      corpus: item.corpus || '',
    }
    if (!parts.street) {
      // Старая запись без разобранных частей — разбираем строку
      try {
        const parsed = await addressesApi.parseAddress(item.value)
        parts = {
          city: parsed.city || '',
          street: parsed.street || '',
          building: parsed.building || '',
          corpus: parsed.corpus || '',
        }
      } catch {
        // оставим как есть — части можно поправить руками
      }
    }
    // Другой дом — подъезд и квартира прошлого адреса к нему не относятся
    onChange({ ...parts, entrance: units.entrance, apartment: units.apartment })
    if (item.address_id) onAddressFound?.({ id: item.address_id } as Address)
    setSearch('')
  }

  const entranceCount = matched?.entrance_count ?? 0
  const entranceChips =
    entranceCount > 1 && entranceCount <= MAX_ENTRANCE_CHIPS
      ? Array.from({ length: entranceCount }, (_, index) => String(index + 1))
      : []

  return (
    <Card title="Адрес объекта">
      <div className="space-y-4">
        <div>
          <Autocomplete<AddressSuggestion>
            id="task-address-search"
            label="Найти адрес"
            value={search}
            onChange={setSearch}
            fetchSuggestions={fetchSuggestions}
            getLabel={(item) => item.value}
            getHint={(item) => (item.source === 'base' ? 'объект в базе' : undefined)}
            onSelect={handlePick}
            placeholder="Как диктуют: ветеранов 46 под 2 кв 15"
            minChars={3}
            debounceMs={350}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Сначала — объекты из базы, затем справочник адресов. Подъезд и квартиру можно написать сразу.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Autocomplete
              id="task-city"
              label="Город *"
              value={value.city}
              onChange={(city) => set({ city })}
              fetchSuggestions={(q) => addressesApi.autocompleteCities(q)}
              placeholder="Санкт-Петербург"
              minChars={2}
            />
            {errors.city && <p className="mt-1 text-sm text-red-500">{errors.city}</p>}
          </div>
          <div>
            <Autocomplete
              id="task-street"
              label="Улица *"
              value={value.street}
              onChange={(street) => set({ street })}
              fetchSuggestions={(q) => addressesApi.autocompleteStreets(q, value.city || undefined)}
              placeholder="пр-кт Ветеранов"
              minChars={2}
            />
            {errors.street && <p className="mt-1 text-sm text-red-500">{errors.street}</p>}
          </div>
          <Input
            label="Дом *"
            value={value.building}
            onChange={(e) => set({ building: e.target.value })}
            placeholder="46"
            error={errors.building}
          />
          <Input
            label="Корпус"
            value={value.corpus === 'none' ? '' : value.corpus}
            onChange={(e) => set({ corpus: e.target.value })}
            placeholder="—"
          />
          <Input
            label="Подъезд"
            value={value.entrance}
            onChange={(e) => set({ entrance: e.target.value })}
            placeholder={entranceCount ? `1–${entranceCount}` : '—'}
            inputMode="numeric"
          />
          <Input
            label="Квартира"
            value={value.apartment}
            onChange={(e) => set({ apartment: e.target.value })}
            placeholder="—"
          />
        </div>

        {entranceChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Подъезд">
            <span className="mr-1 text-xs text-gray-500 dark:text-gray-400">Подъезд:</span>
            {entranceChips.map((entrance) => (
              <button
                key={entrance}
                type="button"
                onClick={() => set({ entrance: value.entrance === entrance ? '' : entrance })}
                aria-pressed={value.entrance === entrance}
                className={cn(
                  'h-8 min-w-8 rounded-md border px-2 text-sm transition-colors',
                  value.entrance === entrance
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {entrance}
              </button>
            ))}
          </div>
        )}

        {matched && (
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800/60">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="text-gray-700 dark:text-gray-200">
                Объект в базе:{' '}
                <Link
                  to={`/addresses/${matched.id}`}
                  target="_blank"
                  className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  {matched.address}
                </Link>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {[
                  matched.entrance_count ? `подъездов: ${matched.entrance_count}` : null,
                  matched.floor_count ? `этажей: ${matched.floor_count}` : null,
                  matched.intercom_code ? `код домофона: ${matched.intercom_code}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Системы и история заявок подтянутся ниже'}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

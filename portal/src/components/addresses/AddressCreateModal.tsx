import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, Wand2 } from 'lucide-react'
import Modal from '@/components/Modal'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Textarea from '@/components/Textarea'
import Button from '@/components/Button'
import { Autocomplete } from '@/components/Autocomplete'
import { addressesApi } from '@/api/addresses'
import { useCreateAddress } from '@/hooks/useAddresses'
import { useCounterparties } from '@/hooks/useCounterparties'
import { getApiErrorMessage } from '@/utils/apiError'
import { isSameHouse, streetKey } from '@/utils/addressMatch'
import type { Address, AddressSuggestion, CreateAddressData } from '@/types/address'

/**
 * Добавление адреса — прежняя раскладка формы (полный адрес ↔ части,
 * здание, УК, заметки), переработанная под частый ввод:
 * - без флажков «лифт/домофон»: домофон есть, если указан код;
 * - контрагент выбирается сразу и запоминается, «Название УК» — по нему;
 * - предупреждение, если такой дом уже есть в базе;
 * - «Добавить и следующий» (Shift+Enter) — форма очищается, город и
 *   контрагент остаются, курсор — снова в адресе.
 */

type Parts = { city: string; street: string; building: string; corpus: string; entrance: string }

const EMPTY_PARTS: Parts = { city: '', street: '', building: '', corpus: '', entrance: '' }
const LAST_COUNTERPARTY_KEY = 'address-create:counterparty'
const LAST_UK_KEY = 'address-create:management-company'
const PARSE_DELAY_MS = 600

interface AddressCreateModalProps {
  isOpen: boolean
  onClose: () => void
  /** Предзаполнение (переход из формы заявки). */
  initial?: Partial<CreateAddressData> | null
  /** После «Добавить» (не «и следующий»). */
  onCreated?: (address: Address) => void
}

export default function AddressCreateModal({ isOpen, onClose, initial, onCreated }: AddressCreateModalProps) {
  const createMutation = useCreateAddress()
  const { data: counterparties = [] } = useCounterparties()
  const addressRef = useRef<HTMLInputElement>(null)

  const [address, setAddress] = useState('')
  const [parts, setParts] = useState<Parts>(EMPTY_PARTS)
  const [isParsing, setIsParsing] = useState(false)
  const [counterpartyId, setCounterpartyId] = useState('')
  const [managementCompany, setManagementCompany] = useState('')
  const [entranceCount, setEntranceCount] = useState('')
  const [floorCount, setFloorCount] = useState('')
  const [apartmentCount, setApartmentCount] = useState('')
  const [intercomCode, setIntercomCode] = useState('')
  const [managementPhone, setManagementPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [duplicates, setDuplicates] = useState<Address[]>([])
  // Точка дома из справочника; без неё сервер геокодирует адрес сам
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [addedCount, setAddedCount] = useState(0)

  // Адрес собран из частей — не разбирать его обратно
  const skipParseRef = useRef(false)

  // Открытие: предзаполнение и запомненный контрагент / УК
  useEffect(() => {
    if (!isOpen) return
    const remembered = localStorage.getItem(LAST_COUNTERPARTY_KEY) ?? ''
    setAddress(initial?.address ?? '')
    setParts({
      city: initial?.city ?? '',
      street: initial?.street ?? '',
      building: initial?.building ?? '',
      corpus: initial?.corpus ?? '',
      entrance: initial?.entrance ?? '',
    })
    setCounterpartyId(initial?.counterparty_id ? String(initial.counterparty_id) : remembered)
    setManagementCompany(initial?.management_company ?? localStorage.getItem(LAST_UK_KEY) ?? '')
    setEntranceCount(initial?.entrance_count ? String(initial.entrance_count) : '')
    setFloorCount(initial?.floor_count ? String(initial.floor_count) : '')
    setApartmentCount(initial?.apartment_count ? String(initial.apartment_count) : '')
    setIntercomCode(initial?.intercom_code ?? '')
    setManagementPhone(initial?.management_phone ?? '')
    setNotes(initial?.notes ?? '')
    setDuplicates([])
    setCoords(null)
    setAddedCount(0)
    skipParseRef.current = Boolean(initial?.street)
  }, [isOpen, initial])

  // Запомненный контрагент мог исчезнуть из списка
  const selectedCounterparty = counterparties.find((item) => String(item.id) === counterpartyId)
  const effectiveCounterpartyId = selectedCounterparty ? counterpartyId : ''

  // Полный адрес → части (с задержкой, пока человек печатает)
  useEffect(() => {
    if (!isOpen) return
    if (skipParseRef.current) {
      skipParseRef.current = false
      return
    }
    const value = address.trim()
    if (value.length < 3) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsParsing(true)
      try {
        const parsed = await addressesApi.parseAddress(value)
        if (cancelled) return
        setParts((prev) => ({
          city: parsed.city || prev.city,
          street: parsed.street || prev.street,
          building: parsed.building || prev.building,
          corpus: parsed.corpus || '',
          entrance: parsed.entrance || '',
        }))
      } catch {
        // разбор — подсказка; без него адрес сохранится строкой
      } finally {
        if (!cancelled) setIsParsing(false)
      }
    }, PARSE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [address, isOpen])

  // Такой дом уже есть? Ищем по улице и сверяем дом/корпус
  useEffect(() => {
    if (!isOpen || !parts.street || !parts.building) {
      setDuplicates([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // Ищем по имени улицы без «ул./пр.»: в базе тип может стоять с другой стороны
        const found = await addressesApi.getAddresses({ search: streetKey(parts.street), size: 50 })
        if (cancelled) return
        setDuplicates(
          found.items
            .filter((item) =>
              isSameHouse(item, { street: parts.street, building: parts.building, corpus: parts.corpus }),
            )
            .slice(0, 3),
        )
      } catch {
        if (!cancelled) setDuplicates([])
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, parts.street, parts.building, parts.corpus])

  // Адрес набирают руками — координаты прошлой подсказки к нему не относятся
  const handleAddressTyped = (value: string) => {
    setAddress(value)
    setCoords(null)
  }

  // Выбор подсказки: части и точка — из справочника, строка — в стиле базы
  const handlePickSuggestion = async (item: AddressSuggestion) => {
    const picked: Parts = {
      city: item.city ?? '',
      street: item.street ?? '',
      building: item.building ?? '',
      corpus: item.corpus ?? '',
      entrance: '',
    }
    clearTimeout(composeTimerRef.current)
    setCoords(item.lat != null && item.lon != null ? { lat: item.lat, lon: item.lon } : null)
    if (!picked.street) {
      // Старая запись без разобранных частей — пусть адрес разберётся, как при вставке
      setAddress(item.value)
      return
    }
    skipParseRef.current = true
    setParts(picked)
    setAddress(item.value)

    try {
      const composed = await addressesApi.composeAddress(picked)
      if (composed.address && composed.address !== item.value) {
        skipParseRef.current = true
        setAddress(composed.address)
      }
    } catch {
      // остаётся строка из справочника
    }

    // Точку дома DaData отдаёт на точный запрос по выбранному адресу
    if (item.source === 'dadata' && item.lat == null && item.unrestricted_value && picked.building) {
      try {
        const [exact] = await addressesApi.suggestAddress(item.unrestricted_value, 1)
        if (exact?.lat != null && exact.lon != null) setCoords({ lat: exact.lat, lon: exact.lon })
      } catch {
        // без точки: сервер найдёт её своим геокодером
      }
    }
  }

  // Части → полный адрес
  const composeTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(composeTimerRef.current), [])
  const handlePartChange = (field: keyof Parts, value: string) => {
    const next = { ...parts, [field]: value }
    setParts(next)
    setCoords(null)
    clearTimeout(composeTimerRef.current)
    composeTimerRef.current = setTimeout(async () => {
      try {
        const result = await addressesApi.composeAddress(next)
        if (result.address) {
          skipParseRef.current = true
          setAddress(result.address)
        }
      } catch {
        // оставляем строку как есть
      }
    }, PARSE_DELAY_MS)
  }

  const resetForNext = () => {
    skipParseRef.current = true
    setAddress('')
    // Город и контрагент обычно те же — оставляем
    setParts((prev) => ({ ...EMPTY_PARTS, city: prev.city }))
    setEntranceCount('')
    setFloorCount('')
    setApartmentCount('')
    setIntercomCode('')
    setNotes('')
    setDuplicates([])
    setCoords(null)
    requestAnimationFrame(() => addressRef.current?.focus())
  }

  const toNumber = (value: string) => (value.trim() ? Number(value) : undefined)

  const submit = (andNext: boolean) => {
    if (createMutation.isPending) return
    const value = address.trim()
    if (!value) {
      toast.error('Введите адрес')
      addressRef.current?.focus()
      return
    }
    const payload: CreateAddressData = {
      address: value,
      city: parts.city || undefined,
      street: parts.street || undefined,
      building: parts.building || undefined,
      corpus: parts.corpus || undefined,
      entrance: parts.entrance || undefined,
      lat: coords?.lat,
      lon: coords?.lon,
      entrance_count: toNumber(entranceCount) ?? null,
      floor_count: toNumber(floorCount) ?? null,
      apartment_count: toNumber(apartmentCount),
      intercom_code: intercomCode.trim() || undefined,
      // Флажков в форме нет: домофон есть, если указан код
      has_elevator: false,
      has_intercom: Boolean(intercomCode.trim()),
      counterparty_id: effectiveCounterpartyId ? Number(effectiveCounterpartyId) : undefined,
      management_company: effectiveCounterpartyId ? undefined : managementCompany.trim() || undefined,
      management_phone: managementPhone.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    createMutation.mutate(payload, {
      onSuccess: (created) => {
        localStorage.setItem(LAST_COUNTERPARTY_KEY, effectiveCounterpartyId)
        if (!effectiveCounterpartyId) localStorage.setItem(LAST_UK_KEY, managementCompany.trim())
        if (created.lat == null || created.lon == null || (created.lat === 0 && created.lon === 0)) {
          toast(`«${created.address}» добавлен, но точка на карте не найдена — уточните адрес в карточке`, {
            icon: '⚠️',
            duration: 6000,
          })
        } else {
          toast.success(`«${created.address}» добавлен`)
        }
        if (andNext) {
          setAddedCount((count) => count + 1)
          resetForNext()
        } else {
          onCreated?.(created)
          onClose()
        }
      },
      onError: (error) => toast.error(getApiErrorMessage(error, 'Не удалось добавить адрес')),
    })
  }

  const counterpartyOptions = [
    { value: '', label: 'Не выбран' },
    ...counterparties.map((item) => ({ value: String(item.id), label: item.name })),
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={addedCount > 0 ? `Новый адрес · добавлено ${addedCount}` : 'Новый адрес'}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault()
            submit(true)
          }
        }}
      >
        <div className="space-y-6">
          {/* Основная информация */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Основная информация</h4>
              {isParsing && (
                <span className="flex items-center gap-1 text-xs text-primary-500">
                  <Wand2 className="h-3 w-3 animate-pulse" />
                  Разбираю адрес…
                </span>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <Autocomplete<AddressSuggestion>
                  id="create-address"
                  inputRef={addressRef}
                  label="Полный адрес *"
                  value={address}
                  onChange={handleAddressTyped}
                  fetchSuggestions={(q) => addressesApi.suggestAddress(q)}
                  getLabel={(item) => item.value}
                  getHint={(item) => (item.source === 'base' ? 'уже есть в базе' : undefined)}
                  onSelect={handlePickSuggestion}
                  placeholder="Начните вводить: спб ветеранов 46"
                  minChars={3}
                  debounceMs={350}
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Выберите адрес из подсказок — город, улица, дом и точка на карте заполнятся сами.
                  Можно и вставить адрес целиком или заполнить поля ниже.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Autocomplete
                  id="create-city"
                  label="Город"
                  value={parts.city}
                  onChange={(value) => handlePartChange('city', value)}
                  fetchSuggestions={(q) => addressesApi.autocompleteCities(q)}
                  placeholder="СПб"
                  minChars={1}
                />
                <Autocomplete
                  id="create-street"
                  label="Улица"
                  value={parts.street}
                  onChange={(value) => handlePartChange('street', value)}
                  fetchSuggestions={(q) => addressesApi.autocompleteStreets(q, parts.city || undefined)}
                  placeholder="Невский пр."
                  minChars={1}
                />
                <Autocomplete
                  id="create-building"
                  label="Дом"
                  value={parts.building}
                  onChange={(value) => handlePartChange('building', value)}
                  fetchSuggestions={(q) =>
                    addressesApi.autocompleteBuildings(q, parts.city || undefined, parts.street || undefined)
                  }
                  placeholder="1"
                  minChars={1}
                />
                <Input
                  label="Корпус"
                  value={parts.corpus}
                  onChange={(e) => handlePartChange('corpus', e.target.value)}
                  placeholder="2"
                />
                <Input
                  label="Подъезд"
                  value={parts.entrance}
                  onChange={(e) => handlePartChange('entrance', e.target.value)}
                  placeholder="1"
                />
              </div>

              {duplicates.length > 0 && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p>Похоже, этот дом уже есть в базе:</p>
                    <ul className="mt-0.5">
                      {duplicates.map((item) => (
                        <li key={item.id} className="truncate">
                          <Link
                            to={`/addresses/${item.id}`}
                            target="_blank"
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {item.address}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Информация о здании */}
          <section>
            <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Информация о здании</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input
                type="number"
                label="Подъездов"
                value={entranceCount}
                onChange={(e) => setEntranceCount(e.target.value)}
                min={1}
                max={50}
                placeholder="1"
              />
              <Input
                type="number"
                label="Этажей"
                value={floorCount}
                onChange={(e) => setFloorCount(e.target.value)}
                min={1}
                max={100}
                placeholder="1"
              />
              <Input
                type="number"
                label="Квартир"
                value={apartmentCount}
                onChange={(e) => setApartmentCount(e.target.value)}
                min={1}
              />
              <Input
                label="Код домофона"
                value={intercomCode}
                onChange={(e) => setIntercomCode(e.target.value)}
                placeholder="123#4567"
              />
            </div>
          </section>

          {/* Управляющая компания */}
          <section>
            <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Управляющая компания</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {counterparties.length > 0 && (
                <div className="sm:col-span-2">
                  <Select
                    label="Контрагент"
                    options={counterpartyOptions}
                    value={effectiveCounterpartyId}
                    onChange={setCounterpartyId}
                  />
                </div>
              )}
              <Input
                label="Название УК"
                value={selectedCounterparty ? selectedCounterparty.name : managementCompany}
                onChange={(e) => setManagementCompany(e.target.value)}
                placeholder="ООО «УК Пример»"
                disabled={Boolean(selectedCounterparty)}
              />
              <Input
                label="Телефон УК"
                value={managementPhone}
                onChange={(e) => setManagementPhone(e.target.value)}
                placeholder="+7 (812) 123-45-67"
              />
            </div>
          </section>

          <Textarea
            label="Заметки"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Вход со двора, ключ у консьержа…"
            rows={2}
          />
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-700">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              {addedCount > 0 ? 'Готово' : 'Отмена'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => submit(true)}
              disabled={createMutation.isPending}
            >
              Добавить и следующий
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              Добавить
            </Button>
          </div>
          <p className="mt-2 hidden text-right text-xs text-gray-400 dark:text-gray-500 sm:block">
            Shift+Enter — добавить и сразу ввести следующий
          </p>
        </div>
      </form>
    </Modal>
  )
}

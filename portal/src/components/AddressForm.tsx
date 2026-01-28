import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { addressesApi } from '@/api/addresses'
import Spinner from '@/components/Spinner'
import Card from '@/components/Card'
import type { Address } from '@/types/address'

interface AddressFormData {
  city: string
  street: string
  building: string
  corpus: string
  entrance: string
}

interface AddressFormProps {
  value: AddressFormData
  onChange: (data: AddressFormData) => void
  onAddressFound?: (address: Address | null) => void
  errors?: Partial<Record<keyof AddressFormData, string>>
}

export default function AddressForm({ value, onChange, onAddressFound, errors = {} }: AddressFormProps) {
  // Города
  const [cities, setCities] = useState<string[]>([])
  const [citiesOpen, setCitiesOpen] = useState(false)
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [citiesQuery, setCitiesQuery] = useState('')

  // Улицы
  const [streets, setStreets] = useState<string[]>([])
  const [streetsOpen, setStreetsOpen] = useState(false)
  const [streetsLoading, setStreetsLoading] = useState(false)
  const [streetsQuery, setStreetsQuery] = useState('')

  // Дома
  const [buildings, setBuildings] = useState<string[]>([])
  const [buildingsOpen, setBuildingsOpen] = useState(false)
  const [buildingsLoading, setBuildingsLoading] = useState(false)
  const [buildingsQuery, setBuildingsQuery] = useState('')

  // Корпусы (загружаются при выборе дома)
  const [corpuses, setCorpuses] = useState<string[]>([])
  const [corpusesOpen, setCorpusesOpen] = useState(false)
  const [corpusesLoading, setCorpusesLoading] = useState(false)

  // Подъезды (загружаются при выборе корпуса)
  const [entrances, setEntrances] = useState<string[]>([])
  const [entrancesOpen, setEntrancesOpen] = useState(false)
  const [entrancesLoading, setEntrancesLoading] = useState(false)

  // Флаг для отслеживания первой загрузки (режим редактирования)
  const initializedRef = useRef(false)

  // При редактировании - загружаем корпусы и подъезды при наличии данных
  useEffect(() => {
    // Если уже инициализировали или нет полного адреса - пропускаем
    if (initializedRef.current) return
    if (!value.city || !value.street || !value.building) return

    initializedRef.current = true

    // Загружаем корпусы
    addressesApi.autocompleteCorpus(value.city, value.street, value.building)
      .then((result) => {
        setCorpuses(result)
        
        // Если есть текущий корпус или нет корпусов - загружаем подъезды
        const corpusToUse = value.corpus || (result.length === 0 ? 'none' : result[0])
        if (corpusToUse) {
          addressesApi.autocompleteEntrance(value.city, value.street, value.building, corpusToUse === 'none' ? undefined : corpusToUse)
            .then((entranceResult) => {
              setEntrances(entranceResult)
            })
            .catch(() => setEntrances([]))
        }
      })
      .catch(() => setCorpuses([]))
  }, [value.city, value.street, value.building, value.corpus])

  // ===== Города =====
  const handleCityChange = useCallback(async (input: string) => {
    setCitiesQuery(input)
    if (input.length < 2) {
      setCities([])
      setCitiesOpen(false)
      return
    }

    setCitiesLoading(true)
    try {
      const result = await addressesApi.autocompleteCities(input.toLowerCase(), 10)
      setCities(result)
      setCitiesOpen(result.length > 0)
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching cities:', err)
      setCities([])
    } finally {
      setCitiesLoading(false)
    }
  }, [])

  const handleSelectCity = (city: string) => {
    onChange({ ...value, city, street: '', building: '', corpus: '', entrance: '' })
    setCities([])
    setCitiesQuery('')
    setCitiesOpen(false)
  }

  // ===== Улицы =====
  const handleStreetChange = useCallback(
    async (input: string) => {
      setStreetsQuery(input)
      if (input.length < 2 || !value.city) {
        setStreets([])
        setStreetsOpen(false)
        return
      }

      setStreetsLoading(true)
      try {
        const result = await addressesApi.autocompleteStreets(input.toLowerCase(), value.city, 10)
        setStreets(result)
        setStreetsOpen(result.length > 0)
      } catch (err) {
        if (import.meta.env.DEV) console.error('Error fetching streets:', err)
        setStreets([])
      } finally {
        setStreetsLoading(false)
      }
    },
    [value.city]
  )

  const handleSelectStreet = (street: string) => {
    onChange({ ...value, street, building: '', corpus: '', entrance: '' })
    setStreets([])
    setStreetsQuery('')
    setStreetsOpen(false)
  }

  // ===== Дома =====
  const handleBuildingChange = useCallback(
    async (input: string) => {
      setBuildingsQuery(input)
      if (input.length < 1 || !value.city || !value.street) {
        setBuildings([])
        setBuildingsOpen(false)
        return
      }

      setBuildingsLoading(true)
      try {
        const result = await addressesApi.autocompleteBuildings(input.toLowerCase(), value.city, value.street, 20)
        setBuildings(result)
        setBuildingsOpen(result.length > 0)
      } catch (err) {
        if (import.meta.env.DEV) console.error('Error fetching buildings:', err)
        setBuildings([])
      } finally {
        setBuildingsLoading(false)
      }
    },
    [value.city, value.street]
  )

  const handleSelectBuilding = (building: string) => {
    // Сразу обновляем building (синхронно)
    onChange({ ...value, building, corpus: '', entrance: '' })
    
    // Закрываем dropdown и очищаем поиск
    setBuildings([])
    setBuildingsQuery('')
    setBuildingsOpen(false)
    
    // Сбрасываем подъезды
    setEntrances([])
    
    // Загружаем доступные корпусы для выбранного дома
    setCorpusesLoading(true)
    setCorpuses([])
    
    // Сохраняем текущие значения для использования в callback
    const currentCity = value.city
    const currentStreet = value.street
    
    addressesApi
      .autocompleteCorpus(currentCity, currentStreet, building)
      .then((result) => {
        setCorpuses(result)
        
        if (result.length === 0) {
          // Нет корпусов - устанавливаем 'none'
          onChange({ city: currentCity, street: currentStreet, building, corpus: 'none', entrance: '' })
          loadEntrances(currentCity, currentStreet, building, undefined, 'none')
        } else if (result.length === 1) {
          // Один корпус - выбираем автоматически
          const singleCorpus = result[0]
          onChange({ city: currentCity, street: currentStreet, building, corpus: singleCorpus, entrance: '' })
          loadEntrances(currentCity, currentStreet, building, singleCorpus, singleCorpus)
        }
        // Если несколько корпусов - оставляем corpus пустым, ждём ручной выбор
      })
      .catch(() => {
        setCorpuses([])
      })
      .finally(() => {
        setCorpusesLoading(false)
      })
    
    // Попытаемся найти адрес в БД
    if (onAddressFound) {
      const fullAddress = [value.city, value.street, building].filter(Boolean).join(', ')
      addressesApi
        .searchAddresses(fullAddress, 1)
        .then((results) => {
          if (results.length > 0) {
            // Преобразуем AddressSearchResult в Address
            const address: Address = {
              id: results[0].id,
              address: results[0].address,
              city: value.city,
              street: value.street,
              building: building,
              corpus: value.corpus,
              entrance: value.entrance,
              lat: results[0].lat,
              lon: results[0].lon,
              entrance_count: results[0].entrance_count,
              floor_count: results[0].floor_count,
              apartment_count: null,
              has_elevator: null,
              has_intercom: results[0].has_intercom,
              intercom_code: results[0].intercom_code,
              management_company: null,
              management_phone: null,
              notes: null,
              extra_info: null,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
            onAddressFound(address)
          } else {
            onAddressFound(null)
          }
        })
        .catch(() => {
          onAddressFound(null)
        })
    }
  }

  // ===== Корпусы =====
  const handleSelectCorpus = (corpus: string) => {
    onChange({ ...value, corpus, entrance: '' })
    setCorpusesOpen(false)
    
    // Загружаем доступные подъезды для выбранного корпуса
    loadEntrances(value.city, value.street, value.building, corpus !== 'none' ? corpus : undefined, corpus)
  }
  
  // Helper функция для загрузки подъездов
  // Принимает все значения явно, чтобы избежать проблем с замыканием
  const loadEntrances = (city: string, street: string, building: string, corpusForApi?: string, corpusValue?: string) => {
    setEntrancesLoading(true)
    setEntrances([])
    addressesApi
      .autocompleteEntrance(city, street, building, corpusForApi)
      .then((result) => {
        setEntrances(result)
        // Если есть только один подъезд, выбираем его автоматически
        // Используем переданные значения, а не value из замыкания
        if (result.length === 1) {
          onChange({ 
            city, 
            street, 
            building, 
            corpus: corpusValue || corpusForApi || 'none', 
            entrance: result[0] 
          })
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.error('loadEntrances error:', err)
        setEntrances([])
      })
      .finally(() => {
        setEntrancesLoading(false)
      })
  }

  // ===== Подъезды =====
  const handleSelectEntrance = (entrance: string) => {
    onChange({ ...value, entrance })
    setEntrancesOpen(false)
  }

  return (
    <Card title="Адрес объекта">
      <div className="space-y-4">
        {/* Город */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Город <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Начните вводить название города..."
              value={citiesQuery || value.city}
              onChange={(e) => handleCityChange(e.target.value)}
              onFocus={() => citiesQuery && setCitiesOpen(true)}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                errors.city ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {citiesLoading && (
              <div className="absolute right-3 top-2.5">
                <Spinner size="sm" />
              </div>
            )}
            {citiesOpen && cities.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {cities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
          {errors.city && <p className="mt-1 text-sm text-red-500">{errors.city}</p>}
        </div>

        {/* Улица */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Улица <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={value.city ? 'Начните вводить название улицы...' : 'Сначала выберите город'}
              value={streetsQuery || value.street}
              onChange={(e) => handleStreetChange(e.target.value)}
              onFocus={() => streetsQuery && value.city && setStreetsOpen(true)}
              disabled={!value.city}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 dark:disabled:bg-gray-900 ${
                errors.street ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {streetsLoading && (
              <div className="absolute right-3 top-2.5">
                <Spinner size="sm" />
              </div>
            )}
            {streetsOpen && streets.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {streets.map((street) => (
                  <button
                    key={street}
                    type="button"
                    onClick={() => handleSelectStreet(street)}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {street}
                  </button>
                ))}
              </div>
            )}
          </div>
          {errors.street && <p className="mt-1 text-sm text-red-500">{errors.street}</p>}
        </div>

        {/* Дом */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Дом <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={value.street ? 'Номер дома...' : 'Сначала выберите улицу'}
              value={buildingsQuery || value.building}
              onChange={(e) => handleBuildingChange(e.target.value)}
              onFocus={() => buildingsQuery && value.street && setBuildingsOpen(true)}
              disabled={!value.street}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 dark:disabled:bg-gray-900 ${
                errors.building ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {buildingsLoading && (
              <div className="absolute right-3 top-2.5">
                <Spinner size="sm" />
              </div>
            )}
            {buildingsOpen && buildings.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {buildings.map((building) => (
                  <button
                    key={building}
                    type="button"
                    onClick={() => handleSelectBuilding(building)}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {building}
                  </button>
                ))}
              </div>
            )}
          </div>
          {errors.building && <p className="mt-1 text-sm text-red-500">{errors.building}</p>}
        </div>

        {/* Корпус - показывается только после выбора дома */}
        {value.building && (
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Корпус
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => !corpusesLoading && setCorpusesOpen(!corpusesOpen)}
                disabled={corpusesLoading}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 ${
                  corpusesLoading ? 'cursor-not-allowed' : ''
                }`}
              >
                <span>{value.corpus ? (value.corpus === 'none' ? 'Корпус отсутствует' : value.corpus) : 'Выберите корпус'}</span>
                {corpusesLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <ChevronDown className={`h-4 w-4 transition-transform ${corpusesOpen ? 'rotate-180' : ''}`} />
                )}
              </button>
              {corpusesOpen && !corpusesLoading && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {/* Опция "Корпус отсутствует" */}
                  <button
                    type="button"
                    onClick={() => handleSelectCorpus('none')}
                    className={`w-full text-left px-3 py-2 text-sm ${
                      value.corpus === 'none'
                        ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                    }`}
                  >
                    Корпус отсутствует
                  </button>
                  {/* Существующие корпусы */}
                  {corpuses.map((corpus) => (
                    <button
                      key={corpus}
                      type="button"
                      onClick={() => handleSelectCorpus(corpus)}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        value.corpus === corpus
                          ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      Корпус {corpus}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Подъезд - показывается когда есть подъезды для выбора */}
        {value.building && entrances.length > 0 && (
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Подъезд
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => !entrancesLoading && setEntrancesOpen(!entrancesOpen)}
                disabled={entrancesLoading}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 ${
                  entrancesLoading ? 'cursor-not-allowed' : ''
                }`}
              >
                <span>{value.entrance || 'Выберите подъезд'}</span>
                {entrancesLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <ChevronDown className={`h-4 w-4 transition-transform ${entrancesOpen ? 'rotate-180' : ''}`} />
                )}
              </button>
              {entrancesOpen && !entrancesLoading && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {entrances.map((entrance) => (
                    <button
                      key={entrance}
                      type="button"
                      onClick={() => handleSelectEntrance(entrance)}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        value.entrance === entrance
                          ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      Подъезд {entrance}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { addressesApi } from '@/api/addresses'
import Spinner from '@/components/Spinner'
import Card from '@/components/Card'
import Input from '@/components/Input'
import type { Address } from '@/types/address'

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
}

export default function AddressForm({ value, onChange, onAddressFound, errors = {} }: AddressFormProps) {
  // Р“РѕСЂРѕРґР°
  const [cities, setCities] = useState<string[]>([])
  const [citiesOpen, setCitiesOpen] = useState(false)
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [citiesQuery, setCitiesQuery] = useState('')

  // РЈР»РёС†С‹
  const [streets, setStreets] = useState<string[]>([])
  const [streetsOpen, setStreetsOpen] = useState(false)
  const [streetsLoading, setStreetsLoading] = useState(false)
  const [streetsQuery, setStreetsQuery] = useState('')

  // Р”РѕРјР°
  const [buildings, setBuildings] = useState<string[]>([])
  const [buildingsOpen, setBuildingsOpen] = useState(false)
  const [buildingsLoading, setBuildingsLoading] = useState(false)
  const [buildingsQuery, setBuildingsQuery] = useState('')

  // РљРѕСЂРїСѓСЃС‹ (Р·Р°РіСЂСѓР¶Р°СЋС‚СЃСЏ РїСЂРё РІС‹Р±РѕСЂРµ РґРѕРјР°)
  const [corpuses, setCorpuses] = useState<string[]>([])
  const [corpusesOpen, setCorpusesOpen] = useState(false)
  const [corpusesLoading, setCorpusesLoading] = useState(false)

  // РџРѕРґСЉРµР·РґС‹ (Р·Р°РіСЂСѓР¶Р°СЋС‚СЃСЏ РїСЂРё РІС‹Р±РѕСЂРµ РєРѕСЂРїСѓСЃР°)
  const [entrances, setEntrances] = useState<string[]>([])
  const [entrancesOpen, setEntrancesOpen] = useState(false)
  const [entrancesLoading, setEntrancesLoading] = useState(false)

  // Р¤Р»Р°Рі РґР»СЏ РѕС‚СЃР»РµР¶РёРІР°РЅРёСЏ РїРµСЂРІРѕР№ Р·Р°РіСЂСѓР·РєРё (СЂРµР¶РёРј СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ)
  const initializedRef = useRef(false)

  // РџСЂРё СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРё - Р·Р°РіСЂСѓР¶Р°РµРј РєРѕСЂРїСѓСЃС‹ Рё РїРѕРґСЉРµР·РґС‹ РїСЂРё РЅР°Р»РёС‡РёРё РґР°РЅРЅС‹С…
  useEffect(() => {
    // Р•СЃР»Рё СѓР¶Рµ РёРЅРёС†РёР°Р»РёР·РёСЂРѕРІР°Р»Рё РёР»Рё РЅРµС‚ РїРѕР»РЅРѕРіРѕ Р°РґСЂРµСЃР° - РїСЂРѕРїСѓСЃРєР°РµРј
    if (initializedRef.current) return
    if (!value.city || !value.street || !value.building) return

    initializedRef.current = true

    // Р—Р°РіСЂСѓР¶Р°РµРј РєРѕСЂРїСѓСЃС‹
    addressesApi.autocompleteCorpus(value.city, value.street, value.building)
      .then((result) => {
        setCorpuses(result)
        
        // Р•СЃР»Рё РµСЃС‚СЊ С‚РµРєСѓС‰РёР№ РєРѕСЂРїСѓСЃ, Р·Р°РіСЂСѓР¶Р°РµРј РґРѕСЃС‚СѓРїРЅС‹Рµ РїРѕРґСЉРµР·РґС‹
        const corpusToUse = value.corpus || ''
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

  // ===== Р“РѕСЂРѕРґР° =====
  const handleCityChange = useCallback(async (input: string) => {
    setCitiesQuery(input)
    onChange({ ...value, city: input, street: '', building: '', corpus: '', entrance: '', apartment: '' })
    onAddressFound?.(null)

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
  }, [onAddressFound, onChange, value])

  const handleSelectCity = (city: string) => {
    onChange({ ...value, city, street: '', building: '', corpus: '', entrance: '', apartment: '' })
    setCities([])
    setCitiesQuery('')
    setCitiesOpen(false)
  }

  // ===== РЈР»РёС†С‹ =====
  const handleStreetChange = useCallback(
    async (input: string) => {
      setStreetsQuery(input)
      onChange({ ...value, street: input, building: '', corpus: '', entrance: '', apartment: '' })
      onAddressFound?.(null)

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
    [onAddressFound, onChange, value]
  )

  const handleSelectStreet = (street: string) => {
    onChange({ ...value, street, building: '', corpus: '', entrance: '', apartment: '' })
    setStreets([])
    setStreetsQuery('')
    setStreetsOpen(false)
  }

  // ===== Р”РѕРјР° =====
  const handleBuildingChange = useCallback(
    async (input: string) => {
      setBuildingsQuery(input)
      onChange({ ...value, building: input, corpus: '', entrance: '', apartment: '' })
      onAddressFound?.(null)
      setCorpuses([])
      setEntrances([])

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
    [onAddressFound, onChange, value]
  )

  const handleSelectBuilding = (building: string) => {
    // РЎСЂР°Р·Сѓ РѕР±РЅРѕРІР»СЏРµРј building (СЃРёРЅС…СЂРѕРЅРЅРѕ)
    onChange({ ...value, building, corpus: '', entrance: '', apartment: '' })
    
    // Р—Р°РєСЂС‹РІР°РµРј dropdown Рё РѕС‡РёС‰Р°РµРј РїРѕРёСЃРє
    setBuildings([])
    setBuildingsQuery('')
    setBuildingsOpen(false)
    
    // РЎР±СЂР°СЃС‹РІР°РµРј РїРѕРґСЉРµР·РґС‹
    setEntrances([])
    
    // Р—Р°РіСЂСѓР¶Р°РµРј РґРѕСЃС‚СѓРїРЅС‹Рµ РєРѕСЂРїСѓСЃС‹ РґР»СЏ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РґРѕРјР°
    setCorpusesLoading(true)
    setCorpuses([])
    
    // РЎРѕС…СЂР°РЅСЏРµРј С‚РµРєСѓС‰РёРµ Р·РЅР°С‡РµРЅРёСЏ РґР»СЏ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ РІ callback
    const currentCity = value.city
    const currentStreet = value.street
    
    addressesApi
      .autocompleteCorpus(currentCity, currentStreet, building)
      .then((result) => {
        setCorpuses(result)
        
        if (result.length === 0) {
          // Р”Р»СЏ СЃС‚РѕСЂРѕРЅРЅРµРіРѕ Р°РґСЂРµСЃР° РєРѕСЂРїСѓСЃ РјРѕР¶РµС‚ Р±С‹С‚СЊ РІРІРµРґС‘РЅ РІСЂСѓС‡РЅСѓСЋ
          onChange({ city: currentCity, street: currentStreet, building, corpus: '', entrance: '', apartment: '' })
        } else if (result.length === 1) {
          // РћРґРёРЅ РєРѕСЂРїСѓСЃ - РІС‹Р±РёСЂР°РµРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё
          const singleCorpus = result[0]!
          onChange({ city: currentCity, street: currentStreet, building, corpus: singleCorpus, entrance: '', apartment: '' })
          loadEntrances(currentCity, currentStreet, building, singleCorpus, singleCorpus)
        }
        // Р•СЃР»Рё РЅРµСЃРєРѕР»СЊРєРѕ РєРѕСЂРїСѓСЃРѕРІ - РѕСЃС‚Р°РІР»СЏРµРј corpus РїСѓСЃС‚С‹Рј, Р¶РґС‘Рј СЂСѓС‡РЅРѕР№ РІС‹Р±РѕСЂ
      })
      .catch(() => {
        setCorpuses([])
      })
      .finally(() => {
        setCorpusesLoading(false)
      })
    
    // РџРѕРїС‹С‚Р°РµРјСЃСЏ РЅР°Р№С‚Рё Р°РґСЂРµСЃ РІ Р‘Р”
    if (onAddressFound) {
      const fullAddress = [value.city, value.street, building].filter(Boolean).join(', ')
      addressesApi
        .searchAddresses(fullAddress, 1)
        .then((results) => {
          if (results.length > 0) {
            const found = results[0]!
            // РџСЂРµРѕР±СЂР°Р·СѓРµРј AddressSearchResult РІ Address
            const address: Address = {
              id: found.id,
              address: found.address,
              city: value.city,
              street: value.street,
              building: building,
              corpus: value.corpus,
              entrance: value.entrance,
              lat: found.lat,
              lon: found.lon,
              entrance_count: found.entrance_count,
              floor_count: found.floor_count,
              apartment_count: null,
              has_elevator: null,
              has_intercom: found.has_intercom,
              intercom_code: found.intercom_code,
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

  // ===== РљРѕСЂРїСѓСЃС‹ =====
  const handleSelectCorpus = (corpus: string) => {
    onChange({ ...value, corpus, entrance: '', apartment: '' })
    setCorpusesOpen(false)
    
    // Р—Р°РіСЂСѓР¶Р°РµРј РґРѕСЃС‚СѓРїРЅС‹Рµ РїРѕРґСЉРµР·РґС‹ РґР»СЏ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РєРѕСЂРїСѓСЃР°
    loadEntrances(value.city, value.street, value.building, corpus !== 'none' ? corpus : undefined, corpus)
  }

  const handleCorpusInputChange = (input: string) => {
    onChange({ ...value, corpus: input, entrance: '', apartment: '' })
    onAddressFound?.(null)
    setEntrances([])
  }
  
  // Helper С„СѓРЅРєС†РёСЏ РґР»СЏ Р·Р°РіСЂСѓР·РєРё РїРѕРґСЉРµР·РґРѕРІ
  // РџСЂРёРЅРёРјР°РµС‚ РІСЃРµ Р·РЅР°С‡РµРЅРёСЏ СЏРІРЅРѕ, С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ РїСЂРѕР±Р»РµРј СЃ Р·Р°РјС‹РєР°РЅРёРµРј
  const loadEntrances = (city: string, street: string, building: string, corpusForApi?: string, corpusValue?: string) => {
    setEntrancesLoading(true)
    setEntrances([])
    addressesApi
      .autocompleteEntrance(city, street, building, corpusForApi)
      .then((result) => {
        setEntrances(result)
        // Р•СЃР»Рё РµСЃС‚СЊ С‚РѕР»СЊРєРѕ РѕРґРёРЅ РїРѕРґСЉРµР·Рґ, РІС‹Р±РёСЂР°РµРј РµРіРѕ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё
        // РСЃРїРѕР»СЊР·СѓРµРј РїРµСЂРµРґР°РЅРЅС‹Рµ Р·РЅР°С‡РµРЅРёСЏ, Р° РЅРµ value РёР· Р·Р°РјС‹РєР°РЅРёСЏ
        if (result.length === 1) {
          onChange({ 
            city, 
            street, 
            building, 
            corpus: corpusValue || corpusForApi || 'none', 
            entrance: result[0]!,
            apartment: '' 
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

  // ===== РџРѕРґСЉРµР·РґС‹ =====
  const handleSelectEntrance = (entrance: string) => {
    onChange({ ...value, entrance })
    setEntrancesOpen(false)
  }

  return (
    <Card title="РђРґСЂРµСЃ РѕР±СЉРµРєС‚Р°">
      <div className="space-y-4">
        {/* Р“РѕСЂРѕРґ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Р“РѕСЂРѕРґ <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="РќР°С‡РЅРёС‚Рµ РІРІРѕРґРёС‚СЊ РЅР°Р·РІР°РЅРёРµ РіРѕСЂРѕРґР°..."
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

        {/* РЈР»РёС†Р° */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            РЈР»РёС†Р° <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={value.city ? 'РќР°С‡РЅРёС‚Рµ РІРІРѕРґРёС‚СЊ РЅР°Р·РІР°РЅРёРµ СѓР»РёС†С‹...' : 'РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ РіРѕСЂРѕРґ'}
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

        {/* Р”РѕРј */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Р”РѕРј <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={value.street ? 'РќРѕРјРµСЂ РґРѕРјР°...' : 'РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ СѓР»РёС†Сѓ'}
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

        {/* РљРѕСЂРїСѓСЃ - РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ РїРѕСЃР»Рµ Р·Р°РїРѕР»РЅРµРЅРёСЏ РґРѕРјР° */}
        {value.building && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              РљРѕСЂРїСѓСЃ
            </label>
            <Input
              placeholder="РќР°РїСЂРёРјРµСЂ, 2, Рђ РёР»Рё Р±РµР· РєРѕСЂРїСѓСЃР°"
              value={value.corpus === 'none' ? '' : value.corpus}
              onChange={(e) => handleCorpusInputChange(e.target.value)}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSelectCorpus('none')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  value.corpus === 'none'
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100 border-primary-300 dark:border-primary-700'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Р‘РµР· РєРѕСЂРїСѓСЃР°
              </button>

              {corpuses.length > 0 && (
                <button
                  type="button"
                  onClick={() => !corpusesLoading && setCorpusesOpen(!corpusesOpen)}
                  disabled={corpusesLoading}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors inline-flex items-center gap-2 ${
                    corpusesLoading
                      ? 'opacity-50 cursor-not-allowed bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Р’Р°СЂРёР°РЅС‚С‹ РёР· Р±Р°Р·С‹
                  {corpusesLoading ? <Spinner size="sm" /> : <ChevronDown className={`h-4 w-4 transition-transform ${corpusesOpen ? 'rotate-180' : ''}`} />}
                </button>
              )}
            </div>

            {corpusesOpen && corpuses.length > 0 && !corpusesLoading && (
              <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
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
                    РљРѕСЂРїСѓСЃ {corpus}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              РљРѕСЂРїСѓСЃ РјРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ РёР· Р±Р°Р·С‹ РёР»Рё РІРІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ РґР»СЏ СЃС‚РѕСЂРѕРЅРЅРµРіРѕ Р°РґСЂРµСЃР°.
            </p>
          </div>
        )}

        {/* РџРѕРґСЉРµР·Рґ - РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ РєРѕРіРґР° РµСЃС‚СЊ РїРѕРґСЉРµР·РґС‹ РґР»СЏ РІС‹Р±РѕСЂР° */}
        {value.building && entrances.length > 0 && (
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              РџРѕРґСЉРµР·Рґ
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
                <span>{value.entrance || 'Р’С‹Р±РµСЂРёС‚Рµ РїРѕРґСЉРµР·Рґ'}</span>
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
                      РџРѕРґСЉРµР·Рґ {entrance}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {value.building && (
          <Input
            label="РљРІР°СЂС‚РёСЂР°"
            placeholder="РќР°РїСЂРёРјРµСЂ, 45"
            value={value.apartment}
            onChange={(e) => onChange({ ...value, apartment: e.target.value })}
          />
        )}
      </div>
    </Card>
  )
}

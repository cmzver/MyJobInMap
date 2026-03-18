import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { mutationToast } from '@/utils/apiError'
import { 
  MapPin, 
  Plus, 
  Search, 
  Trash2, 
  Building2,
  X,
  Check,
  Home,
  Layers,
  DoorOpen,
  KeyRound,
  Wand2,
  Eye
} from 'lucide-react'
import { 
  useAddresses, 
  useCreateAddress, 
  useDeleteAddress 
} from '@/hooks/useAddresses'
import { addressesApi } from '@/api/addresses'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import Pagination from '@/components/Pagination'
import EmptyState from '@/components/EmptyState'
import { Autocomplete } from '@/components/Autocomplete'
import type { CreateAddressData } from '@/types/address'

const initialFormData: CreateAddressData = {
  address: '',
  city: '',
  street: '',
  building: '',
  corpus: '',
  entrance: '',
  entrance_count: 1,
  floor_count: 1,
  apartment_count: undefined,
  has_elevator: false,
  has_intercom: false,
  intercom_code: '',
  management_company: '',
  management_phone: '',
  notes: '',
}

export default function AddressesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<CreateAddressData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  
  // Refs РґР»СЏ debounce
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const composeTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const lastFullAddress = useRef<string>('')
  const lastParts = useRef<string>('')

  // РџР°СЂСЃРёРЅРі РїРѕР»РЅРѕРіРѕ Р°РґСЂРµСЃР° -> Р·Р°РїРѕР»РЅРµРЅРёРµ РїРѕР»РµР№
  const handleParseAddress = useCallback(async (fullAddress: string) => {
    if (!fullAddress.trim() || fullAddress === lastFullAddress.current) return
    
    // РќРµ РїР°СЂСЃРёРј РµСЃР»Рё Р°РґСЂРµСЃ СЃРѕР±СЂР°РЅ РёР· С‡Р°СЃС‚РµР№
    const currentParts = `${formData.city}|${formData.street}|${formData.building}|${formData.corpus}|${formData.entrance}`
    if (currentParts === lastParts.current && lastParts.current) return
    
    lastFullAddress.current = fullAddress
    setIsParsing(true)
    
    try {
      const parsed = await addressesApi.parseAddress(fullAddress)
      setFormData(prev => ({
        ...prev,
        city: parsed.city || prev.city || '',
        street: parsed.street || prev.street || '',
        building: parsed.building || prev.building || '',
        corpus: parsed.corpus || prev.corpus || '',
        entrance: parsed.entrance || prev.entrance || '',
      }))
      lastParts.current = `${parsed.city || ''}|${parsed.street || ''}|${parsed.building || ''}|${parsed.corpus || ''}|${parsed.entrance || ''}`
    } catch (err) {
      if (import.meta.env.DEV) console.error('Parse error:', err)
    } finally {
      setIsParsing(false)
    }
  }, [formData.city, formData.street, formData.building, formData.corpus, formData.entrance])

  // РЎР±РѕСЂРєР° С‡Р°СЃС‚РµР№ -> РїРѕР»РЅС‹Р№ Р°РґСЂРµСЃ
  const handleComposeAddress = useCallback(async (city: string, street: string, building: string, corpus: string, entrance: string) => {
    const parts = `${city}|${street}|${building}|${corpus}|${entrance}`
    if (parts === lastParts.current || (!city && !street && !building && !corpus && !entrance)) return
    
    lastParts.current = parts
    setIsComposing(true)
    
    try {
      const result = await addressesApi.composeAddress({ city, street, building, corpus, entrance })
      if (result.address) {
        setFormData(prev => ({
          ...prev,
          address: result.address,
        }))
        lastFullAddress.current = result.address
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Compose error:', err)
    } finally {
      setIsComposing(false)
    }
  }, [])

  // РћР±СЂР°Р±РѕС‚С‡РёРє РёР·РјРµРЅРµРЅРёСЏ РїРѕР»РЅРѕРіРѕ Р°РґСЂРµСЃР° СЃ debounce
  const handleFullAddressChange = (value: string) => {
    setFormData(prev => ({ ...prev, address: value }))
    
    if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current)
    parseTimeoutRef.current = setTimeout(() => {
      handleParseAddress(value)
    }, 800)
  }

  // РћР±СЂР°Р±РѕС‚С‡РёРє РёР·РјРµРЅРµРЅРёСЏ РѕС‚РґРµР»СЊРЅС‹С… РїРѕР»РµР№ СЃ debounce
  const handlePartChange = (field: 'city' | 'street' | 'building' | 'corpus' | 'entrance', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    if (composeTimeoutRef.current) clearTimeout(composeTimeoutRef.current)
    composeTimeoutRef.current = setTimeout(() => {
      const newCity = field === 'city' ? value : formData.city
      const newStreet = field === 'street' ? value : formData.street
      const newBuilding = field === 'building' ? value : formData.building
      const newCorpus = field === 'corpus' ? value : formData.corpus
      const newEntrance = field === 'entrance' ? value : formData.entrance
      handleComposeAddress(newCity || '', newStreet || '', newBuilding || '', newCorpus || '', newEntrance || '')
    }, 800)
  }

  // РћС‡РёСЃС‚РєР° С‚Р°Р№РјРµСЂРѕРІ РїСЂРё СЂР°Р·РјРѕРЅС‚РёСЂРѕРІР°РЅРёРё
  useEffect(() => {
    return () => {
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current)
      if (composeTimeoutRef.current) clearTimeout(composeTimeoutRef.current)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Prefill from Task edit quick-add
  useEffect(() => {
    const raw = sessionStorage.getItem('address-prefill')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<CreateAddressData>
      setFormData((prev) => ({
        ...prev,
        ...parsed,
      }))
      setShowModal(true)
    } catch {
      // ignore parse errors
    } finally {
      sessionStorage.removeItem('address-prefill')
    }
  }, [])

  // Reset page on search
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Query
  const { data, isLoading, isError } = useAddresses({
    search: debouncedSearch || undefined,
    page,
    size: 20,
  })

  // Mutations
  const createMutation = useCreateAddress()
  const deleteMutation = useDeleteAddress()

  const handleOpenCreate = () => {
    setFormData(initialFormData)
    lastFullAddress.current = ''
    lastParts.current = ''
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setFormData(initialFormData)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.address.trim()) {
      toast.error('Р’РІРµРґРёС‚Рµ Р°РґСЂРµСЃ')
      return
    }

    createMutation.mutate(formData, mutationToast({
      success: 'РђРґСЂРµСЃ РґРѕР±Р°РІР»РµРЅ',
      error: 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ',
      onSuccess: () => {
        const returnTo = sessionStorage.getItem('task-form-return')
        handleCloseModal()
        if (returnTo) {
          sessionStorage.removeItem('task-form-return')
          navigate(returnTo)
        }
      },
    }))
  }

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, mutationToast({
      success: 'РђРґСЂРµСЃ СѓРґР°Р»С‘РЅ',
      error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ',
      onSuccess: () => setDeleteConfirm(null),
    }))
  }

  const isSubmitting = createMutation.isPending

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Р‘Р°Р·Р° Р°РґСЂРµСЃРѕРІ
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            РЈРїСЂР°РІР»РµРЅРёРµ Р°РґСЂРµСЃР°РјРё Рё РёРЅС„РѕСЂРјР°С†РёРµР№ Рѕ Р·РґР°РЅРёСЏС…
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ
        </Button>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="РџРѕРёСЃРє РїРѕ Р°РґСЂРµСЃСѓ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <Card>
          <div className="text-center py-8 text-red-500">
            РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РґР°РЅРЅС‹С…
          </div>
        </Card>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="РђРґСЂРµСЃР° РЅРµ РЅР°Р№РґРµРЅС‹"
          description={search ? 'РџРѕРїСЂРѕР±СѓР№С‚Рµ РёР·РјРµРЅРёС‚СЊ РїРѕРёСЃРєРѕРІС‹Р№ Р·Р°РїСЂРѕСЃ' : 'Р”РѕР±Р°РІСЊС‚Рµ РїРµСЂРІС‹Р№ Р°РґСЂРµСЃ РІ Р±Р°Р·Сѓ'}
          action={
            !search && (
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {/* List (table) */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">РђРґСЂРµСЃ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">РљРѕРѕСЂРґРёРЅР°С‚С‹</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">РџРѕРґСЉРµР·РґС‹ / Р­С‚Р°Р¶Рё</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Р”РѕРјРѕС„РѕРЅ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">РЈРљ</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Р”РµР№СЃС‚РІРёСЏ</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.items.map((address) => (
                  <tr 
                    key={address.id} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    onClick={() => navigate(`/addresses/${address.id}`)}
                  >
                    {/* РђРґСЂРµСЃ */}
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-primary-500 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate hover:text-primary-600 dark:hover:text-primary-400">
                            {address.address}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {[address.city, address.street, address.building, address.corpus, address.entrance]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                          {address.notes && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{address.notes}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* РљРѕРѕСЂРґРёРЅР°С‚С‹ */}
                    <td className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                      {address.lat && address.lon ? (
                        <span>{address.lat.toFixed(4)}, {address.lon.toFixed(4)}</span>
                      ) : (
                        <span className="text-gray-400">вЂ”</span>
                      )}
                    </td>

                    {/* РџРѕРґСЉРµР·РґС‹ / Р­С‚Р°Р¶Рё */}
                    <td className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1">
                          <DoorOpen className="h-4 w-4 text-gray-500" />
                          {address.entrance_count ?? 1}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-4 w-4 text-gray-500" />
                          {address.floor_count ?? 1}
                        </span>
                        {address.apartment_count ? (
                          <span className="inline-flex items-center gap-1">
                            <Home className="h-4 w-4 text-gray-500" />
                            {address.apartment_count}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Р”РѕРјРѕС„РѕРЅ */}
                    <td className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                      {address.has_intercom ? (
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="h-4 w-4 text-gray-500" />
                          {address.intercom_code || 'Р”РѕРјРѕС„РѕРЅ'}
                        </span>
                      ) : (
                        <span className="text-gray-400">вЂ”</span>
                      )}
                    </td>

                    {/* РЈРљ */}
                    <td className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                      {address.management_company ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-4 w-4 text-gray-500" />
                          <span className="truncate max-w-[220px] inline-block">{address.management_company}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">вЂ”</span>
                      )}
                    </td>

                    {/* Р”РµР№СЃС‚РІРёСЏ */}
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {deleteConfirm === address.id ? (
                          <>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(address.id)}
                              isLoading={deleteMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/addresses/${address.id}`)}
                              title="РћС‚РєСЂС‹С‚СЊ РєР°СЂС‚РѕС‡РєСѓ"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(address.id)}
                              title="РЈРґР°Р»РёС‚СЊ"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex justify-center">
              <Pagination
                currentPage={page}
                totalPages={data.pages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                РќРѕРІС‹Р№ Р°РґСЂРµСЃ
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-6">
                {/* РћСЃРЅРѕРІРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      РћСЃРЅРѕРІРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ
                    </h4>
                    {(isParsing || isComposing) && (
                      <span className="flex items-center gap-1 text-xs text-primary-500">
                        <Wand2 className="h-3 w-3 animate-pulse" />
                        {isParsing ? 'РџР°СЂСЃРёРЅРі...' : 'РЎР±РѕСЂРєР°...'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        label="РџРѕР»РЅС‹Р№ Р°РґСЂРµСЃ *"
                        value={formData.address}
                        onChange={(e) => handleFullAddressChange(e.target.value)}
                        placeholder="Р›РµРЅРёРЅСЃРєРёР№ РїСЂ., Рґ. 82, РєРѕСЂРї. 3, РЎРџР±"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Р’СЃС‚Р°РІСЊС‚Рµ Р°РґСЂРµСЃ вЂ” РїРѕР»СЏ РЅРёР¶Рµ Р·Р°РїРѕР»РЅСЏС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё
                      </p>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div>
                        <Autocomplete
                          id="city"
                          label="Р“РѕСЂРѕРґ"
                          value={formData.city || ''}
                          onChange={(value) => handlePartChange('city', value)}
                          fetchSuggestions={(q) => addressesApi.autocompleteCities(q)}
                          placeholder="РЎРџР±"
                          minChars={1}
                        />
                      </div>
                      <div>
                        <Autocomplete
                          id="street"
                          label="РЈР»РёС†Р°"
                          value={formData.street || ''}
                          onChange={(value) => handlePartChange('street', value)}
                          fetchSuggestions={(q) => addressesApi.autocompleteStreets(q, formData.city || undefined)}
                          placeholder="РќРµРІСЃРєРёР№ РїСЂ."
                          minChars={1}
                        />
                      </div>
                      <div>
                        <Autocomplete
                          id="building"
                          label="Р”РѕРј"
                          value={formData.building || ''}
                          onChange={(value) => handlePartChange('building', value)}
                          fetchSuggestions={(q) => addressesApi.autocompleteBuildings(q, formData.city || undefined, formData.street || undefined)}
                          placeholder="1"
                          minChars={1}
                        />
                      </div>
                      <div>
                        <Input
                          label="РљРѕСЂРїСѓСЃ"
                          value={formData.corpus || ''}
                          onChange={(e) => handlePartChange('corpus', e.target.value)}
                          placeholder="2"
                        />
                      </div>
                      <div>
                        <Input
                          label="РџРѕРґСЉРµР·Рґ"
                          value={formData.entrance || ''}
                          onChange={(e) => handlePartChange('entrance', e.target.value)}
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      рџ’Ў РР»Рё Р·Р°РїРѕР»РЅРёС‚Рµ РїРѕР»СЏ вЂ” РїСЂРё РІРІРѕРґРµ РїРѕСЏРІСЏС‚СЃСЏ РїРѕРґСЃРєР°Р·РєРё РёР· Р±Р°Р·С‹ Р°РґСЂРµСЃРѕРІ
                    </p>
                  </div>
                </div>

                {/* РРЅС„РѕСЂРјР°С†РёСЏ Рѕ Р·РґР°РЅРёРё */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    РРЅС„РѕСЂРјР°С†РёСЏ Рѕ Р·РґР°РЅРёРё
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      type="number"
                      label="РџРѕРґСЉРµР·РґРѕРІ"
                      value={formData.entrance_count || ''}
                      onChange={(e) => setFormData({ ...formData, entrance_count: e.target.value ? Number(e.target.value) : undefined })}
                      min={1}
                    />
                    <Input
                      type="number"
                      label="Р­С‚Р°Р¶РµР№"
                      value={formData.floor_count || ''}
                      onChange={(e) => setFormData({ ...formData, floor_count: e.target.value ? Number(e.target.value) : undefined })}
                      min={1}
                    />
                    <Input
                      type="number"
                      label="РљРІР°СЂС‚РёСЂ"
                      value={formData.apartment_count || ''}
                      onChange={(e) => setFormData({ ...formData, apartment_count: e.target.value ? Number(e.target.value) : undefined })}
                      min={1}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.has_elevator || false}
                        onChange={(e) => setFormData({ ...formData, has_elevator: e.target.checked })}
                        className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Р•СЃС‚СЊ Р»РёС„С‚</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.has_intercom || false}
                        onChange={(e) => setFormData({ ...formData, has_intercom: e.target.checked })}
                        className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Р•СЃС‚СЊ РґРѕРјРѕС„РѕРЅ</span>
                    </label>
                  </div>
                  {formData.has_intercom && (
                    <div className="mt-4">
                      <Input
                        label="РљРѕРґ РґРѕРјРѕС„РѕРЅР°"
                        value={formData.intercom_code || ''}
                        onChange={(e) => setFormData({ ...formData, intercom_code: e.target.value })}
                        placeholder="123#4567"
                      />
                    </div>
                  )}
                </div>

                {/* РЈРљ */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    РЈРїСЂР°РІР»СЏСЋС‰Р°СЏ РєРѕРјРїР°РЅРёСЏ
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="РќР°Р·РІР°РЅРёРµ РЈРљ"
                      value={formData.management_company || ''}
                      onChange={(e) => setFormData({ ...formData, management_company: e.target.value })}
                      placeholder="РћРћРћ РЈРљ Р”РѕРј"
                    />
                    <Input
                      label="РўРµР»РµС„РѕРЅ РЈРљ"
                      value={formData.management_phone || ''}
                      onChange={(e) => setFormData({ ...formData, management_phone: e.target.value })}
                      placeholder="+7 (812) 123-45-67"
                    />
                  </div>
                </div>

                {/* Р—Р°РјРµС‚РєРё */}
                <div>
                  <Textarea
                    label="Р—Р°РјРµС‚РєРё"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Р’С…РѕРґ СЃРѕ РґРІРѕСЂР°, РєР»СЋС‡ Сѓ РєРѕРЅСЃСЊРµСЂР¶Р°..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  РћС‚РјРµРЅР°
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  Р”РѕР±Р°РІРёС‚СЊ
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

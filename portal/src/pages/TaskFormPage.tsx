import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { showApiError, showApiSuccess, mutationToast } from '@/utils/apiError'
import { ArrowLeft, Save } from 'lucide-react'
import { useTask, useCreateTask, useUpdateTask, useAssignTask } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { addressesApi } from '@/api/addresses'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import Card from '@/components/Card'
import AddressForm from '@/components/AddressForm'
import type { AddressSystem } from '@/types/address'
import SystemSelector from '@/components/SystemSelector'
import DefectTypeSelector from '@/components/DefectTypeSelector'
import type { TaskPriority } from '@/types/task'
import { PRIORITY_OPTIONS_FOR_FORM, normalizePriority } from '@/config/taskConstants'


// Р¤РѕСЂРјР°С‚РёСЂРѕРІР°РЅРёРµ Р°РґСЂРµСЃР° РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ
const formatAddress = (address: AddressFormData): string => {
  const parts: string[] = []
  
  if (address.city) parts.push(address.city)
  if (address.street) parts.push(address.street)
  if (address.building) parts.push(`Рґ. ${address.building}`)
  if (address.corpus && address.corpus !== 'none') parts.push(`Рє. ${address.corpus}`)
  if (address.entrance) parts.push(`РїРѕРґ. ${address.entrance}`)
  if (address.apartment) parts.push(`РєРІ. ${address.apartment}`)
  
  return parts.join(', ')
}

const formatTaskTitle = (address: AddressFormData): string => {
  const parts: string[] = []

  if (address.street) parts.push(address.street)
  if (address.building) parts.push(`РґРѕРј ${address.building}`)
  if (address.corpus && address.corpus !== 'none') parts.push(`РєРѕСЂРї. ${address.corpus}`)
  if (address.apartment) parts.push(`РєРІ. ${address.apartment}`)

  return parts.join(', ')
}

// РџР°СЂСЃРёРЅРі Р°РґСЂРµСЃР° РёР· СЃС‚СЂРѕРєРё С„РѕСЂРјР°С‚Р° "Р“РѕСЂРѕРґ, РЈР»РёС†Р°, Рґ. Р”РѕРј, Рє. РљРѕСЂРїСѓСЃ, РїРѕРґ. РџРѕРґСЉРµР·Рґ"
const parseAddress = (addressStr: string): AddressFormData => {
  const result: AddressFormData = {
    city: '',
    street: '',
    building: '',
    corpus: '',
    entrance: '',
    apartment: '',
  }
  
  if (!addressStr) return result
  
  // Р Р°Р·Р±РёРІР°РµРј РїРѕ Р·Р°РїСЏС‚С‹Рј
  const parts = addressStr.split(',').map(p => p.trim())
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    
    // РС‰РµРј РґРѕРј (Рґ. РёР»Рё РґРѕРј)
    const buildingMatch = part.match(/^Рґ\.?\s*(\S+)$/i) || part.match(/^РґРѕРј\s*(\S+)$/i)
    if (buildingMatch) {
      result.building = buildingMatch[1] ?? ''
      continue
    }
    
    // РС‰РµРј РєРѕСЂРїСѓСЃ (Рє. РёР»Рё РєРѕСЂРї.)
    const corpusMatch = part.match(/^Рє\.?\s*(\S+)$/i) || part.match(/^РєРѕСЂРї\.?\s*(\S+)$/i)
    if (corpusMatch) {
      result.corpus = corpusMatch[1] ?? ''
      continue
    }
    
    // РС‰РµРј РїРѕРґСЉРµР·Рґ (РїРѕРґ. РёР»Рё РїРѕРґСЉРµР·Рґ)
    const entranceMatch = part.match(/^РїРѕРґ\.?\s*(\S+)$/i) || part.match(/^РїРѕРґСЉРµР·Рґ\s*(\S+)$/i)
    if (entranceMatch) {
      result.entrance = entranceMatch[1] ?? ''
      continue
    }

    const apartmentMatch = part.match(/^РєРІ\.?\s*(\S+)$/i) || part.match(/^РєРІР°СЂС‚РёСЂР°\s*(\S+)$/i)
    if (apartmentMatch) {
      result.apartment = apartmentMatch[1] ?? ''
      continue
    }
    
    // РџРµСЂРІР°СЏ С‡Р°СЃС‚СЊ вЂ” РіРѕСЂРѕРґ
    if (!result.city) {
      result.city = part
      continue
    }
    
    // Р’С‚РѕСЂР°СЏ С‡Р°СЃС‚СЊ вЂ” СѓР»РёС†Р°
    if (!result.street) {
      result.street = part
      continue
    }
    
    // Р•СЃР»Рё РµСЃС‚СЊ РµС‰С‘ С‡Р°СЃС‚Рё Р±РµР· РїСЂРµС„РёРєСЃРѕРІ вЂ” РІРѕР·РјРѕР¶РЅРѕ СЌС‚Рѕ РґРѕРј
    if (!result.building && /^\d+/.test(part)) {
      result.building = part
    }
  }

  // Р•СЃР»Рё РїРµСЂРµРїСѓС‚Р°Р»РёСЃСЊ РіРѕСЂРѕРґ/СѓР»РёС†Р° (С‡Р°СЃС‚Рѕ РёР· Telegram: "РЎРџР±, Р›РµРЅРёРЅСЃРєРёР№ РїСЂ-С‚...")
  const cityLooksLikeStreet = /(СѓР»|РїСЂ|РїСЂ-С‚|РїСЂРѕСЃРї|С€РѕСЃСЃРµ|С€|РїРµСЂ|Р±СѓР»СЊРІР°СЂ|РїСЂРѕРµР·Рґ)/i.test(result.city)
  const streetLooksLikeCity = /^(СЃРїР±|СЃР°РЅРєС‚|РїРµС‚РµСЂР±СѓСЂРі|РјРѕСЃРєРІР°|РµРєР°С‚|РµРєР°С‚РµСЂРёРЅР±СѓСЂРі|РєР°Р·Р°РЅСЊ|РЅРѕРІРѕСЃРёР±РёСЂСЃРє|РЅРёР¶РЅРёР№|СЃР°РјР°СЂР°|РєСЂР°СЃРЅРѕРґР°СЂ)/i.test(result.street)
  if (cityLooksLikeStreet && streetLooksLikeCity) {
    const tmp = result.city
    result.city = result.street
    result.street = tmp
  }
  
  return result
}

interface AddressFormData {
  city: string
  street: string
  building: string
  corpus: string
  entrance: string
  apartment: string
}

interface TaskFormData {
  address: AddressFormData
  addressId: number | null
  system_id: number | string
  system_type: string  // РўРёРї СЃРёСЃС‚РµРјС‹ (video_surveillance, intercom, etc.)
  defect_type_id: string
  defect_type_name: string  // РќР°Р·РІР°РЅРёРµ С‚РёРїР° РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё
  description: string
  customer_name: string
  customer_phone: string
  priority: TaskPriority
  assigned_user_id: string
  planned_date: string
  photos: File[]
}

interface TaskFormDraft {
  route: string
  formData: Omit<TaskFormData, 'photos'>
  selectedSystemType: string
}

const initialAddressData: AddressFormData = {
  city: '',
  street: '',
  building: '',
  corpus: '',
  entrance: '',
  apartment: '',
}

const initialFormData: TaskFormData = {
  address: initialAddressData,
  addressId: null,
  system_id: '',
  system_type: '',
  defect_type_id: '',
  defect_type_name: '',
  description: '',
  customer_name: '',
  customer_phone: '',
  priority: 'CURRENT',
  assigned_user_id: '',
  planned_date: '',
  photos: [],
}

interface TaskFormPageProps {
  mode: 'create' | 'edit'
}

export default function TaskFormPage({ mode }: TaskFormPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const taskId = id ? Number(id) : undefined
  const restoredDraftRef = useRef(false)

  const [formData, setFormData] = useState<TaskFormData>(initialFormData)
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressFormData, string>>>({})
  const [otherErrors, setOtherErrors] = useState<Record<string, string>>({})
  const [selectedSystemType, setSelectedSystemType] = useState<string>('')  // РўРёРї РІС‹Р±СЂР°РЅРЅРѕР№ СЃРёСЃС‚РµРјС‹ РґР»СЏ С„РёР»СЊС‚СЂР°С†РёРё РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚РµР№)

  // Fetch task data for edit mode
  const { data: task, isLoading: taskLoading } = useTask(taskId || 0)
  
  // Fetch users for assignee dropdown
  const { data: users = [] } = useUsers()
  
  // Filter only workers and dispatchers for assignment
  const assignableUsers = users.filter(u => u.is_active && (u.role === 'worker' || u.role === 'dispatcher'))
  
  // Mutations
  const createMutation = useCreateTask()
  const updateMutation = useUpdateTask()
  const assignMutation = useAssignTask()

  useEffect(() => {
    const rawDraft = sessionStorage.getItem('task-form-draft')
    if (!rawDraft) return

    try {
      const draft = JSON.parse(rawDraft) as TaskFormDraft
      if (draft.route !== location.pathname) {
        return
      }

      restoredDraftRef.current = true
      setFormData({
        ...draft.formData,
        photos: [],
      })
      setSelectedSystemType(draft.selectedSystemType || draft.formData.system_type || '')
    } catch {
      // ignore invalid session draft
    } finally {
      sessionStorage.removeItem('task-form-draft')
      sessionStorage.removeItem('task-form-return')
    }
  }, [location.pathname])

  // Populate form when editing
  useEffect(() => {
    if (restoredDraftRef.current) {
      return
    }

    if (mode === 'edit' && task) {
      // РџР°СЂСЃРёРј Р°РґСЂРµСЃ РёР· СЃС‚СЂРѕРєРё raw_address
      const parsedAddress = parseAddress(task.raw_address || '')
      
      // РљРѕРЅРІРµСЂС‚РёСЂСѓРµРј priority РёР· С‡РёСЃР»Р° РІ СЃС‚СЂРѕРєСѓ
      const taskPriority = normalizePriority(task.priority as TaskPriority | number | null)
      
      // Р—Р°РіСЂСѓР¶Р°РµРј СЃРѕС…СЂР°РЅС‘РЅРЅС‹Рµ system_id, system_type, defect_type РёР· task
      setFormData({
        address: parsedAddress,
        addressId: null,  // Р‘СѓРґРµС‚ РЅР°Р№РґРµРЅ РЅРёР¶Рµ С‡РµСЂРµР· findByComponents
        system_id: task.system_id || '',
        system_type: task.system_type || '',
        defect_type_id: task.defect_type || '',  // ID = РЅР°Р·РІР°РЅРёРµ РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё
        defect_type_name: task.defect_type || '',
        description: task.description || '',
        customer_name: task.customer_name || '',
        customer_phone: task.customer_phone || '',
        priority: taskPriority,
        assigned_user_id: task.assigned_user_id ? String(task.assigned_user_id) : '',
        planned_date: task.planned_date ? task.planned_date.slice(0, 16) : '',
        photos: [],
      })
      
      // РЈСЃС‚Р°РЅР°РІР»РёРІР°РµРј С‚РёРї СЃРёСЃС‚РµРјС‹ РґР»СЏ С„РёР»СЊС‚СЂР°С†РёРё РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚РµР№
      if (task.system_type) {
        setSelectedSystemType(task.system_type)
      }
      
    }
  }, [mode, task])

  useEffect(() => {
    const city = formData.address.city.trim()
    const street = formData.address.street.trim()
    const building = formData.address.building.trim()
    const corpus = formData.address.corpus.trim()

    if (!city || !street || !building) {
      setFormData((prev) => (prev.addressId === null ? prev : { ...prev, addressId: null }))
      return
    }

    let isCancelled = false

    addressesApi.findByComponents(
      city,
      street,
      building,
      corpus && corpus !== 'none' ? corpus : undefined
    )
      .then((result) => {
        if (isCancelled) {
          return
        }

        setFormData((prev) => {
          const nextAddressId = result?.id ?? null
          return prev.addressId === nextAddressId ? prev : { ...prev, addressId: nextAddressId }
        })
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setFormData((prev) => (prev.addressId === null ? prev : { ...prev, addressId: null }))
      })

    return () => {
      isCancelled = true
    }
  }, [formData.address.city, formData.address.street, formData.address.building, formData.address.corpus])

  const handleAddressChange = (data: AddressFormData) => {
    setFormData((prev) => {
      const addressIdentityChanged =
        prev.address.city !== data.city ||
        prev.address.street !== data.street ||
        prev.address.building !== data.building ||
        prev.address.corpus !== data.corpus

      if (!addressIdentityChanged) {
        return { ...prev, address: data }
      }

      return {
        ...prev,
        address: data,
        addressId: null,
        system_id: '',
        system_type: '',
        defect_type_id: '',
        defect_type_name: '',
      }
    })

    if (
      formData.address.city !== data.city ||
      formData.address.street !== data.street ||
      formData.address.building !== data.building ||
      formData.address.corpus !== data.corpus
    ) {
      setSelectedSystemType('')
    }

    if (addressErrors.city || addressErrors.street || addressErrors.building) {
      setAddressErrors({})
    }
  }

  const handleAddressFound = (foundAddress: { id: number } | null) => {
    if (foundAddress) {
      setFormData(prev => ({ ...prev, addressId: foundAddress.id }))
    }
    // РќРµ СЃР±СЂР°СЃС‹РІР°РµРј addressId РЅР° null - СЌС‚Рѕ РґРµР»Р°РµС‚ handleAddressChange
  }

  const handleSystemSelect = (systemId: number | string, system?: AddressSystem) => {
    const systemChanged = formData.system_id !== systemId
    setFormData(prev => ({ 
      ...prev, 
      system_id: systemId,
      system_type: system?.system_type || '',  // РЎРѕС…СЂР°РЅСЏРµРј С‚РёРї СЃРёСЃС‚РµРјС‹ РґР»СЏ РѕС‚РїСЂР°РІРєРё РЅР° СЃРµСЂРІРµСЂ
      defect_type_id: systemChanged ? '' : prev.defect_type_id,  // РЎР±СЂР°СЃС‹РІР°РµРј С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё РїСЂРё СЃРјРµРЅРµ СЃРёСЃС‚РµРјС‹
      defect_type_name: systemChanged ? '' : prev.defect_type_name,
    }))
    // РЎРѕС…СЂР°РЅСЏРµРј С‚РёРї СЃРёСЃС‚РµРјС‹ РґР»СЏ С„РёР»СЊС‚СЂР°С†РёРё РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚РµР№
    setSelectedSystemType(system?.system_type || '')
    if (otherErrors.system_id) {
      setOtherErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.system_id
        return newErrors
      })
    }
  }

  const handleDefectTypeChange = (defectTypeId: string, defectTypeName: string) => {
    setFormData(prev => ({ 
      ...prev, 
      defect_type_id: defectTypeId,
      defect_type_name: defectTypeName 
    }))
    if (otherErrors.defect_type_id) {
      setOtherErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.defect_type_id
        return newErrors
      })
    }
  }

  const handleFormChange = (field: keyof Omit<TaskFormData, 'address' | 'photos'>, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (otherErrors[field]) {
      setOtherErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const addrErrors: Partial<Record<keyof AddressFormData, string>> = {}
    const errors: Record<string, string> = {}

    // РђРґСЂРµСЃ
    if (!formData.address.city.trim()) {
      addrErrors.city = 'Р“РѕСЂРѕРґ РѕР±СЏР·Р°С‚РµР»РµРЅ'
    }
    if (!formData.address.street.trim()) {
      addrErrors.street = 'РЈР»РёС†Р° РѕР±СЏР·Р°С‚РµР»СЊРЅР°'
    }
    if (!formData.address.building.trim()) {
      addrErrors.building = 'Р”РѕРј РѕР±СЏР·Р°С‚РµР»РµРЅ'
    }
    // РћРїРёСЃР°РЅРёРµ
    if (!formData.description.trim()) {
      errors.description = 'РћРїРёСЃР°РЅРёРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ'
    }

    setAddressErrors(addrErrors)
    setOtherErrors(errors)

    return Object.keys(addrErrors).length === 0 && Object.keys(errors).length === 0
  }

  const openAddressCreateFlow = () => {
    const { photos: _photos, ...draftFormData } = formData

    const prefill = {
      address: fullAddress,
      city: formData.address.city,
      street: formData.address.street,
      building: formData.address.building,
      corpus: formData.address.corpus,
      entrance: formData.address.entrance,
      apartment: formData.address.apartment,
    }

    const draft: TaskFormDraft = {
      route: location.pathname,
      formData: draftFormData,
      selectedSystemType,
    }

    sessionStorage.setItem('address-prefill', JSON.stringify(prefill))
    sessionStorage.setItem('task-form-draft', JSON.stringify(draft))
    sessionStorage.setItem('task-form-return', location.pathname)
    navigate('/addresses')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    const fullAddress = formatAddress(formData.address)
    const taskTitle = formatTaskTitle(formData.address) || formData.address.street || 'РќРѕРІР°СЏ Р·Р°СЏРІРєР°'

    if (mode === 'create') {
      const createData = {
        title: taskTitle,
        description: formData.description.trim(),
        address: fullAddress,
        customer_name: formData.customer_name.trim() || null,
        customer_phone: formData.customer_phone.trim() || null,
        priority: formData.priority,
        is_paid: false,
        payment_amount: null,
        planned_date: formData.planned_date || null,
        assigned_user_id: formData.assigned_user_id ? Number(formData.assigned_user_id) : null,
        // РЎРёСЃС‚РµРјР° Рё С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё
        system_id: formData.system_id ? Number(formData.system_id) : null,
        system_type: formData.system_type || null,
        defect_type: formData.defect_type_name || null,
      }
      
      createMutation.mutate(createData, mutationToast({
        success: 'Р—Р°СЏРІРєР° СЃРѕР·РґР°РЅР°',
        error: 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ Р·Р°СЏРІРєРё',
        onSuccess: (newTask) => navigate(`/tasks/${newTask.id}`),
      }))
    } else if (taskId) {
      const updateData = {
        title: taskTitle,
        description: formData.description.trim(),
        address: fullAddress,
        customer_name: formData.customer_name.trim() || null,
        customer_phone: formData.customer_phone.trim() || null,
        priority: formData.priority,
        is_paid: false,
        payment_amount: 0,
        planned_date: formData.planned_date || null,
        // РЎРёСЃС‚РµРјР° Рё С‚РёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё
        system_id: formData.system_id ? Number(formData.system_id) : null,
        system_type: formData.system_type || null,
        defect_type: formData.defect_type_name || null,
      }
      
      const oldAssigneeId = task?.assigned_user_id || null
      const newAssigneeId = formData.assigned_user_id ? Number(formData.assigned_user_id) : null
      const assigneeChanged = oldAssigneeId !== newAssigneeId
      
      updateMutation.mutate(
        { id: taskId, data: updateData },
        {
          onSuccess: () => {
            if (assigneeChanged) {
              assignMutation.mutate(
                { id: taskId, assignedUserId: newAssigneeId },
                {
                  onSuccess: () => {
                    showApiSuccess('Р—Р°СЏРІРєР° РѕР±РЅРѕРІР»РµРЅР°')
                    navigate(`/tasks/${taskId}`)
                  },
                  onError: () => {
                    showApiSuccess('Р—Р°СЏРІРєР° РѕР±РЅРѕРІР»РµРЅР°')
                    navigate(`/tasks/${taskId}`)
                  },
                }
              )
            } else {
              showApiSuccess('Р—Р°СЏРІРєР° РѕР±РЅРѕРІР»РµРЅР°')
              navigate(`/tasks/${taskId}`)
            }
          },
          onError: (err) => {
            showApiError(err, 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ Р·Р°СЏРІРєРё')
          },
        }
      )
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending || assignMutation.isPending
  const showMissingAddressPrompt =
    !formData.addressId &&
    Boolean(formData.address.city.trim()) &&
    Boolean(formData.address.street.trim()) &&
    Boolean(formData.address.building.trim())

  if (mode === 'edit' && taskLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const fullAddress = formatAddress(formData.address)

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(mode === 'edit' && taskId ? `/tasks/${taskId}` : '/tasks')} 
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          РќР°Р·Р°Рґ
        </Button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {mode === 'create' ? 'РќРѕРІР°СЏ Р·Р°СЏРІРєР°' : 'Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Р·Р°СЏРІРєРё'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {mode === 'create' 
            ? 'Р—Р°РїРѕР»РЅРёС‚Рµ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РЅРѕРІРѕР№ Р·Р°СЏРІРєРµ' 
            : `Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Р·Р°СЏРІРєРё ${task?.task_number || `#${taskId}`}`
          }
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* РЁР°Рі 1: РђРґСЂРµСЃ */}
        <AddressForm 
          value={formData.address} 
          onChange={handleAddressChange}
          onAddressFound={handleAddressFound}
          errors={addressErrors}
        />

        {/* РџРѕРґСЃРєР°Р·РєР°, РµСЃР»Рё Р°РґСЂРµСЃ РЅРµ РЅР°Р№РґРµРЅ РІ Р±Р°Р·Рµ */}
        {showMissingAddressPrompt && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              РђРґСЂРµСЃ РЅРµ РЅР°Р№РґРµРЅ РІ Р±Р°Р·Рµ Р°РґСЂРµСЃРѕРІ. Р—Р°СЏРІРєСѓ РјРѕР¶РЅРѕ СЃРѕР·РґР°С‚СЊ Рё РЅР° СЃС‚РѕСЂРѕРЅРЅРёР№ Р°РґСЂРµСЃ, Р° РµСЃР»Рё С…РѕС‚РёС‚Рµ РІРµСЃС‚Рё РµРіРѕ РІ Р±Р°Р·Рµ, РґРѕР±Р°РІСЊС‚Рµ Р°РґСЂРµСЃ СЃРµР№С‡Р°СЃ.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={openAddressCreateFlow}
              >
                Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ РІ Р±Р°Р·Сѓ
              </Button>
            </div>
          </div>
        )}
        
        {/* РџРѕРґСЃРєР°Р·РєР° РґР»СЏ СЃС‚Р°СЂС‹С… Р·Р°СЏРІРѕРє Р±РµР· СЃРёСЃС‚РµРјС‹ */}
        {mode === 'edit' && formData.addressId && !formData.system_type && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              вљ пёЏ Р­С‚Р° Р·Р°СЏРІРєР° Р±С‹Р»Р° СЃРѕР·РґР°РЅР° Р±РµР· СѓРєР°Р·Р°РЅРёСЏ СЃРёСЃС‚РµРјС‹ Рё С‚РёРїР° РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё. 
              Р’С‹Р±РµСЂРёС‚Рµ РёС… РЅРёР¶Рµ, РµСЃР»Рё С…РѕС‚РёС‚Рµ РґРѕР±Р°РІРёС‚СЊ СЌС‚Сѓ РёРЅС„РѕСЂРјР°С†РёСЋ.
            </p>
          </div>
        )}

        {/* РЁР°Рі 2: РЎРёСЃС‚РµРјР° */}
        <SystemSelector 
          buildingId={formData.addressId || undefined}
          buildingAddress={fullAddress || 'РќРµ РІС‹Р±СЂР°РЅРѕ'}
          value={formData.system_id}
          onChange={handleSystemSelect}
          error={otherErrors.system_id}
        />

        {/* РЁР°Рі 3: РўРёРї РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё */}
        <DefectTypeSelector 
          value={formData.defect_type_id}
          onChange={handleDefectTypeChange}
          systemType={selectedSystemType || formData.system_type}
          error={otherErrors.defect_type_id}
        />

        {/* РћСЃС‚Р°Р»СЊРЅС‹Рµ РїРѕР»СЏ */}
        <Card title="РРЅС„РѕСЂРјР°С†РёСЏ Рѕ Р·Р°СЏРІРєРµ">
          <div className="space-y-4">
            {/* РћРїРёСЃР°РЅРёРµ */}
            <Textarea
              label="РћРїРёСЃР°РЅРёРµ РїСЂРѕР±Р»РµРјС‹ *"
              placeholder="РџРѕРґСЂРѕР±РЅРѕРµ РѕРїРёСЃР°РЅРёРµ РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё..."
              value={formData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              rows={4}
              error={otherErrors.description}
            />

            {/* РљРѕРЅС‚Р°РєС‚С‹ РєР»РёРµРЅС‚Р° */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="РРјСЏ РєР»РёРµРЅС‚Р°"
                placeholder="РРІР°РЅ РџРµС‚СЂРѕРІ"
                value={formData.customer_name}
                onChange={(e) => handleFormChange('customer_name', e.target.value)}
              />
              <Input
                label="РўРµР»РµС„РѕРЅ"
                placeholder="+7 (900) 123-45-67"
                value={formData.customer_phone}
                onChange={(e) => handleFormChange('customer_phone', e.target.value)}
              />
            </div>

            {/* РџСЂРёРѕСЂРёС‚РµС‚ */}
            <Select
              label="РџСЂРёРѕСЂРёС‚РµС‚"
              options={PRIORITY_OPTIONS_FOR_FORM}
              value={formData.priority}
              onChange={(value) => handleFormChange('priority', value as TaskPriority)}
            />

            {/* РСЃРїРѕР»РЅРёС‚РµР»СЊ */}
            <Select
              label="РСЃРїРѕР»РЅРёС‚РµР»СЊ"
              options={[
                { value: '', label: 'РќРµ РЅР°Р·РЅР°С‡РµРЅ' },
                ...assignableUsers.map(u => ({
                  value: String(u.id),
                  label: `${u.full_name || u.username}`,
                }))
              ]}
              value={formData.assigned_user_id}
              onChange={(value) => handleFormChange('assigned_user_id', value)}
            />

            {/* РџР»Р°РЅРѕРІР°СЏ РґР°С‚Р° */}
            <Input
              type="datetime-local"
              label="Р–РµР»Р°РµРјРѕРµ РІСЂРµРјСЏ РІС‹РїРѕР»РЅРµРЅРёСЏ"
              value={formData.planned_date}
              onChange={(e) => handleFormChange('planned_date', e.target.value)}
            />
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 sticky bottom-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(mode === 'edit' && taskId ? `/tasks/${taskId}` : '/tasks')}
          >
            РћС‚РјРµРЅР°
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            <Save className="h-4 w-4 mr-2" />
            {mode === 'create' ? 'РЎРѕР·РґР°С‚СЊ Р·Р°СЏРІРєСѓ' : 'РЎРѕС…СЂР°РЅРёС‚СЊ'}
          </Button>
        </div>
      </form>
    </div>
  )
}

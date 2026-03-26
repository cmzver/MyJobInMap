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
import { isAssignableRole } from '@/types/user'
import { PRIORITY_OPTIONS_FOR_FORM, normalizePriority } from '@/config/taskConstants'


// Форматирование адреса для отображения
const formatAddress = (address: AddressFormData): string => {
  const parts: string[] = []
  
  if (address.city) parts.push(address.city)
  if (address.street) parts.push(address.street)
  if (address.building) parts.push(`д. ${address.building}`)
  if (address.corpus && address.corpus !== 'none') parts.push(`к. ${address.corpus}`)
  if (address.entrance) parts.push(`под. ${address.entrance}`)
  if (address.apartment) parts.push(`кв. ${address.apartment}`)
  
  return parts.join(', ')
}

const formatTaskTitle = (address: AddressFormData): string => {
  const parts: string[] = []

  if (address.street) parts.push(address.street)
  if (address.building) parts.push(`дом ${address.building}`)
  if (address.corpus && address.corpus !== 'none') parts.push(`корп. ${address.corpus}`)
  if (address.apartment) parts.push(`кв. ${address.apartment}`)

  return parts.join(', ')
}

// Парсинг адреса из строки формата "Город, Улица, д. Дом, к. Корпус, под. Подъезд"
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
  
  // Разбиваем по запятым
  const parts = addressStr.split(',').map(p => p.trim())
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    
    // Рщем дом (д. или дом)
    const buildingMatch = part.match(/^д\.?\s*(\S+)$/i) || part.match(/^дом\s*(\S+)$/i)
    if (buildingMatch) {
      result.building = buildingMatch[1] ?? ''
      continue
    }
    
    // Рщем корпус (к. или корп.)
    const corpusMatch = part.match(/^к\.?\s*(\S+)$/i) || part.match(/^корп\.?\s*(\S+)$/i)
    if (corpusMatch) {
      result.corpus = corpusMatch[1] ?? ''
      continue
    }
    
    // Рщем подъезд (под. или подъезд)
    const entranceMatch = part.match(/^под\.?\s*(\S+)$/i) || part.match(/^подъезд\s*(\S+)$/i)
    if (entranceMatch) {
      result.entrance = entranceMatch[1] ?? ''
      continue
    }

    const apartmentMatch = part.match(/^кв\.?\s*(\S+)$/i) || part.match(/^квартира\s*(\S+)$/i)
    if (apartmentMatch) {
      result.apartment = apartmentMatch[1] ?? ''
      continue
    }
    
    // Первая часть — город
    if (!result.city) {
      result.city = part
      continue
    }
    
    // Вторая часть — улица
    if (!result.street) {
      result.street = part
      continue
    }
    
    // Если есть ещё части без префиксов — возможно это дом
    if (!result.building && /^\d+/.test(part)) {
      result.building = part
    }
  }

  // Если перепутались город/улица (часто из Telegram: "СПб, Ленинский пр-т...")
  const cityLooksLikeStreet = /(ул|пр|пр-т|просп|шоссе|ш|пер|бульвар|проезд)/i.test(result.city)
  const streetLooksLikeCity = /^(спб|санкт|петербург|москва|екат|екатеринбург|казань|новосибирск|нижний|самара|краснодар)/i.test(result.street)
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
  system_type: string  // Тип системы (video_surveillance, intercom, etc.)
  defect_type_id: string
  defect_type_name: string  // Название типа неисправности
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
  const [selectedSystemType, setSelectedSystemType] = useState<string>('')  // Тип выбранной системы для фильтрации неисправностей)

  // Fetch task data for edit mode
  const { data: task, isLoading: taskLoading } = useTask(taskId || 0)
  
  // Fetch users for assignee dropdown
  const { data: users = [] } = useUsers()
  
  // Filter only workers and dispatchers for assignment
  const assignableUsers = users.filter((u) => u.is_active && isAssignableRole(u.role))
  
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
      // Парсим адрес из строки raw_address
      const parsedAddress = parseAddress(task.raw_address || '')
      
      // Конвертируем priority из числа в строку
      const taskPriority = normalizePriority(task.priority as TaskPriority | number | null)
      
      // Загружаем сохранённые system_id, system_type, defect_type из task
      setFormData({
        address: parsedAddress,
        addressId: null,  // Будет найден ниже через findByComponents
        system_id: task.system_id || '',
        system_type: task.system_type || '',
        defect_type_id: task.defect_type || '',  // ID = название для совместимости
        defect_type_name: task.defect_type || '',
        description: task.description || '',
        customer_name: task.customer_name || '',
        customer_phone: task.customer_phone || '',
        priority: taskPriority,
        assigned_user_id: task.assigned_user_id ? String(task.assigned_user_id) : '',
        planned_date: task.planned_date ? task.planned_date.slice(0, 16) : '',
        photos: [],
      })
      
      // Устанавливаем тип системы для фильтрации неисправностей
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
    // Не сбрасываем addressId на null - это делает handleAddressChange
  }

  const handleSystemSelect = (systemId: number | string, system?: AddressSystem) => {
    const systemChanged = formData.system_id !== systemId
    setFormData(prev => ({ 
      ...prev, 
      system_id: systemId,
      system_type: system?.system_type || '',  // Сохраняем тип системы для отправки на сервер
      defect_type_id: systemChanged ? '' : prev.defect_type_id,  // Сбрасываем тип неисправности при смене системы
      defect_type_name: systemChanged ? '' : prev.defect_type_name,
    }))
    // Сохраняем тип системы для фильтрации неисправностей
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

    // Адрес
    if (!formData.address.city.trim()) {
      addrErrors.city = 'Город обязателен'
    }
    if (!formData.address.street.trim()) {
      addrErrors.street = 'Улица обязательна'
    }
    if (!formData.address.building.trim()) {
      addrErrors.building = 'Дом обязателен'
    }
    // Описание
    if (!formData.description.trim()) {
      errors.description = 'Описание обязательно'
    }

    setAddressErrors(addrErrors)
    setOtherErrors(errors)

    return Object.keys(addrErrors).length === 0 && Object.keys(errors).length === 0
  }

  const openAddressCreateFlow = () => {
    const draftFormData: Omit<TaskFormData, 'photos'> = { ...formData }

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
    const taskTitle = formatTaskTitle(formData.address) || formData.address.street || 'Новая заявка'

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
        // Система и тип неисправности
        system_id: formData.system_id ? Number(formData.system_id) : null,
        system_type: formData.system_type || null,
        defect_type: formData.defect_type_name || null,
      }
      
      createMutation.mutate(createData, mutationToast({
        success: 'Заявка создана',
        error: 'Ошибка создания заявки',
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
        // Система и тип неисправности
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
                    showApiSuccess('Заявка обновлена')
                    navigate(`/tasks/${taskId}`)
                  },
                  onError: () => {
                    showApiSuccess('Заявка обновлена')
                    navigate(`/tasks/${taskId}`)
                  },
                }
              )
            } else {
              showApiSuccess('Заявка обновлена')
              navigate(`/tasks/${taskId}`)
            }
          },
          onError: (err) => {
            showApiError(err, 'Ошибка обновления заявки')
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
          Назад
        </Button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {mode === 'create' ? 'Новая заявка' : 'Редактирование заявки'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {mode === 'create' 
            ? 'Заполните информацию о новой заявке' 
            : `Редактирование заявки ${task?.task_number || `#${taskId}`}`
          }
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Шаг 1: Адрес */}
        <AddressForm 
          value={formData.address} 
          onChange={handleAddressChange}
          onAddressFound={handleAddressFound}
          errors={addressErrors}
        />

        {/* Подсказка, если адрес не найден в базе */}
        {showMissingAddressPrompt && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Адрес не найден в базе адресов. Заявку можно создать и на сторонний адрес, а если хотите вести его в базе, добавьте адрес сейчас.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={openAddressCreateFlow}
              >
                Добавить адрес в базу
              </Button>
            </div>
          </div>
        )}
        
        {/* Подсказка для старых заявок без системы */}
        {mode === 'edit' && formData.addressId && !formData.system_type && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              ⚠️ Эта заявка была создана без указания системы и типа неисправности. 
              Выберите их ниже, если хотите добавить эту информацию.
            </p>
          </div>
        )}

        {/* Шаг 2: Система */}
        <SystemSelector 
          buildingId={formData.addressId || undefined}
          buildingAddress={fullAddress || 'Не выбрано'}
          value={formData.system_id}
          onChange={handleSystemSelect}
          error={otherErrors.system_id}
        />

        {/* Шаг 3: Тип неисправности */}
        <DefectTypeSelector 
          value={formData.defect_type_id}
          onChange={handleDefectTypeChange}
          systemType={selectedSystemType || formData.system_type}
          error={otherErrors.defect_type_id}
        />

        {/* Остальные поля */}
        <Card title="Рнформация о заявке">
          <div className="space-y-4">
            {/* Описание */}
            <Textarea
              label="Описание проблемы *"
              placeholder="Подробное описание неисправности..."
              value={formData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              rows={4}
              error={otherErrors.description}
            />

            {/* Контакты клиента */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Рмя клиента"
                placeholder="Рван Петров"
                value={formData.customer_name}
                onChange={(e) => handleFormChange('customer_name', e.target.value)}
              />
              <Input
                label="Телефон"
                placeholder="+7 (900) 123-45-67"
                value={formData.customer_phone}
                onChange={(e) => handleFormChange('customer_phone', e.target.value)}
              />
            </div>

            {/* Приоритет */}
            <Select
              label="Приоритет"
              options={PRIORITY_OPTIONS_FOR_FORM}
              value={formData.priority}
              onChange={(value) => handleFormChange('priority', value as TaskPriority)}
            />

            {/* Рсполнитель */}
            <Select
              label="Рсполнитель"
              options={[
                { value: '', label: 'Не назначен' },
                ...assignableUsers.map(u => ({
                  value: String(u.id),
                  label: `${u.full_name || u.username}`,
                }))
              ]}
              value={formData.assigned_user_id}
              onChange={(value) => handleFormChange('assigned_user_id', value)}
            />

            {/* Плановая дата */}
            <Input
              type="datetime-local"
              label="Желаемое время выполнения"
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
            Отмена
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            <Save className="h-4 w-4 mr-2" />
            {mode === 'create' ? 'Создать заявку' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </div>
  )
}

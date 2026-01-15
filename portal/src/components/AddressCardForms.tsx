/**
 * Формы для модальных окон карточки адреса
 */
import { useState, useEffect } from 'react'
import { Save, X, Upload } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Textarea from '@/components/Textarea'
import type { AddressSystem, AddressEquipment, AddressContact } from '@/types/address'
import type { Address } from '@/types/address'

// ============================================
// Опции для селектов
// ============================================

export const systemTypeOptions = [
  { value: 'video_surveillance', label: 'Видеонаблюдение' },
  { value: 'intercom', label: 'Домофония' },
  { value: 'fire_protection', label: 'АППЗ' },
  { value: 'access_control', label: 'СКД' },
  { value: 'fire_alarm', label: 'ОПС' },
  { value: 'other', label: 'Другое' },
]

export const systemStatusOptions = [
  { value: 'active', label: 'Активна' },
  { value: 'maintenance', label: 'На ремонте' },
  { value: 'disabled', label: 'Отключена' },
]

export const equipmentTypeOptions = [
  { value: 'camera', label: 'Камера' },
  { value: 'dvr', label: 'Видеорегистратор' },
  { value: 'intercom_panel', label: 'Панель вызова' },
  { value: 'intercom_handset', label: 'Трубка домофона' },
  { value: 'sensor', label: 'Датчик' },
  { value: 'controller', label: 'Контроллер' },
  { value: 'reader', label: 'Считыватель' },
  { value: 'lock', label: 'Замок' },
  { value: 'switch', label: 'Коммутатор' },
  { value: 'router', label: 'Роутер' },
  { value: 'ups', label: 'ИБП' },
  { value: 'other', label: 'Другое' },
]

export const equipmentStatusOptions = [
  { value: 'working', label: 'Работает' },
  { value: 'faulty', label: 'Неисправно' },
  { value: 'dismantled', label: 'Демонтировано' },
]

export const documentTypeOptions = [
  { value: 'contract', label: 'Договор' },
  { value: 'estimate', label: 'Смета' },
  { value: 'act', label: 'Акт' },
  { value: 'scheme', label: 'Схема' },
  { value: 'passport', label: 'Паспорт' },
  { value: 'other', label: 'Другое' },
]

export const contactTypeOptions = [
  { value: 'chairman', label: 'Председатель' },
  { value: 'elder', label: 'Старший по дому' },
  { value: 'management', label: 'УК' },
  { value: 'concierge', label: 'Консьерж' },
  { value: 'other', label: 'Другое' },
]

// ============================================
// Форма системы
// ============================================

interface SystemFormData {
  system_type: string
  name: string
  status: string
  contract_number: string
  service_start_date: string
  service_end_date: string
  monthly_cost: string
  notes: string
}

interface SystemFormProps {
  system?: AddressSystem | null
  onSubmit: (data: SystemFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

export function SystemForm({ system, onSubmit, onCancel, isLoading }: SystemFormProps) {
  const [formData, setFormData] = useState<SystemFormData>({
    system_type: system?.system_type || 'video_surveillance',
    name: system?.name || '',
    status: system?.status || 'active',
    contract_number: system?.contract_number || '',
    service_start_date: system?.service_start_date?.split('T')[0] || '',
    service_end_date: system?.service_end_date?.split('T')[0] || '',
    monthly_cost: system?.monthly_cost?.toString() || '',
    notes: system?.notes || '',
  })

  // Обновляем форму при изменении system (редактирование vs создание)
  useEffect(() => {
    setFormData({
      system_type: system?.system_type || 'video_surveillance',
      name: system?.name || '',
      status: system?.status || 'active',
      contract_number: system?.contract_number || '',
      service_start_date: system?.service_start_date?.split('T')[0] || '',
      service_end_date: system?.service_end_date?.split('T')[0] || '',
      monthly_cost: system?.monthly_cost?.toString() || '',
      notes: system?.notes || '',
    })
  }, [system])

  const handleChange = (field: keyof SystemFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Тип системы"
          value={formData.system_type}
          onChange={(value) => handleChange('system_type', value)}
          options={systemTypeOptions}
          required
        />
        <Select
          label="Статус"
          value={formData.status}
          onChange={(value) => handleChange('status', value)}
          options={systemStatusOptions}
          required
        />
      </div>

      <Input
        label="Название"
        value={formData.name}
        onChange={(e) => handleChange('name', e.target.value)}
        placeholder="Например: Видеонаблюдение Hikvision"
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Номер договора"
          value={formData.contract_number}
          onChange={(e) => handleChange('contract_number', e.target.value)}
          placeholder="ВН-2024-001"
        />
        <Input
          label="Абонентская плата"
          type="number"
          value={formData.monthly_cost}
          onChange={(e) => handleChange('monthly_cost', e.target.value)}
          placeholder="5000"
          min="0"
          step="100"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Начало обслуживания"
          type="date"
          value={formData.service_start_date}
          onChange={(e) => handleChange('service_start_date', e.target.value)}
        />
        <Input
          label="Окончание обслуживания"
          type="date"
          value={formData.service_end_date}
          onChange={(e) => handleChange('service_end_date', e.target.value)}
        />
      </div>

      <Textarea
        label="Примечания"
        value={formData.notes}
        onChange={(e) => handleChange('notes', e.target.value)}
        placeholder="Дополнительная информация о системе..."
        rows={3}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading || !formData.name}>
          <Save className="h-4 w-4 mr-2" />
          {system ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  )
}

// ============================================
// Форма оборудования
// ============================================

interface EquipmentFormData {
  equipment_type: string
  name: string
  model: string
  serial_number: string
  quantity: string
  location: string
  install_date: string
  warranty_until: string
  status: string
  system_id: string
  notes: string
}

interface EquipmentFormProps {
  equipment?: AddressEquipment | null
  systems: AddressSystem[]
  onSubmit: (data: EquipmentFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

export function EquipmentForm({ equipment, systems, onSubmit, onCancel, isLoading }: EquipmentFormProps) {
  const [formData, setFormData] = useState<EquipmentFormData>({
    equipment_type: equipment?.equipment_type || 'camera',
    name: equipment?.name || '',
    model: equipment?.model || '',
    serial_number: equipment?.serial_number || '',
    quantity: equipment?.quantity?.toString() || '1',
    location: equipment?.location || '',
    install_date: equipment?.install_date?.split('T')[0] || '',
    warranty_until: equipment?.warranty_until?.split('T')[0] || '',
    status: equipment?.status || 'working',
    system_id: equipment?.system_id?.toString() || '',
    notes: equipment?.notes || '',
  })

  // Обновляем форму при изменении equipment
  useEffect(() => {
    setFormData({
      equipment_type: equipment?.equipment_type || 'camera',
      name: equipment?.name || '',
      model: equipment?.model || '',
      serial_number: equipment?.serial_number || '',
      quantity: equipment?.quantity?.toString() || '1',
      location: equipment?.location || '',
      install_date: equipment?.install_date?.split('T')[0] || '',
      warranty_until: equipment?.warranty_until?.split('T')[0] || '',
      status: equipment?.status || 'working',
      system_id: equipment?.system_id?.toString() || '',
      notes: equipment?.notes || '',
    })
  }, [equipment])

  const handleChange = (field: keyof EquipmentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const systemOptions = [
    { value: '', label: '— Без привязки к системе —' },
    ...systems.map(s => ({ value: s.id.toString(), label: s.name }))
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Тип оборудования"
          value={formData.equipment_type}
          onChange={(value) => handleChange('equipment_type', value)}
          options={equipmentTypeOptions}
          required
        />
        <Select
          label="Статус"
          value={formData.status}
          onChange={(value) => handleChange('status', value)}
          options={equipmentStatusOptions}
          required
        />
      </div>

      <Input
        label="Название"
        value={formData.name}
        onChange={(e) => handleChange('name', e.target.value)}
        placeholder="IP-камера Hikvision"
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Модель"
          value={formData.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder="DS-2CD2143G2-I"
        />
        <Input
          label="Серийный номер"
          value={formData.serial_number}
          onChange={(e) => handleChange('serial_number', e.target.value)}
          placeholder="HK-2024-00001"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Количество"
          type="number"
          value={formData.quantity}
          onChange={(e) => handleChange('quantity', e.target.value)}
          min="1"
          required
        />
        <Input
          label="Расположение"
          value={formData.location}
          onChange={(e) => handleChange('location', e.target.value)}
          placeholder="Подъезд 1, вход"
        />
      </div>

      <Select
        label="Привязка к системе"
        value={formData.system_id}
        onChange={(value) => handleChange('system_id', value)}
        options={systemOptions}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Дата установки"
          type="date"
          value={formData.install_date}
          onChange={(e) => handleChange('install_date', e.target.value)}
        />
        <Input
          label="Гарантия до"
          type="date"
          value={formData.warranty_until}
          onChange={(e) => handleChange('warranty_until', e.target.value)}
        />
      </div>

      <Textarea
        label="Примечания"
        value={formData.notes}
        onChange={(e) => handleChange('notes', e.target.value)}
        placeholder="Дополнительная информация..."
        rows={2}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading || !formData.name}>
          <Save className="h-4 w-4 mr-2" />
          {equipment ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  )
}

// ============================================
// Форма документа
// ============================================

interface DocumentFormData {
  file: File | null
  name: string
  doc_type: string
  valid_from: string
  valid_until: string
  notes: string
}

interface DocumentFormProps {
  onSubmit: (data: DocumentFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

export function DocumentForm({ onSubmit, onCancel, isLoading }: DocumentFormProps) {
  const [formData, setFormData] = useState<DocumentFormData>({
    file: null,
    name: '',
    doc_type: 'contract',
    valid_from: '',
    valid_until: '',
    notes: '',
  })

  const handleChange = (field: keyof DocumentFormData, value: string | File | null) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    handleChange('file', file)
    if (file && !formData.name) {
      handleChange('name', file.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.file) {
      onSubmit(formData)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
        <input
          type="file"
          id="document-file"
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        />
        <label 
          htmlFor="document-file" 
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Upload className="h-8 w-8 text-gray-400" />
          {formData.file ? (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
              {formData.file.name} ({(formData.file.size / 1024).toFixed(1)} КБ)
            </span>
          ) : (
            <>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Нажмите для выбора файла
              </span>
              <span className="text-xs text-gray-400">
                PDF, DOC, XLS, PNG, JPG
              </span>
            </>
          )}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Название документа"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Договор на обслуживание"
          required
        />
        <Select
          label="Тип документа"
          value={formData.doc_type}
          onChange={(value) => handleChange('doc_type', value)}
          options={documentTypeOptions}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Действует с"
          type="date"
          value={formData.valid_from}
          onChange={(e) => handleChange('valid_from', e.target.value)}
        />
        <Input
          label="Действует до"
          type="date"
          value={formData.valid_until}
          onChange={(e) => handleChange('valid_until', e.target.value)}
        />
      </div>

      <Textarea
        label="Примечания"
        value={formData.notes}
        onChange={(e) => handleChange('notes', e.target.value)}
        placeholder="Дополнительная информация..."
        rows={2}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading || !formData.file}>
          <Upload className="h-4 w-4 mr-2" />
          Загрузить
        </Button>
      </div>
    </form>
  )
}

// ============================================
// Форма контакта
// ============================================

interface ContactFormData {
  contact_type: string
  name: string
  phone: string
  email: string
  notes: string
  is_primary: boolean
}

interface ContactFormProps {
  contact?: AddressContact | null
  onSubmit: (data: ContactFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

export function ContactForm({ contact, onSubmit, onCancel, isLoading }: ContactFormProps) {
  const [formData, setFormData] = useState<ContactFormData>({
    contact_type: contact?.contact_type || 'chairman',
    name: contact?.name || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    notes: contact?.notes || '',
    is_primary: contact?.is_primary || false,
  })

  // Обновляем форму при изменении contact
  useEffect(() => {
    setFormData({
      contact_type: contact?.contact_type || 'chairman',
      name: contact?.name || '',
      phone: contact?.phone || '',
      email: contact?.email || '',
      notes: contact?.notes || '',
      is_primary: contact?.is_primary || false,
    })
  }, [contact])

  const handleChange = (field: keyof ContactFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Тип контакта"
          value={formData.contact_type}
          onChange={(value) => handleChange('contact_type', value)}
          options={contactTypeOptions}
          required
        />
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_primary}
              onChange={(e) => handleChange('is_primary', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Основной контакт
            </span>
          </label>
        </div>
      </div>

      <Input
        label="ФИО"
        value={formData.name}
        onChange={(e) => handleChange('name', e.target.value)}
        placeholder="Иванов Иван Иванович"
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Телефон"
          type="tel"
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="+7 (999) 123-45-67"
        />
        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="email@example.com"
        />
      </div>

      <Textarea
        label="Примечания"
        value={formData.notes}
        onChange={(e) => handleChange('notes', e.target.value)}
        placeholder="Звонить после 18:00..."
        rows={2}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading || !formData.name}>
          <Save className="h-4 w-4 mr-2" />
          {contact ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  )
}

// ============================================
// Форма редактирования адреса
// ============================================

interface AddressFormData {
  address: string
  city: string
  street: string
  building: string
  corpus: string
  entrance: string
  entrance_count: string
  floor_count: string
  apartment_count: string
  has_elevator: boolean
  has_intercom: boolean
  intercom_code: string
  management_company: string
  management_phone: string
  notes: string
}

interface AddressFormProps {
  address: Address
  onSubmit: (data: AddressFormData) => void
  onCancel: () => void
  isLoading?: boolean
}

export function AddressForm({ address, onSubmit, onCancel, isLoading }: AddressFormProps) {
  const [formData, setFormData] = useState<AddressFormData>({
    address: address.address || '',
    city: address.city || '',
    street: address.street || '',
    building: address.building || '',
    corpus: address.corpus || '',
    entrance: address.entrance || '',
    entrance_count: address.entrance_count?.toString() || '',
    floor_count: address.floor_count?.toString() || '',
    apartment_count: address.apartment_count?.toString() || '',
    has_elevator: address.has_elevator || false,
    has_intercom: address.has_intercom || false,
    intercom_code: address.intercom_code || '',
    management_company: address.management_company || '',
    management_phone: address.management_phone || '',
    notes: address.notes || '',
  })

  useEffect(() => {
    setFormData({
      address: address.address || '',
      city: address.city || '',
      street: address.street || '',
      building: address.building || '',
      corpus: address.corpus || '',
      entrance: address.entrance || '',
      entrance_count: address.entrance_count?.toString() || '',
      floor_count: address.floor_count?.toString() || '',
      apartment_count: address.apartment_count?.toString() || '',
      has_elevator: address.has_elevator || false,
      has_intercom: address.has_intercom || false,
      intercom_code: address.intercom_code || '',
      management_company: address.management_company || '',
      management_phone: address.management_phone || '',
      notes: address.notes || '',
    })
  }, [address])

  const handleChange = (field: keyof AddressFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* Основной адрес */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white border-b pb-2">Адрес</h4>
        
        <Input
          label="Полный адрес"
          value={formData.address}
          onChange={(e) => handleChange('address', e.target.value)}
          placeholder="ул. Примерная, д. 1"
          required
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Город"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="Санкт-Петербург"
          />
          <Input
            label="Улица"
            value={formData.street}
            onChange={(e) => handleChange('street', e.target.value)}
            placeholder="Примерная"
          />
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Дом"
            value={formData.building}
            onChange={(e) => handleChange('building', e.target.value)}
            placeholder="1"
          />
          <Input
            label="Корпус"
            value={formData.corpus}
            onChange={(e) => handleChange('corpus', e.target.value)}
            placeholder="А"
          />
          <Input
            label="Подъезд"
            value={formData.entrance}
            onChange={(e) => handleChange('entrance', e.target.value)}
            placeholder="1"
          />
        </div>
      </div>

      {/* Характеристики дома */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white border-b pb-2">Характеристики</h4>
        
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Подъездов"
            type="number"
            value={formData.entrance_count}
            onChange={(e) => handleChange('entrance_count', e.target.value)}
            min="1"
          />
          <Input
            label="Этажей"
            type="number"
            value={formData.floor_count}
            onChange={(e) => handleChange('floor_count', e.target.value)}
            min="1"
          />
          <Input
            label="Квартир"
            type="number"
            value={formData.apartment_count}
            onChange={(e) => handleChange('apartment_count', e.target.value)}
            min="1"
          />
        </div>
      </div>

      {/* Управляющая компания */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white border-b pb-2">Управляющая компания</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Название УК"
            value={formData.management_company}
            onChange={(e) => handleChange('management_company', e.target.value)}
            placeholder="ООО «УК Пример»"
          />
          <Input
            label="Телефон УК"
            value={formData.management_phone}
            onChange={(e) => handleChange('management_phone', e.target.value)}
            placeholder="+7 (999) 123-45-67"
          />
        </div>
      </div>

      {/* Заметки */}
      <Textarea
        label="Заметки"
        value={formData.notes}
        onChange={(e) => handleChange('notes', e.target.value)}
        placeholder="Дополнительная информация об объекте..."
        rows={3}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading || !formData.address}>
          <Save className="h-4 w-4 mr-2" />
          Сохранить
        </Button>
      </div>
    </form>
  )
}

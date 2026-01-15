// Типы для работы с адресами

export interface Address {
  id: number
  address: string
  city: string | null
  street: string | null
  building: string | null
  corpus: string | null
  entrance: string | null
  
  lat: number | null
  lon: number | null
  
  entrance_count: number | null
  floor_count: number | null
  apartment_count: number | null
  has_elevator: boolean | null
  has_intercom: boolean | null
  intercom_code: string | null
  
  management_company: string | null
  management_phone: string | null
  
  notes: string | null
  extra_info: string | null  // Дополнительная информация
  is_active: boolean
  
  created_at: string
  updated_at: string
}

export interface AddressSearchResult {
  id: number
  address: string
  lat: number | null
  lon: number | null
  entrance_count: number | null
  floor_count: number | null
  has_intercom: boolean | null
  intercom_code: string | null
}

export interface AddressFilters {
  search?: string
  city?: string
  is_active?: boolean
  page?: number
  size?: number
}

export interface AddressListResponse {
  items: Address[]
  total: number
  page: number
  size: number
  pages: number
}

export interface CreateAddressData {
  address: string
  city?: string
  street?: string
  building?: string
  corpus?: string
  entrance?: string
  lat?: number
  lon?: number
  entrance_count?: number
  floor_count?: number
  apartment_count?: number
  has_elevator?: boolean
  has_intercom?: boolean
  intercom_code?: string
  management_company?: string
  management_phone?: string
  notes?: string
}

export interface UpdateAddressData {
  address?: string
  city?: string
  street?: string
  building?: string
  corpus?: string
  entrance?: string
  lat?: number
  lon?: number
  entrance_count?: number
  floor_count?: number
  apartment_count?: number
  has_elevator?: boolean
  has_intercom?: boolean
  intercom_code?: string
  management_company?: string
  management_phone?: string
  notes?: string
  is_active?: boolean
}

// ============================================
// Расширенная карточка объекта
// ============================================

// Типы систем на обслуживании
export type SystemType = 
  | 'video_surveillance'  // Видеонаблюдение
  | 'intercom'            // Домофония
  | 'fire_protection'     // АППЗ
  | 'access_control'      // СКД
  | 'fire_alarm'          // ОПС
  | 'other'               // Другое

export type SystemStatus = 'active' | 'maintenance' | 'disabled'

export interface AddressSystem {
  id: number
  address_id: number
  system_type: SystemType
  name: string
  status: SystemStatus
  contract_number: string | null
  service_start_date: string | null
  service_end_date: string | null
  monthly_cost: number | null
  model: string | null
  manufacturer: string | null
  install_date: string | null
  warranty_until: string | null
  last_maintenance: string | null
  next_maintenance: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Типы оборудования
export type EquipmentType = 
  | 'camera'              // Камера
  | 'dvr'                 // Видеорегистратор
  | 'intercom_panel'      // Домофонная панель
  | 'intercom_handset'    // Трубка домофона
  | 'sensor'              // Датчик
  | 'controller'          // Контроллер
  | 'reader'              // Считыватель
  | 'lock'                // Замок
  | 'switch'              // Коммутатор
  | 'router'              // Роутер
  | 'ups'                 // ИБП
  | 'other'               // Другое

export type EquipmentStatus = 'working' | 'faulty' | 'dismantled'

export interface AddressEquipment {
  id: number
  address_id: number
  system_id: number | null
  equipment_type: EquipmentType
  name: string
  model: string | null
  serial_number: string | null
  quantity: number  // Количество
  location: string | null
  install_date: string | null
  warranty_until: string | null
  status: EquipmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

// Типы документов
export type DocumentType = 
  | 'contract'            // Договор
  | 'estimate'            // Смета
  | 'act'                 // Акт
  | 'scheme'              // Схема
  | 'passport'            // Паспорт оборудования
  | 'other'               // Другое

export interface AddressDocument {
  id: number
  address_id: number
  name: string
  doc_type: DocumentType
  file_path: string
  file_size: number
  mime_type: string
  valid_from: string | null
  valid_until: string | null
  notes: string | null
  created_at: string
  created_by_id: number | null
  created_by_name: string | null
}

// Типы контактов
export type ContactType = 
  | 'chairman'            // Председатель
  | 'elder'               // Старший по дому
  | 'management'          // УК
  | 'concierge'           // Консьерж
  | 'other'               // Другое

export interface AddressContact {
  id: number
  address_id: number
  contact_type: ContactType
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  is_primary: boolean
  created_at: string
}

// История объекта
export type HistoryEventType = 
  | 'created'
  | 'updated'
  | 'document_added'
  | 'document_removed'
  | 'system_added'
  | 'system_updated'
  | 'equipment_added'
  | 'equipment_updated'
  | 'contact_added'

export interface AddressHistory {
  id: number
  address_id: number
  event_type: HistoryEventType
  description: string
  user_id: number | null
  user_name: string | null
  created_at: string
}

// Полная карточка объекта
export interface AddressFull extends Address {
  systems: AddressSystem[]
  equipment: AddressEquipment[]
  documents: AddressDocument[]
  contacts: AddressContact[]
  task_stats: {
    total: number
    new: number
    in_progress: number
    done: number
    cancelled: number
  }
}

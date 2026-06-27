// Типы для работы с адресами.
//
// Структуры ответов и доменные перечисления выводятся из backend OpenAPI-схемы
// (единый источник истины) — регенерация через `npm run gen:api`.
import type { components } from './api.generated'

export type Address = components['schemas']['AddressResponse']
export type AddressSearchResult = components['schemas']['AddressSearchResponse']
export type AddressListResponse = components['schemas']['AddressListResponse']
export type CreateAddressData = components['schemas']['AddressCreate']
export type UpdateAddressData = components['schemas']['AddressUpdate']

// Фильтры списка — клиентское понятие (на сервере это query-параметры).
export interface AddressFilters {
  search?: string
  city?: string
  is_active?: boolean
  page?: number
  size?: number
}

// ============================================
// Расширенная карточка объекта
// ============================================

export type SystemType = components['schemas']['SystemType']
export type SystemStatus = components['schemas']['SystemStatus']
export type AddressSystem = components['schemas']['AddressSystemResponse']

export type EquipmentType = components['schemas']['EquipmentType']
export type EquipmentStatus = components['schemas']['EquipmentStatus']
export type AddressEquipment = components['schemas']['AddressEquipmentResponse']

export type DocumentType = components['schemas']['DocumentType']
export type AddressDocument = components['schemas']['AddressDocumentResponse']

export type ContactType = components['schemas']['ContactType']
export type AddressContact = components['schemas']['AddressContactResponse']

export type HistoryEventType = components['schemas']['AddressHistoryEventType']
export type AddressHistory = components['schemas']['AddressHistoryResponse']

export type AddressFull = components['schemas']['AddressFullResponse']

// Сетевые домофонные панели (Beward) на адресе
export type IntercomPanel = components['schemas']['IntercomPanelResponse']
export type CreateIntercomPanelData = components['schemas']['IntercomPanelCreate']
export type UpdateIntercomPanelData = components['schemas']['IntercomPanelUpdate']
export type PanelLockStatus = components['schemas']['PanelLockStatusResponse']
export type PanelDoorAction = components['schemas']['PanelDoorActionResponse']
export type PanelMifareScanCode = components['schemas']['PanelMifareScanCodeResponse']

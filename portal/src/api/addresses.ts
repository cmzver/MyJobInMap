import apiClient from './client'
import type { 
  Address, 
  AddressSearchResult, 
  AddressListResponse, 
  AddressFilters,
  CreateAddressData,
  UpdateAddressData,
  AddressFull,
  AddressSystem,
  AddressEquipment,
  AddressDocument,
  AddressContact,
  AddressHistory,
} from '@/types/address'

// ============================================
// Типы для создания/обновления сущностей
// ============================================

export interface CreateSystemData {
  system_type: string
  name: string
  status?: string
  model?: string
  manufacturer?: string
  install_date?: string
  warranty_until?: string
  last_maintenance?: string
  next_maintenance?: string
  notes?: string
}

export interface UpdateSystemData extends Partial<CreateSystemData> {}

export interface CreateEquipmentData {
  equipment_type: string
  name: string
  system_id?: number
  model?: string
  serial_number?: string
  quantity?: number
  location?: string
  install_date?: string
  warranty_until?: string
  status?: string
  notes?: string
}

export interface UpdateEquipmentData extends Partial<CreateEquipmentData> {}

export interface CreateContactData {
  contact_type: string
  name: string
  phone?: string
  email?: string
  notes?: string
  is_primary?: boolean
}

export interface UpdateContactData extends Partial<CreateContactData> {}

export const addressesApi = {
  // Получить список адресов с пагинацией
  async getAddresses(filters?: AddressFilters): Promise<AddressListResponse> {
    const params = new URLSearchParams()
    
    if (filters?.search) params.append('search', filters.search)
    if (filters?.city) params.append('city', filters.city)
    if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active))
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.size) params.append('size', String(filters.size))

    const { data } = await apiClient.get<AddressListResponse>(
      `/addresses?${params.toString()}`
    )
    return data
  },

  // Поиск адресов для автокомплита
  async searchAddresses(query: string, limit = 10): Promise<AddressSearchResult[]> {
    const { data } = await apiClient.get<AddressSearchResult[]>(
      `/addresses/search?q=${encodeURIComponent(query)}&limit=${limit}`
    )
    return data
  },

  // Найти адрес по компонентам (город, улица, дом, корпус)
  async findByComponents(city: string, street: string, building: string, corpus?: string): Promise<AddressSearchResult | null> {
    const params = new URLSearchParams()
    params.append('city', city)
    params.append('street', street)
    params.append('building', building)
    if (corpus && corpus !== 'none') {
      params.append('corpus', corpus)
    }
    
    const { data } = await apiClient.get<AddressSearchResult | null>(
      `/addresses/find-by-components?${params.toString()}`
    )
    return data
  },

  // Получить адрес по ID
  async getAddress(id: number): Promise<Address> {
    const { data } = await apiClient.get<Address>(`/addresses/${id}`)
    return data
  },

  // Создать новый адрес
  async createAddress(addressData: CreateAddressData): Promise<Address> {
    const { data } = await apiClient.post<Address>('/addresses', addressData)
    return data
  },

  // Обновить адрес
  async updateAddress(id: number, addressData: UpdateAddressData): Promise<Address> {
    const { data } = await apiClient.put<Address>(`/addresses/${id}`, addressData)
    return data
  },

  // Удалить адрес
  async deleteAddress(id: number): Promise<void> {
    await apiClient.delete(`/addresses/${id}`)
  },

  // Деактивировать адрес
  async deactivateAddress(id: number): Promise<Address> {
    const { data } = await apiClient.post<Address>(`/addresses/${id}/deactivate`)
    return data
  },

  // Парсинг полного адреса на составные части
  async parseAddress(address: string): Promise<{ city: string | null; street: string | null; building: string | null; corpus: string | null; entrance: string | null }> {
    const { data } = await apiClient.post<{ city: string | null; street: string | null; building: string | null; corpus: string | null; entrance: string | null }>(
      '/addresses/parse',
      { address }
    )
    return data
  },

  // Сборка полного адреса из частей
  async composeAddress(parts: { city?: string; street?: string; building?: string; corpus?: string; entrance?: string }): Promise<{ address: string }> {
    const { data } = await apiClient.post<{ address: string }>(
      '/addresses/compose',
      parts
    )
    return data
  },

  // ============================================
  // Расширенная карточка объекта
  // ============================================

  // Получить полную информацию об адресе
  async getAddressFull(id: number): Promise<AddressFull> {
    const { data } = await apiClient.get<AddressFull>(`/addresses/${id}/full`)
    return data
  },

  // --- Системы ---
  
  async getSystems(addressId: number): Promise<AddressSystem[]> {
    const { data } = await apiClient.get<AddressSystem[]>(`/addresses/${addressId}/systems`)
    return data
  },

  async createSystem(addressId: number, systemData: CreateSystemData): Promise<AddressSystem> {
    const { data } = await apiClient.post<AddressSystem>(`/addresses/${addressId}/systems`, systemData)
    return data
  },

  async updateSystem(addressId: number, systemId: number, systemData: UpdateSystemData): Promise<AddressSystem> {
    const { data } = await apiClient.put<AddressSystem>(`/addresses/${addressId}/systems/${systemId}`, systemData)
    return data
  },

  async deleteSystem(addressId: number, systemId: number): Promise<void> {
    await apiClient.delete(`/addresses/${addressId}/systems/${systemId}`)
  },

  // --- Оборудование ---
  
  async getEquipment(addressId: number, systemId?: number): Promise<AddressEquipment[]> {
    const params = systemId ? `?system_id=${systemId}` : ''
    const { data } = await apiClient.get<AddressEquipment[]>(`/addresses/${addressId}/equipment${params}`)
    return data
  },

  async createEquipment(addressId: number, equipmentData: CreateEquipmentData): Promise<AddressEquipment> {
    const { data } = await apiClient.post<AddressEquipment>(`/addresses/${addressId}/equipment`, equipmentData)
    return data
  },

  async updateEquipment(addressId: number, equipmentId: number, equipmentData: UpdateEquipmentData): Promise<AddressEquipment> {
    const { data } = await apiClient.put<AddressEquipment>(`/addresses/${addressId}/equipment/${equipmentId}`, equipmentData)
    return data
  },

  async deleteEquipment(addressId: number, equipmentId: number): Promise<void> {
    await apiClient.delete(`/addresses/${addressId}/equipment/${equipmentId}`)
  },

  // --- Документы ---
  
  async getDocuments(addressId: number): Promise<AddressDocument[]> {
    const { data } = await apiClient.get<AddressDocument[]>(`/addresses/${addressId}/documents`)
    return data
  },

  async uploadDocument(
    addressId: number, 
    file: File, 
    docType: string, 
    name?: string,
    validFrom?: string,
    validUntil?: string,
    notes?: string
  ): Promise<AddressDocument> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('doc_type', docType)
    if (name) formData.append('name', name)
    if (validFrom) formData.append('valid_from', validFrom)
    if (validUntil) formData.append('valid_until', validUntil)
    if (notes) formData.append('notes', notes)
    
    const { data } = await apiClient.post<AddressDocument>(
      `/addresses/${addressId}/documents`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data
  },

  getDocumentDownloadUrl(addressId: number, documentId: number): string {
    return `/api/addresses/${addressId}/documents/${documentId}/download`
  },

  async deleteDocument(addressId: number, documentId: number): Promise<void> {
    await apiClient.delete(`/addresses/${addressId}/documents/${documentId}`)
  },

  // --- Контакты ---
  
  async getContacts(addressId: number): Promise<AddressContact[]> {
    const { data } = await apiClient.get<AddressContact[]>(`/addresses/${addressId}/contacts`)
    return data
  },

  async createContact(addressId: number, contactData: CreateContactData): Promise<AddressContact> {
    const { data } = await apiClient.post<AddressContact>(`/addresses/${addressId}/contacts`, contactData)
    return data
  },

  async updateContact(addressId: number, contactId: number, contactData: UpdateContactData): Promise<AddressContact> {
    const { data } = await apiClient.put<AddressContact>(`/addresses/${addressId}/contacts/${contactId}`, contactData)
    return data
  },

  async deleteContact(addressId: number, contactId: number): Promise<void> {
    await apiClient.delete(`/addresses/${addressId}/contacts/${contactId}`)
  },

  // --- История ---
  
  async getHistory(addressId: number, limit?: number): Promise<AddressHistory[]> {
    const params = limit ? `?limit=${limit}` : ''
    const { data } = await apiClient.get<AddressHistory[]>(`/addresses/${addressId}/history${params}`)
    return data
  },

  // --- Заявки по адресу ---
  
  async getAddressTasks(addressId: number, status?: string, limit?: number): Promise<any[]> {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (limit) params.append('limit', String(limit))
    const queryString = params.toString() ? `?${params.toString()}` : ''
    
    const { data } = await apiClient.get<any[]>(`/addresses/${addressId}/tasks${queryString}`)
    return data
  },

  // ============================================
  // Автоподставление (Autocomplete)
  // ============================================

  // Получить список городов для автоподставления
  async autocompleteCities(query = '', limit = 10): Promise<string[]> {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    params.append('limit', String(limit))
    
    const { data } = await apiClient.get<string[]>(`/addresses/autocomplete/cities?${params.toString()}`)
    return data
  },

  // Получить список улиц для автоподставления
  async autocompleteStreets(query = '', city?: string, limit = 10): Promise<string[]> {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (city) params.append('city', city)
    params.append('limit', String(limit))
    
    const { data } = await apiClient.get<string[]>(`/addresses/autocomplete/streets?${params.toString()}`)
    return data
  },

  // Получить список домов для автоподставления
  async autocompleteBuildings(query = '', city?: string, street?: string, limit = 20): Promise<string[]> {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (city) params.append('city', city)
    if (street) params.append('street', street)
    params.append('limit', String(limit))
    
    const { data } = await apiClient.get<string[]>(`/addresses/autocomplete/buildings?${params.toString()}`)
    return data
  },

  // Получить список корпусов для адреса
  async autocompleteCorpus(city: string, street: string, building: string, limit = 20): Promise<string[]> {
    const params = new URLSearchParams()
    params.append('city', city)
    params.append('street', street)
    params.append('building', building)
    params.append('limit', String(limit))
    
    const { data } = await apiClient.get<string[]>(`/addresses/autocomplete/corpus?${params.toString()}`)
    return data
  },

  // Получить список подъездов для адреса
  async autocompleteEntrance(city: string, street: string, building: string, corpus?: string, limit = 20): Promise<string[]> {
    const params = new URLSearchParams()
    params.append('city', city)
    params.append('street', street)
    params.append('building', building)
    if (corpus) params.append('corpus', corpus)
    params.append('limit', String(limit))
    
    const { data } = await apiClient.get<string[]>(`/addresses/autocomplete/entrance?${params.toString()}`)
    return data
  },

  // Поиск полных адресов для заявок
  async autocompleteFullAddress(query: string, limit = 10): Promise<AddressSearchResult[]> {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    params.append('limit', String(limit))
    
    const { data } = await apiClient.get<AddressSearchResult[]>(`/addresses/autocomplete/full?${params.toString()}`)
    return data
  },
}

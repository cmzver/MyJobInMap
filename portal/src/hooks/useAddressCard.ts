/**
 * React Query хуки для расширенной карточки адреса
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addressesApi, CreateSystemData, UpdateSystemData, CreateEquipmentData, UpdateEquipmentData, CreateContactData, UpdateContactData } from '@/api/addresses'
import type { AddressFull, AddressSystem, AddressEquipment, AddressDocument, AddressContact, AddressHistory } from '@/types/address'

// Query Keys
export const addressCardKeys = {
  all: ['addressCard'] as const,
  full: (id: number) => [...addressCardKeys.all, 'full', id] as const,
  systems: (id: number) => [...addressCardKeys.all, 'systems', id] as const,
  equipment: (id: number, systemId?: number) => [...addressCardKeys.all, 'equipment', id, systemId] as const,
  documents: (id: number) => [...addressCardKeys.all, 'documents', id] as const,
  contacts: (id: number) => [...addressCardKeys.all, 'contacts', id] as const,
  history: (id: number) => [...addressCardKeys.all, 'history', id] as const,
  tasks: (id: number) => [...addressCardKeys.all, 'tasks', id] as const,
}

// ============================================
// Полная карточка
// ============================================

export function useAddressFull(addressId: number, enabled = true) {
  return useQuery<AddressFull>({
    queryKey: addressCardKeys.full(addressId),
    queryFn: () => addressesApi.getAddressFull(addressId),
    enabled: enabled && addressId > 0,
    staleTime: 30_000, // 30 секунд
  })
}

// ============================================
// Системы
// ============================================

export function useAddressSystems(addressId: number) {
  return useQuery<AddressSystem[]>({
    queryKey: addressCardKeys.systems(addressId),
    queryFn: () => addressesApi.getSystems(addressId),
    enabled: addressId > 0,
  })
}

export function useCreateSystem(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: CreateSystemData) => addressesApi.createSystem(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.systems(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useUpdateSystem(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ systemId, data }: { systemId: number; data: UpdateSystemData }) => 
      addressesApi.updateSystem(addressId, systemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.systems(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useDeleteSystem(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (systemId: number) => addressesApi.deleteSystem(addressId, systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.systems(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

// ============================================
// Оборудование
// ============================================

export function useAddressEquipment(addressId: number, systemId?: number) {
  return useQuery<AddressEquipment[]>({
    queryKey: addressCardKeys.equipment(addressId, systemId),
    queryFn: () => addressesApi.getEquipment(addressId, systemId),
    enabled: addressId > 0,
  })
}

export function useCreateEquipment(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: CreateEquipmentData) => addressesApi.createEquipment(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.equipment(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useUpdateEquipment(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ equipmentId, data }: { equipmentId: number; data: UpdateEquipmentData }) => 
      addressesApi.updateEquipment(addressId, equipmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.equipment(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useDeleteEquipment(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (equipmentId: number) => addressesApi.deleteEquipment(addressId, equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.equipment(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

// ============================================
// Документы
// ============================================

export function useAddressDocuments(addressId: number) {
  return useQuery<AddressDocument[]>({
    queryKey: addressCardKeys.documents(addressId),
    queryFn: () => addressesApi.getDocuments(addressId),
    enabled: addressId > 0,
  })
}

export function useUploadDocument(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ file, docType, name, validFrom, validUntil, notes }: {
      file: File
      docType: string
      name?: string
      validFrom?: string
      validUntil?: string
      notes?: string
    }) => addressesApi.uploadDocument(addressId, file, docType, name, validFrom, validUntil, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.documents(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useDeleteDocument(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (documentId: number) => addressesApi.deleteDocument(addressId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.documents(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

// ============================================
// Контакты
// ============================================

export function useAddressContacts(addressId: number) {
  return useQuery<AddressContact[]>({
    queryKey: addressCardKeys.contacts(addressId),
    queryFn: () => addressesApi.getContacts(addressId),
    enabled: addressId > 0,
  })
}

export function useCreateContact(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: CreateContactData) => addressesApi.createContact(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.contacts(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useUpdateContact(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: number; data: UpdateContactData }) => 
      addressesApi.updateContact(addressId, contactId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.contacts(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

export function useDeleteContact(addressId: number) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (contactId: number) => addressesApi.deleteContact(addressId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.contacts(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(addressId) })
    },
  })
}

// ============================================
// История
// ============================================

export function useAddressHistory(addressId: number, limit?: number) {
  return useQuery<AddressHistory[]>({
    queryKey: addressCardKeys.history(addressId),
    queryFn: () => addressesApi.getHistory(addressId, limit),
    enabled: addressId > 0,
  })
}

// ============================================
// Заявки
// ============================================

export function useAddressTasks(addressId: number, status?: string, limit?: number) {
  return useQuery<any[]>({
    queryKey: [...addressCardKeys.tasks(addressId), status, limit],
    queryFn: () => addressesApi.getAddressTasks(addressId, status, limit),
    enabled: addressId > 0,
  })
}

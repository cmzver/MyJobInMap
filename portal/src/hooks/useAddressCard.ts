/**
 * React Query хуки для расширенной карточки адреса
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addressesApi, CreateSystemData, UpdateSystemData, CreateEquipmentData, UpdateEquipmentData, CreateContactData, UpdateContactData } from '@/api/addresses'
import type { AddressFull, AddressSystem, AddressEquipment, AddressDocument, AddressContact, AddressHistory } from '@/types/address'
import { useAuthStore } from '@/store/authStore'

// Query Keys
export const addressCardKeys = {
  all: (organizationId: number | null | undefined) => ['addressCard', organizationId ?? 'no-org'] as const,
  full: (organizationId: number | null | undefined, id: number) => [...addressCardKeys.all(organizationId), 'full', id] as const,
  systems: (organizationId: number | null | undefined, id: number) => [...addressCardKeys.all(organizationId), 'systems', id] as const,
  equipment: (organizationId: number | null | undefined, id: number, systemId?: number) => [...addressCardKeys.all(organizationId), 'equipment', id, systemId] as const,
  documents: (organizationId: number | null | undefined, id: number) => [...addressCardKeys.all(organizationId), 'documents', id] as const,
  contacts: (organizationId: number | null | undefined, id: number) => [...addressCardKeys.all(organizationId), 'contacts', id] as const,
  history: (organizationId: number | null | undefined, id: number) => [...addressCardKeys.all(organizationId), 'history', id] as const,
  tasks: (organizationId: number | null | undefined, id: number) => [...addressCardKeys.all(organizationId), 'tasks', id] as const,
}

// ============================================
// Полная карточка
// ============================================

export function useAddressFull(addressId: number, enabled = true) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<AddressFull>({
    queryKey: addressCardKeys.full(organizationId, addressId),
    queryFn: () => addressesApi.getAddressFull(addressId),
    enabled: enabled && addressId > 0,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

// ============================================
// Системы
// ============================================

export function useAddressSystems(addressId: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<AddressSystem[]>({
    queryKey: addressCardKeys.systems(organizationId, addressId),
    queryFn: () => addressesApi.getSystems(addressId),
    enabled: addressId > 0,
  })
}

export function useCreateSystem(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (data: CreateSystemData) => addressesApi.createSystem(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.systems(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useUpdateSystem(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: ({ systemId, data }: { systemId: number; data: UpdateSystemData }) => 
      addressesApi.updateSystem(addressId, systemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.systems(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useDeleteSystem(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (systemId: number) => addressesApi.deleteSystem(addressId, systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.systems(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

// ============================================
// Оборудование
// ============================================

export function useAddressEquipment(addressId: number, systemId?: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<AddressEquipment[]>({
    queryKey: addressCardKeys.equipment(organizationId, addressId, systemId),
    queryFn: () => addressesApi.getEquipment(addressId, systemId),
    enabled: addressId > 0,
  })
}

export function useCreateEquipment(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (data: CreateEquipmentData) => addressesApi.createEquipment(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.equipment(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useUpdateEquipment(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: ({ equipmentId, data }: { equipmentId: number; data: UpdateEquipmentData }) => 
      addressesApi.updateEquipment(addressId, equipmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.equipment(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useDeleteEquipment(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (equipmentId: number) => addressesApi.deleteEquipment(addressId, equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.equipment(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

// ============================================
// Документы
// ============================================

export function useAddressDocuments(addressId: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<AddressDocument[]>({
    queryKey: addressCardKeys.documents(organizationId, addressId),
    queryFn: () => addressesApi.getDocuments(addressId),
    enabled: addressId > 0,
  })
}

export function useUploadDocument(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
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
      queryClient.invalidateQueries({ queryKey: addressCardKeys.documents(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useDeleteDocument(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (documentId: number) => addressesApi.deleteDocument(addressId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.documents(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

// ============================================
// Контакты
// ============================================

export function useAddressContacts(addressId: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<AddressContact[]>({
    queryKey: addressCardKeys.contacts(organizationId, addressId),
    queryFn: () => addressesApi.getContacts(addressId),
    enabled: addressId > 0,
  })
}

export function useCreateContact(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (data: CreateContactData) => addressesApi.createContact(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.contacts(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useUpdateContact(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: number; data: UpdateContactData }) => 
      addressesApi.updateContact(addressId, contactId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.contacts(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

export function useDeleteContact(addressId: number) {
  const queryClient = useQueryClient()
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  
  return useMutation({
    mutationFn: (contactId: number) => addressesApi.deleteContact(addressId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressCardKeys.contacts(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.full(organizationId, addressId) })
      queryClient.invalidateQueries({ queryKey: addressCardKeys.history(organizationId, addressId) })
    },
  })
}

// ============================================
// История
// ============================================

export function useAddressHistory(addressId: number, limit?: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<AddressHistory[]>({
    queryKey: addressCardKeys.history(organizationId, addressId),
    queryFn: () => addressesApi.getHistory(addressId, limit),
    enabled: addressId > 0,
  })
}

// ============================================
// Заявки
// ============================================

export function useAddressTasks(addressId: number, status?: string, limit?: number) {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)

  return useQuery<any[]>({
    queryKey: [...addressCardKeys.tasks(organizationId, addressId), status, limit],
    queryFn: () => addressesApi.getAddressTasks(addressId, status, limit),
    enabled: addressId > 0,
  })
}

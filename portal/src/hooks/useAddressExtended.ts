/**
 * React Query хуки для расширенной карточки объекта
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as addressExtendedApi from '../api/addressExtended';
import { 
  AddressSystem, 
  AddressEquipment, 
  AddressContact 
} from '../types/address';

// ===================== Full Card =====================

export const useAddressFull = (addressId: number) => {
  return useQuery({
    queryKey: ['address', addressId, 'full'],
    queryFn: () => addressExtendedApi.getAddressFull(addressId),
    enabled: !!addressId,
  });
};

// ===================== Systems =====================

export const useAddressSystems = (addressId: number) => {
  return useQuery({
    queryKey: ['address', addressId, 'systems'],
    queryFn: () => addressExtendedApi.getAddressSystems(addressId),
    enabled: !!addressId,
  });
};

export const useCreateSystem = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AddressSystem>) => 
      addressExtendedApi.createAddressSystem(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'systems'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useUpdateSystem = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemId, data }: { systemId: number; data: Partial<AddressSystem> }) =>
      addressExtendedApi.updateAddressSystem(addressId, systemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'systems'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useDeleteSystem = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (systemId: number) =>
      addressExtendedApi.deleteAddressSystem(addressId, systemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'systems'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

// ===================== Equipment =====================

export const useAddressEquipment = (addressId: number, systemId?: number) => {
  return useQuery({
    queryKey: ['address', addressId, 'equipment', systemId],
    queryFn: () => addressExtendedApi.getAddressEquipment(addressId, systemId),
    enabled: !!addressId,
  });
};

export const useCreateEquipment = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AddressEquipment>) =>
      addressExtendedApi.createAddressEquipment(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'equipment'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useUpdateEquipment = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ equipmentId, data }: { equipmentId: number; data: Partial<AddressEquipment> }) =>
      addressExtendedApi.updateAddressEquipment(addressId, equipmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'equipment'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useDeleteEquipment = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (equipmentId: number) =>
      addressExtendedApi.deleteAddressEquipment(addressId, equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'equipment'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

// ===================== Documents =====================

export const useAddressDocuments = (addressId: number, docType?: string) => {
  return useQuery({
    queryKey: ['address', addressId, 'documents', docType],
    queryFn: () => addressExtendedApi.getAddressDocuments(addressId, docType),
    enabled: !!addressId,
  });
};

export const useUploadDocument = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { 
      file: File; 
      name: string; 
      docType?: string;
      validFrom?: string;
      validUntil?: string;
      notes?: string;
    }) =>
      addressExtendedApi.uploadAddressDocument(
        addressId,
        params.file,
        params.name,
        params.docType,
        params.validFrom,
        params.validUntil,
        params.notes
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useDownloadDocument = () => {
  return useMutation({
    mutationFn: ({ addressId, documentId, fileName }: { addressId: number; documentId: number; fileName: string }) =>
      addressExtendedApi.downloadAddressDocument(addressId, documentId).then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }),
  });
};

export const useDeleteDocument = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) =>
      addressExtendedApi.deleteAddressDocument(addressId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

// ===================== Contacts =====================

export const useAddressContacts = (addressId: number) => {
  return useQuery({
    queryKey: ['address', addressId, 'contacts'],
    queryFn: () => addressExtendedApi.getAddressContacts(addressId),
    enabled: !!addressId,
  });
};

export const useCreateContact = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AddressContact>) =>
      addressExtendedApi.createAddressContact(addressId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useUpdateContact = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: number; data: Partial<AddressContact> }) =>
      addressExtendedApi.updateAddressContact(addressId, contactId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

export const useDeleteContact = (addressId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: number) =>
      addressExtendedApi.deleteAddressContact(addressId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'full'] });
      queryClient.invalidateQueries({ queryKey: ['address', addressId, 'history'] });
    },
  });
};

// ===================== History =====================

export const useAddressHistory = (addressId: number, limit: number = 50) => {
  return useQuery({
    queryKey: ['address', addressId, 'history', limit],
    queryFn: () => addressExtendedApi.getAddressHistory(addressId, limit),
    enabled: !!addressId,
  });
};

// ===================== Tasks =====================

export const useAddressTasks = (addressId: number, status?: string, limit: number = 20) => {
  return useQuery({
    queryKey: ['address', addressId, 'tasks', status, limit],
    queryFn: () => addressExtendedApi.getAddressTasks(addressId, status, limit),
    enabled: !!addressId,
  });
};

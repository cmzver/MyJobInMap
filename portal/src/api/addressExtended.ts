/**
 * API клиент для расширенной карточки объекта
 */
import api from './client';
import { 
  AddressSystem, 
  AddressEquipment, 
  AddressDocument, 
  AddressContact,
  AddressHistory,
  AddressFull 
} from '../types/address';

// ===================== Full Card =====================

export const getAddressFull = async (addressId: number): Promise<AddressFull> => {
  const response = await api.get(`/api/addresses/${addressId}/full`);
  return response.data;
};

// ===================== Systems =====================

export const getAddressSystems = async (addressId: number): Promise<AddressSystem[]> => {
  const response = await api.get(`/api/addresses/${addressId}/systems`);
  return response.data;
};

export const createAddressSystem = async (addressId: number, data: Partial<AddressSystem>): Promise<AddressSystem> => {
  const response = await api.post(`/api/addresses/${addressId}/systems`, data);
  return response.data;
};

export const updateAddressSystem = async (addressId: number, systemId: number, data: Partial<AddressSystem>): Promise<AddressSystem> => {
  const response = await api.put(`/api/addresses/${addressId}/systems/${systemId}`, data);
  return response.data;
};

export const deleteAddressSystem = async (addressId: number, systemId: number): Promise<void> => {
  await api.delete(`/api/addresses/${addressId}/systems/${systemId}`);
};

// ===================== Equipment =====================

export const getAddressEquipment = async (addressId: number, systemId?: number): Promise<AddressEquipment[]> => {
  const params = systemId ? { system_id: systemId } : {};
  const response = await api.get(`/api/addresses/${addressId}/equipment`, { params });
  return response.data;
};

export const createAddressEquipment = async (addressId: number, data: Partial<AddressEquipment>): Promise<AddressEquipment> => {
  const response = await api.post(`/api/addresses/${addressId}/equipment`, data);
  return response.data;
};

export const updateAddressEquipment = async (addressId: number, equipmentId: number, data: Partial<AddressEquipment>): Promise<AddressEquipment> => {
  const response = await api.put(`/api/addresses/${addressId}/equipment/${equipmentId}`, data);
  return response.data;
};

export const deleteAddressEquipment = async (addressId: number, equipmentId: number): Promise<void> => {
  await api.delete(`/api/addresses/${addressId}/equipment/${equipmentId}`);
};

// ===================== Documents =====================

export const getAddressDocuments = async (addressId: number, docType?: string): Promise<AddressDocument[]> => {
  const params = docType ? { doc_type: docType } : {};
  const response = await api.get(`/api/addresses/${addressId}/documents`, { params });
  return response.data;
};

export const uploadAddressDocument = async (
  addressId: number, 
  file: File, 
  name: string, 
  docType: string = 'other',
  validFrom?: string,
  validUntil?: string,
  notes?: string
): Promise<AddressDocument> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  formData.append('doc_type', docType);
  if (validFrom) formData.append('valid_from', validFrom);
  if (validUntil) formData.append('valid_until', validUntil);
  if (notes) formData.append('notes', notes);

  const response = await api.post(`/api/addresses/${addressId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const downloadAddressDocument = async (addressId: number, documentId: number): Promise<Blob> => {
  const response = await api.get(`/api/addresses/${addressId}/documents/${documentId}/download`, {
    responseType: 'blob'
  });
  return response.data;
};

export const deleteAddressDocument = async (addressId: number, documentId: number): Promise<void> => {
  await api.delete(`/api/addresses/${addressId}/documents/${documentId}`);
};

// ===================== Contacts =====================

export const getAddressContacts = async (addressId: number): Promise<AddressContact[]> => {
  const response = await api.get(`/api/addresses/${addressId}/contacts`);
  return response.data;
};

export const createAddressContact = async (addressId: number, data: Partial<AddressContact>): Promise<AddressContact> => {
  const response = await api.post(`/api/addresses/${addressId}/contacts`, data);
  return response.data;
};

export const updateAddressContact = async (addressId: number, contactId: number, data: Partial<AddressContact>): Promise<AddressContact> => {
  const response = await api.put(`/api/addresses/${addressId}/contacts/${contactId}`, data);
  return response.data;
};

export const deleteAddressContact = async (addressId: number, contactId: number): Promise<void> => {
  await api.delete(`/api/addresses/${addressId}/contacts/${contactId}`);
};

// ===================== History =====================

export const getAddressHistory = async (addressId: number, limit: number = 50): Promise<AddressHistory[]> => {
  const response = await api.get(`/api/addresses/${addressId}/history`, { params: { limit } });
  return response.data;
};

// ===================== Tasks =====================

export interface AddressTask {
  id: number;
  task_number: string;
  title: string;
  status: string;
  priority: number;
  created_at: string;
  assigned_user: string | null;
}

export const getAddressTasks = async (addressId: number, status?: string, limit: number = 20): Promise<AddressTask[]> => {
  const params: Record<string, any> = { limit };
  if (status) params.status = status;
  const response = await api.get(`/api/addresses/${addressId}/tasks`, { params });
  return response.data;
};
